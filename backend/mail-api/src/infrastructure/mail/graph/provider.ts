import { z } from "zod";
import { OperationError } from "../../../application/index.js";
import type { FolderSource } from "../../../application/mail/index.js";
import type {
  MessageChangeSource,
  MessageChange,
} from "../../../application/synchronization/index.js";
import type { AccessTokenSource } from "../../../application/authentication/index.js";
import {
  messageMetadata,
  isMailIdentifier,
  type Folder,
} from "../../../domain/mail/index.js";
const base = "https://graph.microsoft.com";
const absent = Symbol("missing message");
const folder = z.object({
  id: z.custom<string>(isMailIdentifier),
  displayName: z.string(),
  parentFolderId: z.string().optional(),
  childFolderCount: z.number().int().nonnegative(),
});
const message = z.object({
  id: z.custom<string>(isMailIdentifier),
  conversationId: z.custom<string>(isMailIdentifier),
  subject: z.string().nullable(),
  receivedDateTime: z.iso.datetime().nullable().optional(),
  isRead: z.boolean(),
});
const collection = z.object({
  value: z.array(z.unknown()),
  "@odata.nextLink": z.url().optional(),
  "@odata.deltaLink": z.url().optional(),
});
const select =
  "id,conversationId,subject,receivedDateTime,isRead,parentFolderId";
export class GraphProvider implements FolderSource, MessageChangeSource {
  private readonly prefix: string;
  constructor(
    private readonly tokens: AccessTokenSource,
    mailboxId: string,
    private readonly request: typeof fetch = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {
    this.prefix = `/v1.0/users/${encodeURIComponent(mailboxId)}/`;
  }
  private validate(link: string): string {
    let url: URL;
    try {
      url = new URL(link, base);
    } catch {
      throw new OperationError("invalid_response");
    }
    if (
      url.origin !== base ||
      url.username ||
      url.password ||
      url.hash ||
      !url.pathname.startsWith(this.prefix)
    )
      throw new OperationError("invalid_response");
    return url.href;
  }
  private async get(link: string, missingMessage = false): Promise<unknown> {
    const url = this.validate(link);
    let refreshed = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      let response: Response;
      try {
        response = await this.request(url, {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${await this.tokens.token(refreshed)}`,
            Prefer: 'IdType="ImmutableId"',
            Accept: "application/json",
          },
        });
      } catch (error) {
        if (error instanceof OperationError) throw error;
        if (attempt === 3) throw new OperationError("provider_unavailable");
        await this.sleep(250 * 2 ** attempt);
        continue;
      }
      if (response.ok) {
        try {
          return await response.json();
        } catch {
          throw new OperationError("invalid_response");
        }
      }
      // A message can disappear between its delta record and partial-record hydration.
      if (response.status === 404 && missingMessage) return absent;
      // Never forward provider error messages or returned locations into logs or requests.
      const body: unknown = await response.json().catch(() => null);
      const code = z
        .object({ error: z.object({ code: z.string() }) })
        .safeParse(body);
      if (
        response.status === 410 ||
        (response.status === 400 &&
          code.success &&
          code.data.error.code === "syncStateNotFound")
      )
        throw new OperationError("invalid_cursor");
      if (response.status === 401 && !refreshed && attempt < 3) {
        refreshed = true;
        continue;
      }
      if (response.status === 401 || response.status === 403)
        throw new OperationError("authorization_required");
      if (![429, 502, 503, 504].includes(response.status) || attempt === 3)
        throw new OperationError("provider_unavailable");
      const raw = response.headers.get("retry-after");
      const wait =
        raw === null
          ? 250 * 2 ** attempt
          : /^\d+$/.test(raw)
            ? Number(raw) * 1000
            : Math.max(0, Date.parse(raw) - Date.now());
      // Never cap Retry-After downwards and retry too early. Defer to a later explicit job instead.
      if (!Number.isFinite(wait) || wait > 30000)
        throw new OperationError("provider_unavailable");
      await this.sleep(wait);
    }
    throw new OperationError("provider_unavailable");
  }
  private async page(link: string) {
    const parsed = collection.safeParse(await this.get(link));
    if (!parsed.success) throw new OperationError("invalid_response");
    const page = parsed.data;
    if (page["@odata.nextLink"]) this.validate(page["@odata.nextLink"]);
    if (page["@odata.deltaLink"]) this.validate(page["@odata.deltaLink"]);
    return page;
  }
  async folders(): Promise<Folder[]> {
    const result: Folder[] = [];
    const queue = [
      `${this.prefix}mailFolders?$top=100&$select=id,displayName,parentFolderId,childFolderCount`,
    ];
    const visited = new Set<string>();
    while (queue.length) {
      const url = queue.shift()!;
      if (visited.has(url) || visited.size >= 10000)
        throw new OperationError("invalid_response");
      visited.add(url);
      const page = await this.page(url);
      for (const raw of page.value) {
        const parsed = folder.safeParse(raw);
        if (!parsed.success) throw new OperationError("invalid_response");
        const f = parsed.data;
        result.push({
          id: f.id,
          name: f.displayName,
          parentId: f.parentFolderId ?? null,
        });
        if (f.childFolderCount > 0)
          queue.push(
            `${this.prefix}mailFolders/${encodeURIComponent(f.id)}/childFolders?$top=100&$select=id,displayName,parentFolderId,childFolderCount`,
          );
      }
      if (page["@odata.nextLink"]) queue.push(page["@odata.nextLink"]);
    }
    return result;
  }
  async changes(folderId: string, cursor: string | null) {
    const page = await this.page(
      cursor ??
        `${this.prefix}mailFolders/${encodeURIComponent(folderId)}/messages/delta?$select=${select}`,
    );
    const next = page["@odata.nextLink"],
      delta = page["@odata.deltaLink"];
    if (Boolean(next) === Boolean(delta))
      throw new OperationError("invalid_response");
    if (next === cursor) throw new OperationError("invalid_response");
    const changes: MessageChange[] = [];
    for (const raw of page.value) {
      const identity = z
        .object({
          id: z.custom<string>(isMailIdentifier),
          "@removed": z.object({ reason: z.string().optional() }).optional(),
        })
        .safeParse(raw);
      if (!identity.success) throw new OperationError("invalid_response");
      if (identity.data["@removed"]) {
        changes.push({ id: identity.data.id, removed: true });
        continue;
      }
      // Delta can omit unchanged properties; hydrate partial records before normalization.
      let parsed = message.safeParse(raw);
      if (!parsed.success) {
        const hydrated = await this.get(
          `${this.prefix}messages/${encodeURIComponent(identity.data.id)}?$select=${select}`,
          true,
        );
        if (hydrated === absent) {
          changes.push({ id: identity.data.id, removed: true });
          continue;
        }
        parsed = message.safeParse(hydrated);
      }
      if (!parsed.success || parsed.data.id !== identity.data.id)
        throw new OperationError("invalid_response");
      const m = parsed.data;
      changes.push({
        removed: false,
        ...messageMetadata({
          id: m.id,
          conversationId: m.conversationId,
          subject: m.subject,
          receivedAt: m.receivedDateTime ?? null,
          isRead: m.isRead,
        }),
      });
    }
    return { changes, cursor: (next ?? delta)!, complete: !next };
  }
}

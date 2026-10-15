export interface Folder {
  id: string;
  name: string;
}
export interface Job {
  id: string;
  status: string;
  pages: number;
  error_code: string | null;
}
export interface Conversation {
  id: string;
  subject: string;
  messageCount: number;
}
export function api(token: string, transport: typeof fetch = fetch) {
  return async function request<T>(path: string, method = "GET"): Promise<T> {
    const response = await transport(`/api/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        `Request failed (${response.status}). Check backend access and job status.`,
      );
    return response.json() as Promise<T>;
  };
}

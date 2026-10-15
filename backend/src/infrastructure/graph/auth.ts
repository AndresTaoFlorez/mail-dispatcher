import {
  ConfidentialClientApplication,
  type ClientCredentialRequest,
} from "@azure/msal-node";
import { IntakeError } from "../../domain/mail.js";
export interface TokenSource {
  token(forceRefresh?: boolean): Promise<string>;
}
export function msalTokens(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): TokenSource {
  const client = new ConfidentialClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
    system: {
      loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} },
    },
  });
  return tokenSource(client);
}

interface CredentialClient {
  acquireTokenByClientCredential(
    request: ClientCredentialRequest,
  ): Promise<{ accessToken: string } | null>;
}

export function tokenSource(client: CredentialClient): TokenSource {
  return {
    async token(forceRefresh = false) {
      try {
        const result = await client.acquireTokenByClientCredential({
          scopes: ["https://graph.microsoft.com/.default"],
          skipCache: forceRefresh,
        });
        if (!result?.accessToken) throw new Error();
        return result.accessToken;
      } catch {
        throw new IntakeError("authorization_required");
      }
    },
  };
}

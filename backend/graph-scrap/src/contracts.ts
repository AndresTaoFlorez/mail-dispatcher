export interface Credentials {
  mail: string;
  password: string;
}
export interface CapturedToken {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
}
export interface TokenCapture {
  capture(credentials: Credentials): Promise<CapturedToken>;
}
export class CaptureError extends Error {
  constructor(
    public readonly code:
      | "authentication_rejected"
      | "interactive_required"
      | "consent_required"
      | "capture_timeout"
      | "unsupported_token"
      | "capture_unavailable",
  ) {
    super(code);
  }
}

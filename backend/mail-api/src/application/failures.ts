/** Stable application failures; HTTP and provider representations belong outside. */
export class OperationError extends Error {
  constructor(
    public readonly code:
      | "provider_unavailable"
      | "authorization_required"
      | "invalid_cursor"
      | "invalid_response"
      | "lease_lost"
      | "login_required"
      | "login_not_supported"
      | "authentication_busy"
      | "authentication_failed"
      | "interactive_required",
  ) {
    super(code);
  }
}

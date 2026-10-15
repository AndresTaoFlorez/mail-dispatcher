export interface AccessTokenSource {
  token(forceRefresh?: boolean): Promise<string>;
}

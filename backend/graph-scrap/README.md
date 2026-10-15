# Graph Scrap

An optional, isolated authentication service. `POST /token` receives `{mail,password}` and returns `{accessToken,tokenType,expiresAt}` after an authorized Graph Explorer sign-in. It does not read mail, grant permissions, provide a refresh token, or change tenant policy. Supported Entra/MSAL application authentication remains available in the main API.

Use only for accounts and flows you are authorized to automate. MFA, consent prompts, conditional-access/unsupported login challenges stop the attempt; they are not bypassed. The current adapter uses English UI labels and the visible token tab of the official Graph Explorer site. Live site markup, account policies, and successful tenant login are **not** verified by synthetic tests. The website is fixed in code; callers cannot select a credential destination.

## Self-contained Docker service

From the repository root, copy this directory's `.env.example` to `.env` and set a random, separate service key. Do not put mailbox passwords in that file.

```sh
docker compose --env-file backend/graph-scrap/.env -f backend/graph-scrap/compose.yml up --build -d
```

The image pins Playwright and its matching official browser image. Chromium and OS dependencies are contained in Docker; no host browser/profile is used. The service runs as `pwuser`, publishes only `127.0.0.1:3101`, drops Linux capabilities, uses no-new-privileges, and places temporary browser state in a memory-backed `/tmp`. It has no credential/session volume. One capture runs at a time in a fresh browser/context, with a bounded attempt and cleanup on success/failure. No automatic credential retries or stored passwords are used. Each requested login remains a sensitive operation.

Every route requires `Authorization: Bearer <GRAPH_SCRAP_API_KEY>`. `GET /health` is a safe authenticated readiness check. The token endpoint accepts only mail/password, refuses origin-bearing requests, and sets `Cache-Control: no-store`. Tokens/passwords and raw upstream errors are never logged. JWT audience/expiry screening is not signature verification; the main API requires Graph itself to accept the token before activating its mailbox session.

For main-API use, set its mode to `graph-scrap`, its URL to `http://127.0.0.1:3101`, and the same service key. Its separate operator key is still required. A secure local PowerShell prompt can avoid embedding a mailbox password in shell history:

```powershell
$credential = Get-Credential
$body = @{ mail = $credential.UserName; password = $credential.GetNetworkCredential().Password } | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:3100/api/auth/login -Method Post -Headers @{ Authorization = "Bearer $env:API_TOKEN" } -ContentType application/json -Body $body
Remove-Variable credential, body
```

The main route returns status, not the token. Do not send credentials through chat, public endpoints, or a terminal command containing a literal password. This local development setup is not production identity/session management.

## Verification without real accounts

```sh
docker build --target verify -t mail-dispatcher-graph-scrap:verify -f backend/graph-scrap/Dockerfile .
docker run --rm --init --shm-size=256m --tmpfs /tmp:size=256m,mode=1777 mail-dispatcher-graph-scrap:verify
```

This target executes real Chromium against fully intercepted synthetic portal pages, including an MFA refusal case. All fixture tokens/passwords are synthetic; no Microsoft request or real account is used. Normal local tests run endpoint/token-validation tests and skip the two browser tests unless `GRAPH_SCRAP_BROWSER_TESTS=1`. The runtime image target is separate from verification and does not use fixture mode.

Primary implementation references: [official Graph Explorer UI](https://github.com/microsoftgraph/microsoft-graph-explorer-v4/blob/dev/src/app/views/query-runner/request/auth/Auth.tsx) and [Playwright Docker guidance](https://playwright.dev/docs/docker). No private reference service source, infrastructure settings, or account data were copied.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { api, type Folder, type Job, type Conversation } from "./api.js";
import "./style.css";
function App() {
  const [token, setToken] = useState(""),
    [folders, setFolders] = useState<Folder[]>([]),
    [jobs, setJobs] = useState<Job[]>([]),
    [conversations, setConversations] = useState<Conversation[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = api(token);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const [f, j, c] = await Promise.all([
      request<Folder[]>("folders"),
      request<Job[]>("jobs"),
      request<Conversation[]>("conversations?limit=50&offset=0"),
    ]);
    setFolders(f);
    setJobs(j);
    setConversations(c);
  }
  return (
    <main>
      <h1>Mail Dispatcher</h1>
      <p>Read-only mailbox intake · local development console</p>
      <p>No email is moved, marked read, sent, or assigned.</p>
      <label>
        Local API token{" "}
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setFolders([]);
            setJobs([]);
            setConversations([]);
          }}
        />
      </label>
      <p>
        The token stays in this page's memory. Do not use this development
        console as a shared deployment.
      </p>
      <button disabled={busy || !token} onClick={() => void run(refresh)}>
        Refresh persisted state
      </button>{" "}
      <button
        disabled={busy || !token}
        onClick={() =>
          void run(async () => {
            setFolders(await request<Folder[]>("folders/discover", "POST"));
          })
        }
      >
        Discover folders via Graph
      </button>
      {busy && <p role="status">Working…</p>}
      {error && <p role="alert">{error}</p>}
      <h2>Folders</h2>
      <ul>
        {folders.map((f) => (
          <li key={f.id}>
            {f.name}{" "}
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await request(
                    `folders/${encodeURIComponent(f.id)}/sync`,
                    "POST",
                  );
                  await refresh();
                })
              }
            >
              Queue read-only sync
            </button>
          </li>
        ))}
      </ul>
      <h2>Recent jobs (up to 100)</h2>
      <ul>
        {jobs.map((j) => (
          <li key={j.id}>
            {j.status} · {j.pages} pages{j.error_code && ` · ${j.error_code}`}
          </li>
        ))}
      </ul>
      <h2>Persisted conversations (first 50)</h2>
      <ul>
        {conversations.map((c) => (
          <li key={c.id}>
            {c.subject || "(No subject)"} · {c.messageCount} messages
          </li>
        ))}
      </ul>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

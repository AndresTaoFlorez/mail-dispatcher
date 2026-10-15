# Frontend

React/TypeScript local console. Lists folders, queues explicit sync, and displays recent jobs and the first 50 conversation groups. It consumes only the backend and receives no Graph tokens or database credentials.

From the root:

- `npm run dev -w frontend`: Vite at `http://127.0.0.1:5173`; `/api` proxies to backend port 3100.
- `npm run typecheck -w frontend`
- `npm run test -w frontend`: HTTP adapter tests, not browser tests.
- `npm run build -w frontend`: output in `frontend/dist/`.

Enter the local backend token manually. It stays in React memory, never browser storage, and disappears on reload. Discovery contacts Graph; refresh reads PostgreSQL only. Refresh is explicit, not automatic polling. Subjects render as text, never message HTML.

The backend runs separately. It does not automatically host the static build. Shared hosting, end-user sessions, assignments, and specialist management remain later work.

# Python business references

These modules preserve assignment/application/domain/persistence behavior for a future TypeScript migration. There is no Python HTTP application or launcher. The running backend is `../backend/`; its Graph provider is the only mailbox integration.

The retained modules describe specialist configuration, work windows, WDD orchestration, assignment/ticket references, historical models, and stored-conversation queries. They are not imported by the TypeScript runtime. Importing persistence modules can construct a database engine from environment settings; do not load them against a production environment for an inspection task.

`WORKLOAD_TIMEZONE` selects the reference availability timezone (default `America/Bogota`). No removed presentation/configuration module is needed. Historical SQL remains reference material, not the new schema.

Run dependency-free integrity checks from the root with `python -m unittest discover -s api/tests -v`. Run WDD characterization using `python -m pytest wdd/tests -q`. These are not proof of a TypeScript assignment port. Optional Python dependencies for manual reference execution are listed in `requirements.txt`; the active Node runtime does not need them.

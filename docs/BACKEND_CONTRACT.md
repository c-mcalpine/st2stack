# Backend contract (Milestone 3 ↔ Milestone 5)

The **Milestone 5 validation runner** checks the generated project against a fixed contract. The **Milestone 3 backend generator** must produce a backend that satisfies this contract so validation passes.

## Backend type

- **Node only.** The validator assumes npm/Node: `package.json`, `npm ci`/`npm install`, `npm run build`, `npm run start`. No Python (e.g. FastAPI) in the generated backend.
- **Recommended:** Fastify. Generated scaffold should be Node (Fastify) per `AGENTS.md`.

## What the validator does (Milestone 5)

1. **Location:** Expects backend in `backend/` (overridable via `st2stack.validation.json`).
2. **Precheck:** Requires `backend/package.json`.
3. **Install:** Runs `npm ci` (if `package-lock.json` exists) or `npm install`.
4. **Compile:** Runs config `build` (default `npm run build`). Build can be disabled with `st2stack.validation.json` → `backend.build: null`.
5. **Start:** Runs config `start` or `npm run start` (from `package.json` scripts). **A start command is required.**
6. **Health:** Sends GET to `http://127.0.0.1:${PORT}/health` (default port 3411; validator sets `PORT` in env). Expects **200**.
7. **Env:** Injects `PORT` and `HOST=0.0.0.0` when spawning the backend process.

## What Milestone 3 must generate

So that the validator passes without any project-level `st2stack.validation.json` overrides:

| Requirement | Generator must produce |
|-------------|------------------------|
| **Layout** | `backend/` directory with `package.json`. |
| **Start** | `package.json` must include `scripts.start` (e.g. `node server.mjs` or `node src/server.mjs`). This is the **predictable start command** the validator uses. |
| **Health** | Server must register a GET route `/health` that returns status 200 (body optional; e.g. `{"ok":true}`). |
| **Port** | Server must listen on `process.env.PORT` (validator sets this). |
| **Install** | Dependencies must install with `npm install` (or ship `package-lock.json` for `npm ci`). |
| **Build** | Either: (a) provide `scripts.build` that succeeds (e.g. `node --check server.mjs` for JS-only), or (b) ship `st2stack.validation.json` with `{"backend":{"build":null}}` so the validator skips compile. |

## Optional: validation config

Generated output may include `st2stack.validation.json` at project root to override defaults (e.g. `backend.build: null` if there is no build step). The validator merges this over defaults.

## Summary

- **Backend is Node** (Fastify). Validator assumes Node; M3 must generate Node.
- **Predictable start:** `npm run start` (backed by `scripts.start`).
- **GET /health** returns 200; server listens on **PORT** from env.
- Aligning M3 to this contract ensures M5 validation passes with no manual tweaks.

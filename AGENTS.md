# AGENTS.md — st2stack (v0)

## Objective
Build v0 of "st2stack": convert a single-file Streamlit app into a runnable scaffold:
- backend: FastAPI
- frontend: Next.js (App Router)
- shared: typed schemas
- deliverable: zip artifact + local docker-compose that boots

This is NOT a pixel-perfect UI converter. It is a deterministic scaffold generator.

## Non-goals (do not implement)
- multipage Streamlit
- tabs/columns nesting
- auth/permissions
- websockets/realtime
- background jobs
- perfect reactivity (v0 may use "Run" button)
- broad framework support (v0 targets Next.js+FastAPI only)

## Working agreements
- Prefer deterministic parsing + template-based codegen. Use LLM only for naming/TODO text.
- Always keep output runnable even with unsupported features (stub + TODO).
- Fail closed: if unsupported constructs are detected, emit warnings and stub endpoints.
- Maintain a visible IR artifact (ir.json) in job output.
- No breaking changes without updating docs/PRD.md and docs/ACCEPTANCE_TESTS.md.

## Required commands (must keep passing)
- `make lint` (or equivalent) if present
- `make test` (or equivalent) if present
- `docker compose up` must boot frontend + backend for generated output

## Coding conventions
- Python 3.11+
- Backend: FastAPI + Pydantic v2
- Frontend: Next.js + TypeScript + Tailwind + shadcn/ui (minimal)
- Add type hints and basic error handling.
- Add unit tests for IR parsing and endpoint/schema generation.

## Deliverables checklist (definition of done)
- CLI supports: estimate, convert, status, download
- Web UI supports: upload/connect, estimate, run, logs, download
- Worker pipeline: ingest → scan → IR → generate → validate → package
- Validation runner enforces build/boot checks
- Credits are reserved and only charged on successful validation
# Tasks — st2stack v1

Codex should implement milestones in order. Do not jump ahead.

## Milestone 0: Repo scaffold
- create packages: api/, worker/, web/, cli/
- add docker compose for platform services (db, redis) and app services
- Ensure docs are readable (not minified one-liners)
- Keep `AGENTS.md` authoritative
- Keep `schema/ir.schema.json` and `packages/ir-types` in sync with docs

Deliverable:
- `make validate-ir` works locally

## Milestone 1: Ingestion + scan
- Implement a scanner that emits `scan.json` with:
    - entry file selection
    - widgets used
    - session_state keys
    - imports/dependencies
    - env vars referenced
    - files referenced (data/model paths)
    - unsupported features detected
- Deliverable:
    - Can scan fixture and match `fixtures/.../expected/scan.json`

## Milestone 2 — AST → IR (deterministic)
Implement parser to produce IR:
- `ui_tree` containers + widgets
- `state.inputs` from widget bindings
- `compute_graph` from called functions used to produce outputs
- `backend_plan` inferred for candidate functions
- `warnings` for ambiguity/unsupported

Deliverable:
- Fixture IR matches `fixtures/.../expected/ir.json`
- `make validate-ir` passes

## Milestone 3 — Backend generator (FastAPI)
Generate:
- endpoints defined by `backend_plan.endpoints`
- Pydantic schemas from `backend_plan.schemas`
- service wrappers for compute nodes

Deliverable:
- backend boots and serves `/health`

## Milestone 4 — Frontend generator (Next.js)
Generate:
- sidebar inputs
- main outputs (metrics + table)
- “Run” button to call backend
- typed fetchers

Deliverable:
- frontend builds

## Milestone 5: Validation runner
Sandbox validate:
- backend compile + health
- frontend build + health
- docker compose smoke test

Deliverable:
- conversion is only “success” if validations pass

## Milestone 6: CLI + Web UI (minimal)
- CLI: estimate/convert/status/download
- Web: upload/estimate/run/logs/download
- IR/schema validation wired in

Deliverable:
- end-to-end conversion run produces a downloadable scaffold

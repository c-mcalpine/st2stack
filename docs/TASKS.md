# Tasks — st2stack v0

## Milestone 0: Repo scaffold
- create packages: api/, worker/, web/, cli/
- add docker compose for platform services (db, redis) and app services

## Milestone 1: Ingestion + scan
- implement scan report (scan.json)
- detect entry file
- detect supported/unsupported streamlit primitives

## Milestone 2: AST -> IR
- deterministic IR generator for v0 supported constructs
- unit tests for IR output on fixtures

## Milestone 3: Codegen
- backend generator: endpoints + schemas + service wrappers
- frontend generator: Next app + inputs + Run button + table render

## Milestone 4: Validation runner
- docker sandbox executes acceptance test pipeline

## Milestone 5: CLI
- estimate/convert/status/download

## Milestone 6: Web UI
- upload/connect, estimate screen, logs, download

## Milestone 7: E2E
- run fixture conversion and validate with acceptance tests
# PRD — st2stack v0

## Problem
Streamlit prototypes often require rewrite into institutional web stacks. This is slow and inconsistent.

## Goal
Generate a runnable scaffold (Next.js + backend, e.g. FastAPI) from a single Streamlit entry file. The st2stack platform itself (api, worker) is Node/Fastify; no Python in the platform backend.

## Inputs
- repo or zip upload
- entry file: app.py (or detected)
- requirements.txt or pyproject.toml

## Outputs
- frontend/: Next.js App Router TypeScript app
- backend/: API with extracted endpoints (generated scaffold may be FastAPI or other)
- shared/: request/response schemas
- docker-compose.yml for local boot
- job artifacts include: scan.json, ir.json, logs

## Supported Streamlit (v0)
- sidebar container
- form (single)
- selectbox, multiselect, slider, text_input, number_input, date_input
- button
- metric
- dataframe/table
- line_chart/bar_chart as placeholders

## Non-goals
- multipage apps, tabs/columns nesting, auth, realtime

## Success criteria
- Generated repo builds and boots via docker compose
- At least one end-to-end Run -> API -> render table works for supported apps
- Unsupported features are stubbed with explicit TODOs and warnings
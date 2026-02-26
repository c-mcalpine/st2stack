# IR Schema (v1) — st2stack

## Purpose

The IR (Intermediate Representation) is the deterministic contract between:

- Repo ingestion & scanning
- AST parsing & intent extraction
- Backend code generation
- Frontend code generation
- Validation runner

**Hard rule:**  
IR generation is **purely deterministic**. No LLM output is permitted inside IR.

LLMs may only generate:

- Optional naming suggestions
- TODO text
- Human-readable summaries

Those belong in separate artifacts, never in IR.

---

# Design Principles

## 1. Deterministic

Same repo + same config → identical IR.

Requirements:

- Stable ordering
- Stable node IDs
- No randomness
- No LLM influence

---

## 2. Diffable

IR must work well in Git diffs.

Rules:

- Never embed raw source code
- Store file paths + source spans
- Keep structures flat and explicit

---

## 3. Testable

IR must validate against a JSON schema.

Failure to validate = parser failure.

---

## 4. Codegen-Oriented

IR exists to drive generators.

If a generator must guess → IR is missing data.

---

## 5. Fail-Closed

If inference is unsafe:

- Emit warning
- Stub behavior
- Keep scaffold runnable

---

# Top-Level IR Object

```json
{
  "ir_version": "1.0.0",
  "generated_at": "ISO8601",
  "app": {},
  "ui_tree": [],
  "state": {},
  "compute_graph": [],
  "backend_plan": {},
  "assets": {},
  "warnings": []
}
```

## 1. App Metadata
Purpose

Environment + provenance + dependency context.

```json
"app": {
  "entry_file": "app.py",
  "framework": "streamlit",
  "streamlit_version": "1.31.0",
  "python_version": "3.11",
  "dependencies": [],
  "env_vars": [],
  "repo": {
    "source": "github | upload",
    "ref": "main",
    "commit": "hash"
  }
}
```

Rules
- framework fixed to "streamlit"
- Versions are best-effort
- dependencies inferred from imports
- env_vars inferred from scan

## 2. UI Tree (Intent Graph)

Purpose
Describe UI structure and interaction primitives.
NOT layout fidelity. NOT styling.

Node Types
Container Node
```json
{
  "id": "sidebar",
  "kind": "container",
  "container_type": "sidebar | main | form",
  "children": []
}
```

Input Node

Supported widgets: selectbox, multiselect, slider, text_input, number_input, date_input, checkbox, **button** (e.g. Run / Submit in finance workflows).

```json
{
  "id": "start_date",
  "kind": "input",
  "widget": "date_input",
  "label": "Start date",
  "binds_to": "start_date",
  "data_type": "date | number | string | boolean",
  "default": null,
  "source_span": {
    "file": "app.py",
    "line_start": 10,
    "line_end": 12
  }
}
```

Button example (e.g. Run):
```json
{
  "id": "run_btn",
  "kind": "input",
  "widget": "button",
  "label": "Run",
  "binds_to": "run_clicked",
  "data_type": "boolean",
  "source_span": { "file": "app.py", "line_start": 5, "line_end": 5 }
}
```

Output Node
```json
{
  "id": "main_table",
  "kind": "output",
  "widget": "dataframe | metric | chart",
  "source": "filtered_df"
}
```

UI Rules
- Tree structure is explicit
- Nesting only via containers
- No layout coordinates
- No CSS/styling metadata
- Every node has stable id

## 3. State Model

Purpose
Make implicit Streamlit state explicit.

Inputs
```json
"inputs": {
  "start_date": {
    "data_type": "date",
    "source": "ui"
  }
}
```

Derived State
```json
"derived": {
  "filtered_df": {
    "depends_on": ["start_date", "end_date"],
    "computed_by": "filter_data"
  }
}
```

Session State
```json
"session": {
  "selected_rows": {
    "data_type": "list",
    "writes": [],
    "reads": []
  }
}
```

State Rules
- No UI logic here
- No backend logic here
- Pure dependency model
- Deterministic relationships

## 4. Compute Graph

Purpose
Describe computational dependencies & backend extraction candidates.

Function Node
```json
{
  "id": "filter_data",
  "kind": "function",
  "source_span": {
    "file": "app.py",
    "line_start": 30,
    "line_end": 55
  },
  "inputs": ["raw_df", "start_date", "end_date"],
  "outputs": ["filtered_df"],
  "side_effects": [],
  "candidate_for_backend": true
}
```
Compute Rules
- Only pure logic representation
- No framework assumptions
- Side effects explicitly declared:
    - file_io
    - network
    - model_load

## 5. Backend Plan

The top-level IR key for this section is **`backend_plan`** (see Top-Level IR Object). Do not use a different key name (e.g. `backend`) in IR.

Purpose
Drive FastAPI generation deterministically.
Endpoint Spec
```json
{
  "name": "get_filtered_data",
  "method": "POST",
  "path": "/api/data/filter",
  "source_function": "filter_data",
  "request_schema": "FilterRequest",
  "response_schema": "FilterResponse"
}
```

Schema Definitions
```json
"schemas": {
  "FilterRequest": {
    "start_date": "date",
    "end_date": "date"
  },
  "FilterResponse": {
    "rows": "List[Dict]",
    "columns": "List[String]"
  }
}
```

Backend Rules
- Schemas are explicit
- No inference at generation time
- No dynamic typing decisions

## 6. Assets

Purpose
Declare non-code dependencies.

Model Example
```json
{
  "name": "classifier",
  "type": "sklearn | torch | xgboost",
  "path": "models/model.pkl",
  "loaded_by": "load_model"
}
```

Data Source Example
```json
{
  "type": "csv | parquet | database",
  "path": "data/data.csv",
  "access": "read"
}
```

Asset Rules
- No loading logic
- Pure declaration layer
- Used for:
    - warnings
    - TODOs
    - infra suggestions

##7. Warnings

Purpose
Explicit transparency & fail-safe mechanism.

Warning Spec
```json
{
  "severity": "low | medium | high",
  "category": "unsupported | ambiguity | performance",
  "message": "Description",
  "suggestion": "What user should review"
}
```

Warning Rules
- Never block scaffold generation
- Drive TODO stubs
- Drive user trust

# Additional Notes

##1. Hard Architectural Rule

Generators must NEVER reinterpret logic.

Generators:

✔ Read IR
✔ Apply templates
✔ Produce code

If generator must guess → parser failure.

## 2. Extension Strategy (Future)

Add fields, never mutate semantics.

Examples:
- ui_tree_v2
- state_v2
- backend_plan_v2

Maintain backward compatibility.
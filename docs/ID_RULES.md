# Stable ID Generation Rules — st2stack

## Goal

IDs must be stable across runs so diffs remain meaningful and outputs are reproducible.

**Hard rule:** IDs are derived from source structure + stable hashing, never from runtime ordering.

---

# 1. General Strategy

For every entity we assign an `id`:

- UI nodes
- Compute nodes
- Endpoints (name + path)
- Schema names (when auto-generated)

IDs must be:

- deterministic
- collision-resistant
- human-debuggable (prefix-based)
- stable even if unrelated code changes elsewhere

---

# 2. Canonical Hash Function

Use:

- SHA-1 or SHA-256 over a canonical string
- Take first 10–12 hex chars

**Format:**

`<prefix>_<hash>`

Example:

`ui_inp_3f2a91c4d7`

---

# 3. Canonical String Rules

Canonical strings MUST:

- be UTF-8
- use `/` path separators
- include only stable fields

## Source span canonical form

`file:<path>|lines:<start>-<end>`

Example:

`file:app.py|lines:10-12`

---

# 4. UI Node IDs

## 4.1 Container IDs

### Sidebar container
- Always: `ui_ctr_sidebar`

### Main container
- Always: `ui_ctr_main`

### Form container
Canonical string:

`container:form|label:<form_label_or_empty>|<source_span>`

ID:

`ui_ctr_<hash>`

---

## 4.2 Input Node IDs

Canonical string:

`input|widget:<widget>|label:<label>|binds_to:<binds_to>|key:<key_or_empty>|<source_span>`

ID:

`ui_inp_<hash>`

Notes:
- Prefer Streamlit `key=` if present; include it in canonical string
- If label is dynamic or empty, use `label:<empty>`

---

## 4.3 Output Node IDs

Canonical string:

`output|widget:<widget>|source:<source_symbol>|<source_span>`

ID:

`ui_out_<hash>`

---

# 5. Compute Node IDs

Canonical string:

`fn|name:<function_name>|<source_span>`

ID:

`cg_fn_<hash>`

Rationale:
- Function name alone is not safe (can duplicate across files)
- Span anchors it

---

# 6. Endpoint IDs / Names

v1 endpoint naming should be stable and human-readable.

## 6.1 Endpoint name

Prefer:

`<verb>_<noun>`

But if auto-generated:

`endpoint_<hash>`

Canonical string:

`endpoint|source_function:<fn_id>|path:<path>|method:<method>`

ID:

`api_ep_<hash>`

## 6.2 Endpoint path

Paths should be deterministic and derived from function name if safe:

`/api/<function_name_slug>`

If collision:
- append `-<hash4>`

Example:
- `/api/filter_data`
- `/api/filter_data-3f2a`

---

# 7. Schema Names

If user-defined names exist, preserve them.

If auto-generated:

- Request: `<EndpointName>Request`
- Response: `<EndpointName>Response`

If collision:
- append `<hash4>`

---

# 8. Ordering Rules (for diffs)

All arrays should be emitted in stable sorted order:

- `ui_tree` children: sort by `(source_span.file, line_start, line_end, kind, widget)`
- `compute_graph`: sort by `(source_span.file, line_start, id)`
- `endpoints`: sort by `(path, method, name)`
- `warnings`: sort by `(severity, category, source_span.file?, source_span.line_start?)`

---

# 9. Collision Handling

If a generated ID collides (extremely rare), extend hash length:

- 10 → 12 → 16

Never re-seed or randomize.

---

# 10. “Do Not” List

- Do not use incremental counters (`node_1`, `node_2`)
- Do not use AST traversal order as the only factor
- Do not use runtime timestamps
- Do not use LLM-generated names in IDs
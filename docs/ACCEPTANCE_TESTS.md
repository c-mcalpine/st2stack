# Acceptance Tests (v0)

## Conversion success criteria
A conversion is successful only if all of the following pass in the worker sandbox:
1) backend: installs deps and `python -m py_compile` succeeds
2) frontend: `npm ci` and `npm run build` succeeds
3) docker compose boots:
   - backend /health returns 200
   - frontend returns 200

Credits are charged only on success.

## Smoke fixtures
Maintain fixtures/streamlit_simple_app/ that:
- has sidebar inputs
- produces dataframe output
- converts successfully and passes the above validations
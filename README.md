# st2stack

Deterministic Streamlit → Full Stack (Next.js + Node API) compiler. The platform API and worker are **Node (Fastify)**; no Python is used in the backend.

This is NOT an LLM wrapper.
This is a compiler-style system:

Streamlit App
→ Scan
→ Deterministic IR
→ Backend plan
→ Frontend scaffold
→ Validated full-stack app

---

# Requirements

- Node 18+
- npm 9+
- Python 3.10+ (only for running Streamlit fixture apps, not for the platform)
- Docker (optional, for integration tests)

---

# Setup

Clone the repo:

```bash
git clone https://github.com/<your-username>/st2stack.git
cd st2stack
```

# Install dependencies

**Windows (PowerShell, no make):**
```powershell
npm run setup
```

**macOS/Linux (or with make installed):**
```bash
make install
```

Both install root + all packages (ir-types, api, worker) in one go.

# Development commands

**Windows (PowerShell):**
```powershell
npm run lint
npm run typecheck
npm run test
npm run validate-ir
npm run validate-fixture
```

**macOS/Linux (make):**
```bash
make lint
make typecheck
make test
make validate-ir
make validate-fixture
```

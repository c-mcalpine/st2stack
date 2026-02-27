# Architecture (v0)

Modules:
- api/ (Node Fastify service): auth, credits, jobs, signed upload URLs
- worker/ (Node + Redis): scan -> IR -> codegen -> validate -> package
- web/ (Next.js): upload/connect, estimate, run, logs, download
- cli/ (Node): estimate, convert, status, download

Pipeline:
ingest -> scan -> IR -> generate backend -> generate frontend -> validate -> package -> deliver

Storage:
- artifacts stored in S3/R2
- job metadata in Postgres
- logs streamed via API
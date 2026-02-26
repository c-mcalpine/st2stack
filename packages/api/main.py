from fastapi import FastAPI

app = FastAPI(title="st2stack-api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

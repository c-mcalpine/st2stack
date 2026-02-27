import os
import subprocess
import time


def run_validation_job() -> int:
    project_dir = os.environ["VALIDATE_PROJECT_DIR"]
    out_path = os.getenv("VALIDATE_OUT", "/tmp/validation-report.json")
    config_path = os.getenv("VALIDATE_CONFIG")

    cmd = [
        "node",
        "cli/dist/index.js",
        "validate",
        "--project",
        project_dir,
        "--out",
        out_path,
    ]

    if config_path:
        cmd.extend(["--config", config_path])

    completed = subprocess.run(cmd, check=False)
    return completed.returncode


def heartbeat_loop() -> None:
    postgres_host = os.getenv("POSTGRES_HOST", "postgres")
    redis_host = os.getenv("REDIS_HOST", "redis")

    while True:
        print(f"worker heartbeat: postgres={postgres_host} redis={redis_host}", flush=True)
        time.sleep(5)


def main() -> None:
    if os.getenv("VALIDATE_PROJECT_DIR"):
        raise SystemExit(run_validation_job())

    heartbeat_loop()


if __name__ == "__main__":
    main()

import os
import time


def main() -> None:
    postgres_host = os.getenv("POSTGRES_HOST", "postgres")
    redis_host = os.getenv("REDIS_HOST", "redis")

    while True:
        print(f"worker heartbeat: postgres={postgres_host} redis={redis_host}", flush=True)
        time.sleep(5)


if __name__ == "__main__":
    main()

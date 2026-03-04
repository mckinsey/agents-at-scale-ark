FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

RUN groupadd -r executor && useradd -r --uid 1001 -g executor executor

RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock README.md ./
COPY src/ ./src/
COPY ark_sdk-*.whl ./

RUN uv sync --frozen --no-dev && \
    uv pip install -e . && \
    mkdir -p /home/executor/.cache/uv /workspace && \
    chown -R executor:executor /app /home/executor/.cache /workspace

USER executor

EXPOSE 8000

CMD ["uv", "run", "python", "-m", "executor_claude_cli"]

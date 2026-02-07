FROM python:3.14.2

WORKDIR /app

RUN groupadd -r executor && \
    useradd --system --uid 1001 --gid executor --home /home/executor executor && \
    mkdir -p /home/executor/.cache/uv /workspace && \
    chown -R executor:executor /home/executor /workspace

RUN apt-get update && \
    apt-get install -y --no-install-recommends nodejs npm && \
    npm install -g @anthropic-ai/claude-code && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

COPY pyproject.toml README.md ./
COPY src/ ./src/

COPY build-context/*.whl /tmp/

RUN uv add /tmp/ark_executor_common-*.whl && \
    HOME=/home/executor uv sync --no-dev && \
    HOME=/home/executor uv pip install -e . && \
    chown -R executor:executor /home/executor && \
    chown -R executor:executor /app

USER executor

EXPOSE 8000

CMD ["uv", "run", "executor-claude-sdk"]

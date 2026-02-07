FROM python:3.14.2

WORKDIR /app

RUN groupadd -r executor && \
    useradd --system --uid 1001 --gid executor --home /home/executor executor && \
    mkdir -p /home/executor/.cache/uv && \
    chown -R executor:executor /home/executor

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

COPY pyproject.toml README.md ./
COPY src/ ./src/

COPY build-context/*.whl /app/deps/

RUN uv add /app/deps/ark_executor_common-*.whl && \
    HOME=/home/executor uv sync --no-dev && \
    HOME=/home/executor uv pip install -e . && \
    chown -R executor:executor /home/executor && \
    chown -R executor:executor /app

USER executor

EXPOSE 8000

CMD ["uv", "run", "executor-openai-sdk"]

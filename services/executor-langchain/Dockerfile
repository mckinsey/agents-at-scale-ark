FROM python:3.14.2

WORKDIR /app

RUN groupadd -r executor && \
    useradd --system --uid 1001 --gid executor --home /home/executor executor && \
    mkdir -p /home/executor/.cache/uv && \
    chown -R executor:executor /home/executor

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy project files
COPY pyproject.toml setup.cfg README.md ./
COPY src/ ./src/

# Copy dependency wheels
COPY build-context/*.whl /app/deps/

# Add dependency wheels and sync
RUN uv add /app/deps/ark_executor_common-*.whl /app/deps/ark_sdk-*.whl && \
    HOME=/home/executor uv sync --no-dev && \
    HOME=/home/executor uv pip install -e . && \
    chown -R executor:executor /home/executor && \
    chown -R executor:executor /app

USER executor

# Expose the default port (assuming it uses port 8000 like other Python services)
EXPOSE 8000

CMD ["uv", "run", "executor-langchain"]
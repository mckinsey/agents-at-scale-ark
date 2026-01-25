FROM python:3.12-slim

WORKDIR /app

# Install system dependencies including Node.js for Claude Code CLI
RUN apt-get update && apt-get install -y \
    curl \
    git \
    ssh \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g @anthropic-ai/claude-code \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create executor user
RUN groupadd -r executor && \
    useradd --system --uid 1001 --gid executor --home /home/executor executor && \
    mkdir -p /home/executor/.cache/uv /home/executor/.ssh /workspace && \
    chown -R executor:executor /home/executor /workspace

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy project files
COPY pyproject.toml README.md ./
COPY src/ ./src/

# Copy ark-sdk wheel
COPY build-context/*.whl /tmp/

# Add ark-sdk wheel as dependency and sync
RUN uv add /tmp/ark_sdk-*.whl && \
    HOME=/home/executor uv sync --no-dev && \
    HOME=/home/executor uv pip install -e . && \
    chown -R executor:executor /home/executor && \
    chown -R executor:executor /app

USER executor

# Expose the default port
EXPOSE 8000

# Workspace directory for git operations
VOLUME ["/workspace"]

CMD ["uv", "run", "executor-claude-sdk"]

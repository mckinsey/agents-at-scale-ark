FROM python:3.14.6-slim

WORKDIR /app

# Create non-root user first
RUN adduser --system --uid 1001 --home /home/arkmcp arkmcp && \
    apt-get update && \
    apt-get upgrade -y libpam0g libsqlite3-0 zlib1g libgnutls30 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /home/arkmcp && \
    chown -R arkmcp:nogroup /home/arkmcp

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.11.21 /uv /uvx /bin/

# Copy dependency files and install dependencies (cached unless deps change)
COPY ark-mcp/pyproject.toml ark-mcp/uv.lock ./
COPY ark-mcp/out/ark*.whl ./
RUN uv sync --frozen --no-install-project

# Copy source code and install the project itself so `uv run` at container
# start doesn't rebuild the local wheel on every boot.
COPY ark-mcp/src/ ./src/
RUN uv sync --frozen

# Precompile bytecode for the venv and the project so cold-start doesn't pay
# per-file parse+compile cost on first import (~30k .py files across ark-sdk +
# kubernetes-asyncio + fastmcp).
RUN uv run python -m compileall -q -j 0 .venv/lib src || true

# Set up directories for non-root user
RUN mkdir -p /home/arkmcp/.cache/uv && \
    mkdir -p /app/src/ark_mcp.egg-info && \
    chown -R arkmcp:nogroup /home/arkmcp && \
    chown -R arkmcp:nogroup /app

# Switch to non-root user
USER arkmcp

# Set HOME environment variable to fix uv cache location
ENV HOME=/home/arkmcp
ENV XDG_CACHE_HOME=/home/arkmcp/.cache

# FastMCP calls pypi.org on every pod boot to check for CLI updates; disable it
# to remove an outbound network hop from the container startup path.
ENV FASTMCP_CHECK_FOR_UPDATES=off

# Expose port 2627 (AMCP on dial pad)
EXPOSE 2627

# Run the MCP server directly from the pre-populated venv so `uv run`'s
# implicit sync/freshness check doesn't re-execute on every pod start.
CMD [".venv/bin/python", "-m", "ark_mcp"]
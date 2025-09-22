FROM python:3.12.9-slim

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
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency files
COPY ark-mcp/pyproject.toml ark-mcp/uv.lock ./

# Copy wheel files
COPY ark-mcp/out/ark*.whl /tmp/wheels/

# Copy source code only (not pyproject.toml again)
COPY ark-mcp/src/ ./src/

# Add ark-sdk wheel as a dependency and sync all dependencies
RUN uv add file://$(ls /tmp/wheels/ark*.whl) && \
    uv sync --frozen --no-install-project

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

# Expose port 2627 (AMCP on dial pad)
EXPOSE 2627

# Run the MCP server
CMD ["uv", "run", "python", "-m", "ark_mcp"]
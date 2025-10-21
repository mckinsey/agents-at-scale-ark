FROM python:3.12.9-slim

WORKDIR /app

# Install system dependencies and security updates
RUN adduser --system --uid 1001 --home /home/ark ark && \
    apt-get update && \
    apt-get upgrade -y libsqlite3-0 zlib1g libgnutls30 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /home/ark && \
    chown -R ark:nogroup /home/ark

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY pyproject.toml ./
COPY uv.loc[k] ./

# Copy wheel files
COPY out/ark*.whl /tmp/wheels/

# Copy source code only (not pyproject.toml again)
COPY src/ ./

# Add ark-sdk wheel as a dependency and sync all dependencies
RUN uv add file://$(ls /tmp/wheels/ark*.whl) && \
    (uv sync --frozen --no-install-project || \
     uv sync --frozen --no-install-project --timeout 120 || \
     uv sync --frozen --no-install-project --timeout 180)

# Ensure the runtime user has a writable home and cache directory
# Create cache directory and set permissions
RUN mkdir -p /home/ark/.cache/uv && \
    chown -R ark:nogroup /home/ark && \
    chown -R ark:nogroup /app

USER ark
ENV HOME=/home/ark

EXPOSE 7184

CMD ["uv", "run", "uvicorn", "a2agw.main:app", "--host", "0.0.0.0", "--port", "7184"]

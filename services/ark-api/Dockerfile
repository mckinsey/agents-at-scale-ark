FROM python:3.12.9-slim AS builder

WORKDIR /app

# Install system dependencies including Helm and security updates
RUN adduser --system --uid 1001 --home /home/ark ark && \
  apt-get update && \
  apt-get upgrade -y libsqlite3-0 zlib1g libgnutls30 && \
  apt-get --no-install-recommends install -y \
  curl \
  && curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /home/ark \
  && chown -R ark:nogroup /home/ark

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency files
COPY ark-api/pyproject.toml ark-api/uv.lock ./
COPY README.md ./

# Copy wheel files
COPY ark-api/out/ark*.whl /tmp/wheels/

# Copy source code only (not pyproject.toml again)
COPY ark-api/src/ ./src/
COPY ark-api/tests/ ./tests/
COPY ark-api/*.py ./

# Add ark-sdk wheel as a dependency and sync all dependencies
RUN uv add file://$(ls /tmp/wheels/ark*.whl) && \
  uv sync --frozen --no-install-project

ENV HOME=/home/ark
ENV XDG_CACHE_HOME=/home/ark/.cache
RUN mkdir -p /home/ark/.cache/uv && \
    mkdir -p /app/src/ark_api.egg-info && \
    chown -R ark:nogroup /home/ark && \
    chown -R ark:nogroup /app

USER ark

# Expose the application port
EXPOSE 8000

CMD ["uv", "run", "uvicorn", "ark_api.main:app", "--host", "0.0.0.0", "--port", "8000"]


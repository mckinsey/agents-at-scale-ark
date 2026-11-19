FROM python:3.14.5-slim AS builder

WORKDIR /app

# Install system dependencies including Helm and security updates
RUN adduser --system --uid 1001 --home /home/ark ark && \
  apt-get update && \
  apt-get upgrade -y libsqlite3-0 zlib1g libgnutls30 && \
  apt-get --no-install-recommends install -y \
  curl \
  && curl -fsSL https://raw.githubusercontent.com/helm/helm/v3.22.1/scripts/get-helm-3 | DESIRED_VERSION=v3.22.1 bash \
  && helm version --template '{{.Version}}' | grep -qx v3.22.1 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /home/ark \
  && chown -R ark:nogroup /home/ark

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.11.21 /uv /uvx /bin/

# Copy dependency files and install dependencies (cached unless deps change)
COPY ark-api/pyproject.toml ark-api/uv.lock ./
COPY README.md ./
COPY ark-api/out/ark*.whl ./out/
RUN uv sync --frozen --no-install-project

# Copy source code and install the project
COPY ark-api/src/ ./src/
COPY ark-api/*.py ./
RUN uv sync --frozen

ENV HOME=/home/ark
ENV XDG_CACHE_HOME=/home/ark/.cache
ENV HELM_CACHE_HOME=/tmp/helm/cache
ENV HELM_CONFIG_HOME=/tmp/helm/config
ENV HELM_DATA_HOME=/tmp/helm/data
RUN mkdir -p /home/ark/.cache/uv && \
    mkdir -p /app/src/ark_api.egg-info && \
    chown -R ark:nogroup /home/ark && \
    chown -R ark:nogroup /app

USER ark

# Expose the application port
EXPOSE 8000

CMD ["uv", "run", "uvicorn", "ark_api.main:app", "--host", "0.0.0.0", "--port", "8000"]


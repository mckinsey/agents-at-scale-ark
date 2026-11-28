FROM python:3.14.5-slim AS builder

ARG HELM_VERSION=v3.22.1
ARG HELM_SHA256_AMD64=896cf63684a42a723d61c980369d6e588330927deb13676ca0d85006dd6da0ea
ARG HELM_SHA256_ARM64=4c29e286b279d170fa048ddfc3e4e83dcd069ca9c52102766ba672d7149e694d

WORKDIR /app

# Install system dependencies including Helm and security updates
RUN adduser --system --uid 1001 --home /home/ark ark && \
  apt-get update && \
  apt-get upgrade -y libsqlite3-0 zlib1g libgnutls30 && \
  apt-get --no-install-recommends install -y \
  curl \
  && arch="$(dpkg --print-architecture)" \
  && case "$arch" in amd64) sum="$HELM_SHA256_AMD64" ;; arm64) sum="$HELM_SHA256_ARM64" ;; *) echo "unsupported architecture $arch" >&2; exit 1 ;; esac \
  && curl --proto '=https' --tlsv1.2 -fsS -o /tmp/helm.tar.gz "https://get.helm.sh/helm-${HELM_VERSION}-linux-${arch}.tar.gz" \
  && echo "${sum}  /tmp/helm.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/helm.tar.gz -C /tmp "linux-${arch}/helm" \
  && install -m 0755 "/tmp/linux-${arch}/helm" /usr/local/bin/helm \
  && rm -rf /tmp/helm.tar.gz "/tmp/linux-${arch}" \
  && helm version --template '{{.Version}}' | grep -qx "$HELM_VERSION" \
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


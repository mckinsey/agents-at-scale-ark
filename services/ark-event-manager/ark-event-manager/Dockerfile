FROM python:3.12-slim AS builder

WORKDIR /app

# Install system dependencies and pin pip to safe version (avoid XRAY-97724)
RUN adduser --system --uid 1001 --home /home/ark ark && \
  apt-get update && \
  apt-get --no-install-recommends install -y \
  curl \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* \
  && python -m pip install --upgrade "pip<25.0.1" \
  && mkdir -p /home/ark \
  && chown -R ark:nogroup /home/ark

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency files
COPY ark-event-manager/pyproject.toml ark-event-manager/uv.lock ./

# Copy source code
COPY ark-event-manager/src/ ./src/
COPY ark-event-manager/*.py ./

# Sync dependencies
RUN uv sync --frozen --no-install-project

ENV HOME=/home/ark
ENV XDG_CACHE_HOME=/home/ark/.cache
RUN mkdir -p /home/ark/.cache/uv && \
    mkdir -p /app/src/ark_event_manager.egg-info && \
    chown -R ark:nogroup /home/ark && \
    chown -R ark:nogroup /app

USER ark

# Expose the application port
EXPOSE 8080

CMD ["uv", "run", "python", "-m", "ark_event_manager"]


FROM python:3.14.6-slim

WORKDIR /app

RUN adduser --system --uid 1001 --home /home/exporter exporter

COPY --from=ghcr.io/astral-sh/uv:0.11.21 /uv /uvx /bin/

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src/ ./src/
RUN uv sync --frozen --no-dev

USER 1001

ENV PATH="/app/.venv/bin:$PATH"

CMD ["argo-workflows-exporter"]

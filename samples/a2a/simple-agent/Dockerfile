FROM python:3.12-slim

WORKDIR /app

RUN adduser --system --uid 1001 --home /home/ark ark && \
    mkdir -p /home/ark && \
    chown -R ark:nogroup /home/ark

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY pyproject.toml ./
COPY src/ ./src/

RUN uv sync --frozen --no-install-project

RUN chown -R ark:nogroup /app

USER ark
ENV HOME=/home/ark

EXPOSE 8000

CMD ["uv", "run", "python", "-m", "simple_a2a_server", "--host", "0.0.0.0"]

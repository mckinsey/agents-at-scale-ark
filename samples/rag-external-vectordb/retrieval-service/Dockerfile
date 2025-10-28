FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    pip install uv && \
    mkdir -p /home/appuser/.cache/uv && \
    groupadd -r appuser && \
    useradd -r -g appuser appuser

COPY pyproject.toml ./

RUN uv sync

COPY src/ ./src/

RUN chown -R appuser:appuser /app /home/appuser/.cache

USER appuser

EXPOSE 8000

CMD ["uv", "run", "python", "-m", "src.rest_server"]


FROM python:3.12.11-slim

WORKDIR /app

RUN pip install uv && \
    mkdir -p /home/appuser/.cache/uv && \
    groupadd -r appuser && \
    useradd -r -g appuser appuser

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen

COPY src/ ./src/

RUN chown -R appuser:appuser /app /home/appuser/.cache

USER appuser

EXPOSE 8000


CMD ["uv", "run", "python", "-m", "src.main"]
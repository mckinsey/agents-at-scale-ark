FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

COPY build-context/*.whl /app/deps/
RUN uv venv && uv pip install /app/deps/ark_executor_common-*.whl openai

COPY executor.py .

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "executor:app", "--host", "0.0.0.0", "--port", "8000"]

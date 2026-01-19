FROM python:3.12.9

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

RUN groupadd -r evaluator && useradd -r --uid 1001 -g evaluator evaluator

COPY pyproject.toml uv.lock README.md ./
COPY src/ ./src/
COPY ark_sdk-*.whl ./

WORKDIR /app

# Install dependencies including OSS providers, package, and set up non-root user
RUN uv sync --frozen --no-dev && \
    uv pip install -e . && \
    mkdir -p /home/evaluator/.cache/uv && \
    chown -R evaluator:evaluator /app && \
    chown -R evaluator:evaluator /home/evaluator/.cache

USER evaluator

EXPOSE 8000

CMD ["uv", "run", "python", "-m", "evaluator"]
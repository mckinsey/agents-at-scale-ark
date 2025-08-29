FROM python:3.12.9

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

RUN groupadd -r evaluator && useradd -r -g evaluator evaluator

COPY pyproject.toml uv.lock README.md ./
COPY src/ ./src/
COPY ark_sdk-*.whl ./

# Set working directory to the evaluator
WORKDIR /app

# Install dependencies
RUN uv sync --frozen --no-dev && \
    uv pip install -e . && \
    mkdir -p /home/evaluator/.cache/uv && \
    chown -R evaluator:evaluator /app && \
    chown -R evaluator:evaluator /home/evaluator/.cache

USER evaluator

EXPOSE 8000

CMD ["uv", "run", "python", "-m", "evaluator_metric"]
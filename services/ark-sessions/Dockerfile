# syntax=docker/dockerfile:1.4

FROM python:3.12-slim AS builder

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files and source code
COPY ark-sessions/pyproject.toml ./
COPY ark-sessions/src/ ./src/

# Install dependencies
RUN uv pip install --system -e .

# Final stage
FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY ark-sessions/src/ ./src/

# Expose port
EXPOSE 8080

# Run the application
CMD ["uv", "run", "python", "-m", "ark_sessions"]

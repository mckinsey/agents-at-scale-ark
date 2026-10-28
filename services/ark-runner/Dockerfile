# Build context is the repo root (needs the prebuilt ark-sdk wheel from out/).
#   make ark-sdk-build
#   docker build -t ark-runner:latest -f services/ark-runner/Dockerfile .
FROM python:3.12-slim

WORKDIR /app

# Install the locally-built ark-sdk wheel (generated client + overlay), then the runner.
COPY out/ark-sdk/py-sdk/dist/ /tmp/ark-sdk-dist/
COPY services/ark-runner /app
# Install the locally-built ark-sdk wheel BY PATH (highest version), so the published PyPI
# ark-sdk of the same version can't shadow local overlay changes. Deps resolve from the index.
RUN pip install --no-cache-dir "$(ls /tmp/ark-sdk-dist/ark_sdk-*.whl | sort -V | tail -1)" \
    && pip install --no-cache-dir .

EXPOSE 80

# PID-1 per the Substrate runner contract: serves /healthz, /readyz on :80.
ENTRYPOINT ["python", "-m", "ark_runner"]

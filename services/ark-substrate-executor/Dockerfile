# Build context is the repo root (needs the prebuilt ark-sdk wheel from out/).
#   make ark-sdk-build
#   docker build -t ark-substrate-executor:latest -f services/ark-substrate-executor/Dockerfile .
FROM python:3.12-slim

WORKDIR /app

# Install the locally-built ark-sdk wheel (generated client + overlay), then the executor.
# The generated ateapi stubs ship inside the package (src/.../ateapi_gen).
COPY out/ark-sdk/py-sdk/dist/ /tmp/ark-sdk-dist/
COPY services/ark-substrate-executor /app
# Install the locally-built ark-sdk wheel BY PATH (highest version), so the published PyPI
# ark-sdk of the same version can't shadow local overlay changes. Deps resolve from the index.
RUN pip install --no-cache-dir "$(ls /tmp/ark-sdk-dist/ark_sdk-*.whl | sort -V | tail -1)" \
    && pip install --no-cache-dir .

EXPOSE 8080

ENTRYPOINT ["python", "-m", "ark_substrate_executor"]

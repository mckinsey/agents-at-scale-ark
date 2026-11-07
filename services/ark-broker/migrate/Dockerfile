FROM golang:1.26.9-bookworm AS builder
ENV GOTOOLCHAIN=local
WORKDIR /workspace
COPY migrate/go.mod migrate/go.sum ./
RUN go mod download
COPY migrate/main.go ./
RUN CGO_ENABLED=0 go build -trimpath -o /migrate .

FROM gcr.io/distroless/static:nonroot

LABEL org.opencontainers.image.title="ark-broker-migrate" \
      org.opencontainers.image.description="Applies database schema migrations for ark-broker using golang-migrate" \
      org.opencontainers.image.source="https://github.com/mckinsey/agents-at-scale-ark" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.vendor="McKinsey & Company"

COPY --from=builder /migrate /migrate
COPY ark-broker/src/db/migrations /migrations

USER 65532:65532
ENTRYPOINT ["/migrate"]

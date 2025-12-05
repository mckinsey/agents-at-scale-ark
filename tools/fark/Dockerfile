FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy go.mod, go.sum and vendor directory
COPY go.mod go.sum ./
COPY vendor ./vendor

# Copy source code
COPY cmd/ ./cmd/
# Build with vendored dependencies
RUN CGO_ENABLED=0 GOOS=linux go build -mod=vendor -o fark ./cmd/fark

FROM alpine:latest

RUN adduser --system --uid 1001 fark && \
    apk --no-cache add ca-certificates
    
WORKDIR /root/

COPY --from=builder /app/fark .

USER fark

EXPOSE 8080

CMD ["./fark"]

FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /workspace-service ./cmd/main.go

FROM alpine:3.20

RUN apk add --no-cache git openssh-client ca-certificates unzip
RUN adduser -D -u 1000 appuser
USER appuser

COPY --from=builder /workspace-service /usr/local/bin/workspace-service

EXPOSE 8090
ENTRYPOINT ["workspace-service"]

FROM golang:1.24.13-bookworm AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /ark-query-engine ./cmd/

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /ark-query-engine /ark-query-engine
EXPOSE 8080
ENTRYPOINT ["/ark-query-engine"]

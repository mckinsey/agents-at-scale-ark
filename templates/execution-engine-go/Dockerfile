FROM golang:1.24 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /engine ./cmd/

FROM gcr.io/distroless/static:nonroot
COPY --from=builder /engine /engine
USER nonroot:nonroot
ENTRYPOINT ["/engine"]

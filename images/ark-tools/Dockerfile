FROM golang:1.24-alpine AS fark-builder

WORKDIR /build

# Copy ark module (required by fark's replace directive)
COPY ark/go.mod ark/go.sum ./ark/
COPY ark/api ./ark/api
COPY ark/internal ./ark/internal

# Copy fark source
COPY tools/fark/go.mod tools/fark/go.sum ./tools/fark/
RUN cd tools/fark && GOTOOLCHAIN=auto go mod download

COPY tools/fark/cmd ./tools/fark/cmd
RUN cd tools/fark && CGO_ENABLED=0 GOOS=linux GOTOOLCHAIN=auto go build -o /build/fark ./cmd/fark

FROM node:24-alpine AS ark-builder

WORKDIR /build

COPY tools/ark-cli/package.json tools/ark-cli/package-lock.json ./
RUN npm ci

COPY tools/ark-cli/tsconfig.json ./
COPY tools/ark-cli/src ./src
COPY tools/ark-cli/templates ./templates

RUN npx tsc && chmod +x dist/index.js

FROM alpine:3.20

WORKDIR /tools

# Install kubectl
RUN apk add --no-cache curl ca-certificates bash openssl && \
    KUBECTL_VERSION=$(curl -L -s https://dl.k8s.io/release/stable.txt) && \
    curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/

# Install helm
RUN curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Install argo CLI
RUN ARGO_VERSION=$(curl -s https://api.github.com/repos/argoproj/argo-workflows/releases/latest | grep '"tag_name"' | cut -d '"' -f 4) && \
    curl -sLO "https://github.com/argoproj/argo-workflows/releases/download/${ARGO_VERSION}/argo-linux-amd64.gz" && \
    gunzip argo-linux-amd64.gz && \
    chmod +x argo-linux-amd64 && \
    mv argo-linux-amd64 /usr/local/bin/argo

# Install devspace
RUN curl -sL https://github.com/devspace-sh/devspace/releases/latest/download/devspace-linux-amd64 -o /usr/local/bin/devspace && \
    chmod +x /usr/local/bin/devspace

# Install Node.js for ark CLI
RUN apk add --no-cache nodejs npm

# Copy fark binary
COPY --from=fark-builder /build/fark /usr/local/bin/fark

# Copy ark CLI
COPY --from=ark-builder /build/dist ./ark/dist
COPY --from=ark-builder /build/templates ./ark/templates
COPY --from=ark-builder /build/node_modules ./ark/node_modules
COPY --from=ark-builder /build/package.json ./ark/package.json

# Create symlink for ark
RUN ln -s /tools/ark/dist/index.js /usr/local/bin/ark && \
    chmod +x /tools/ark/dist/index.js

# Clean up
RUN rm -rf /var/cache/apk/*

# Create non-root user
RUN adduser --system --uid 1001 arktools

USER arktools

CMD ["/bin/sh"]

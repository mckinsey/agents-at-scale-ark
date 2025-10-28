FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
COPY templates ./templates

RUN npx tsc && chmod +x dist/index.js

FROM node:24-alpine AS runner

WORKDIR /app

# Install kubectl and helm
RUN apk add --no-cache curl openssl && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/ && \
    curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | sh && \
    apk del curl openssl

RUN adduser --system --uid 1001 ark

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

RUN chown -R ark:root ./ && \
    find ./ -type d -exec chmod 755 {} \; && \
    find ./ -type f -exec chmod 644 {} \; && \
    chmod 755 dist/index.js

USER ark

ENTRYPOINT ["node", "dist/index.js"]

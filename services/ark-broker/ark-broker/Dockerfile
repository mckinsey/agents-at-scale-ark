FROM node:25.8.1-alpine AS builder

WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci

COPY src ./src
COPY proto ./proto
COPY tsconfig.json ./
RUN npm run build

FROM node:25.8.1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy package files and install only production dependencies
COPY --chown=root:root --chmod=755 package.json ./
COPY --chown=root:root --chmod=755 package-lock.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder --chown=root:root --chmod=755 /workspace/dist ./dist

# Copy proto definitions needed for OTLP trace parsing
COPY --from=builder --chown=root:root --chmod=755 /workspace/proto ./proto

USER nodejs

EXPOSE 8080

CMD ["node", "dist/main.js"]
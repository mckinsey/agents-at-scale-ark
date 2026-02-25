FROM node:25.4.0-alpine AS builder

WORKDIR /workspace
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:25.4.0-alpine AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy package files and install only production dependencies
COPY --chown=nodejs:nodejs package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /workspace/dist ./dist

# Copy proto definitions needed for OTLP trace parsing
COPY --from=builder --chown=nodejs:nodejs /workspace/proto ./proto

USER nodejs

EXPOSE 8080

CMD ["node", "dist/main.js"]
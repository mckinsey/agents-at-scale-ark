FROM node:24-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY ark-dashboard/package.json ark-dashboard/package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY ark-dashboard/ .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# For in-cluster local development with DevSpace  
FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY ark-dashboard/ .

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

# Ensure we have dev dependencies
RUN npm install

EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir .next && \
    chown nextjs:nodejs .next

COPY --from=builder /app/public ./public

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN chown -R nextjs:nodejs ./ && \
    find ./ -type d -exec chmod 755 {} \; && \
    find ./ -type f -exec chmod 644 {} \; && \
    chmod 755 server.js

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

FROM node:26.4.0-alpine AS base

FROM --platform=$BUILDPLATFORM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY ark-dashboard/package.json ark-dashboard/package-lock.json* ./
RUN npm ci

FROM --platform=$BUILDPLATFORM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY ark-dashboard/ .

ENV NEXT_TELEMETRY_DISABLED=1
# Bake a sentinel basepath into the build so the entrypoint can substitute the
# operator-supplied value at container start without rebuilding the image.
ENV ARK_DASHBOARD_BASE_PATH=/__ark_base_path__
ENV NEXT_PUBLIC_BASE_PATH=/__ark_base_path__

RUN npm run build


FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# perl is used by entrypoint.sh to substitute the basepath sentinel at startup.
RUN apk add --no-cache perl

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir .next && \
    chown nextjs:nodejs .next

COPY --from=builder /app/public ./public

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY entrypoint.sh /app/entrypoint.sh
RUN chown -R nextjs:nodejs ./ && \
    find ./ -type d -exec chmod 755 {} \; && \
    find ./ -type f -exec chmod 644 {} \; && \
    chmod 755 server.js entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["./entrypoint.sh"]

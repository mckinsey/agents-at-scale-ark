FROM node:24-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY app ./app
COPY next.config.js tsconfig.json postcss.config.js tailwind.config.js ./
ARG NEXT_PUBLIC_ARK_DASHBOARD_URL
RUN echo "Building with NEXT_PUBLIC_ARK_DASHBOARD_URL=${NEXT_PUBLIC_ARK_DASHBOARD_URL}" && \
    NEXT_PUBLIC_ARK_DASHBOARD_URL=${NEXT_PUBLIC_ARK_DASHBOARD_URL} npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=root:root --chmod=755 /app/public ./public
COPY --from=builder --chown=root:root --chmod=755 /app/.next/standalone ./
COPY --from=builder --chown=root:root --chmod=755 /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

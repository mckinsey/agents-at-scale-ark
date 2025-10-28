FROM node:22-alpine

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

RUN addgroup -S mcp && adduser -S -G mcp mcp && \
    mkdir -p /data/sessions && \
    chown -R mcp:mcp /app /data

USER mcp

EXPOSE 8080

CMD ["node", "dist/index.js"]

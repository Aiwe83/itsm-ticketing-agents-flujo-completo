ARG NODE_BASE_IMAGE=node:22-alpine

FROM ${NODE_BASE_IMAGE} AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile && \
    pnpm store prune

COPY . .

RUN pnpm run build

FROM ${NODE_BASE_IMAGE}

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN addgroup -g 1001 -S tcintegration && \
    adduser -S tcintegration -u 1001

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod && \
    pnpm store prune

COPY --from=builder /app/dist ./dist

RUN chown -R tcintegration:tcintegration /app

USER tcintegration

EXPOSE 8000

CMD ["node", "dist/server.js"]

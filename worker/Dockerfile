FROM node:22-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --prod --frozen-lockfile=false

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY worker ./worker
COPY tsconfig.json ./

RUN corepack enable && pnpm add -D tsx@4.19.0

EXPOSE 8787
CMD ["pnpm", "tsx", "worker/index.ts"]

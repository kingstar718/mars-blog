# 多阶段构建：构建阶段装全量依赖跑 pnpm build，运行时只带生产依赖和产物。
# 镜像由 GitHub Actions 构建推送到 GHCR（见 .github/workflows/docker.yml）。
FROM node:22-slim AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY migrations ./migrations

# 数据库和图片都落在 /app/.data，部署时挂 volume 持久化
EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]

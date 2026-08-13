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

# 运行时只带纯 JS 的生产依赖（构建期依赖已在 devDependencies），
# 用 alpine 进一步缩小体积；构建阶段仍用 slim，原生二进制在那里装。
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# @astrojs/node 默认只听 127.0.0.1，容器里必须监听全部接口，
# 否则 -p 映射的端口从容器外连不上（docker-proxy 会拿到拒绝）。
ENV HOST=0.0.0.0
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

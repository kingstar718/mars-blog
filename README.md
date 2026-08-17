# mars-blog

一个人写、一个人读的中文博客。静态化（v3）之后整站是 Cloudflare Pages 上的纯 HTML，
动态能力（登录、就地编辑、评论、浏览量、图片代理）由 Pages Functions 承担，
内容的真相源是 R2 里的 markdown。

它的前身是 `astro-paper-blog`（内容在 git 里的静态站）和 v2（自部署 Node + SQLite），
排版和阅读体验一路沿袭下来（v3 不再自托管字体，中文交给各平台系统栈）。
v3 把「打开页面就能写」搬回了静态架构：
登录之后，阅读页面本身就是编辑界面。

**没有后台。** 登录后文章页点铅笔，这一页原地变成编辑态；随记在列表里就地展开；
关于页同理；评论审核就在文章的评论区里。保存 = 把 markdown 写回 R2 并触发
Pages Deploy Hook 重建，新内容约一两分钟后上线。

## 功能

| 模块   | 说明                                                                                 |
| ------ | ------------------------------------------------------------------------------------ |
| 内容   | 文章（标题、目录、评论）、随记（无标题，列表就地展开）、关于页；frontmatter 即元数据 |
| 写作   | 原生 textarea 就地编辑，贴图/拖图即压缩上传（浏览器端 400/800/1600 三档 webp+jpeg）  |
| 图片   | 私有 R2 桶，经 `/media/[...path]` 代理出图，一年 immutable 缓存                      |
| 评论   | 默认待审，审核入口在文章页自己的评论区；蜜罐 + 同 IP 十分钟三条限流                  |
| 搜索   | 构建期把文章和随记内容打进索引，浏览器端实时过滤，中文子串可搜                       |
| 目录   | 构建时抽 h2/h3，桌面右侧横线目录、移动端顶部折叠；编辑态由编辑器实时接管             |
| 登录   | 环境变量 `ADMIN_PASSWORD`，HMAC 签名 cookie，7 天过期                                |
| 订阅   | `/feed.xml`（Atom），文章和随记都在里面，随部署更新                                  |
| 浏览量 | 按路径计数（D1），同 IP 24 小时一次；登录后页脚显示全站合计                          |

## 代码结构

```
src/
├── pages/              文章/随记/关于/搜索/RSS/登录/新文章页
├── components/         阅读组件 + admin/ 就地编辑器
├── layouts/Site.astro  全站外壳（含会话检测）
├── content/            构建期从 R2 同步下来的 markdown
├── lib/                frontmatter、时间、标题等纯逻辑
└── styles/             theme/typography/global
functions/              Pages Functions：/api/auth、/api/content、/api/comments、
                        /api/views、/api/admin/images、/media/*
```

内容集合定义在 `src/content.config.ts`，schema 与 frontmatter 字段一一对应。

## 本地开发

需要 Node ≥ 22.12 和 pnpm。

```bash
pnpm install
pnpm dev                        # http://localhost:4321
pnpm build                      # astro check + 构建
pnpm format                     # prettier
pnpm typecheck:functions        # functions 类型检查
```

构建期内容同步（`scripts/sync-content.mjs`）需要 R2 凭据；本地构建直接用
`src/content/` 里已有的 markdown，要用 R2 的内容就先配凭据再跑：

```bash
R2_ENDPOINT=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
  pnpm sync:content
```

本地调试 Functions：`pnpm dlx wrangler pages dev dist`（`.dev.vars` 里放
`ADMIN_PASSWORD` 等，绑定清单见 `functions/env.d.ts`）。

## 部署（Cloudflare Pages）

push 到 main 后 Pages 自动构建部署（类型与格式校验由 GitHub CI 负责，
Pages 只做纯构建，不再重复跑 `astro check`）。

**Pages 项目设置**

- 生产分支 `main`，输出目录 `dist`
- 构建命令：`pnpm install --frozen-lockfile && pnpm sync:content && pnpm exec astro build`
  （`pnpm build` 里含 `astro check`，CI 已经跑过；内容 schema 校验在
  `astro build` 本身也会执行，去掉 check 不会放松这道闸）
- 构建环境变量（供 sync-content 用 S3 协议读 R2）：`NODE_VERSION=22`（或 24）、
  `R2_ENDPOINT`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_CONTENT_BUCKET`

**绑定与密钥**（Settings → Bindings，配完重新部署一次生效）：

| 类型      | 名称              | 值                                                         |
| --------- | ----------------- | ---------------------------------------------------------- |
| D1 数据库 | `DB`              | 评论/浏览量/限流（post_comments、page_views、rate_limits） |
| R2 桶     | `MEDIA`           | 图片桶                                                     |
| R2 桶     | `CONTENT`         | 内容桶（posts/ notes/ pages/ 下的 markdown）               |
| 加密变量  | `ADMIN_PASSWORD`  | 登录口令                                                   |
| 加密变量  | `DEPLOY_HOOK_URL` | Pages Deploy Hook，编辑保存后触发重建                      |

**数据准备**

1. 内容桶放 `posts/ notes/ pages/` 三个前缀的 markdown（frontmatter 见
   `src/content.config.ts`）；图片按 `/media/...` 路径放图片桶
2. D1 建库并建表：`pnpm dlx wrangler d1 execute <库名> --remote
--file=scripts/d1-schema.sql`（生产库已建好，这条给全新环境用）
3. Pages 里建 Deploy Hook（分支 main），URL 填进 `DEPLOY_HOOK_URL`

**编辑保存的链路**：`PUT /api/content/...` → 写 R2 → 触发 Deploy Hook →
Pages 重新构建（sync-content 拉最新 markdown）→ 新内容上线（约 1-2 分钟）。

## 校验

push 到 main / 开 PR 时 GitHub CI 跑 `format:check` 和 `build`
（`.github/workflows/ci.yml`；`build` 内含 `astro check` 的类型检查）。
Pages 部署只跑 `astro build`，不重复校验。

## 一些取舍

为什么静态化、为什么内容以 R2 为真相源、为什么没有草稿页和设置页——
见 `DESIGN.md` 和相关文件的注释。

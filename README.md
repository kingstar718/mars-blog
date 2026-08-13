# mars-blog

一个人写、一个人读的中文博客。内容存在 SQLite，图片存在本地磁盘，整站跑在 Node 上——自部署 v2，不再依赖 Cloudflare。

它的前身是 `astro-paper-blog`（内容在 git 里的静态站），排版、字体和阅读体验一并搬了过来，发布链路换成了「打开页面就能写」。

**没有后台。** 登录之后，阅读页面本身就是编辑界面：文章页点铅笔，这一页原地变成编辑态；随记在列表里就地展开；关于页同理；评论审核就在文章的评论区里。`/admin` 不存在。

## 功能

| 模块 | 说明                                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 内容 | 文章（有标题、目录、评论）、随记（无标题，正文直接在列表里展开）、关于页                                                                                                      |
| 写作 | CodeMirror 6 编辑器，贴图/拖图即上传，草稿自动保存，发布时才渲染 HTML                                                                                                         |
| 图片 | 浏览器端压成 400/800/1600 三档 webp + jpeg 兜底，默认存本地磁盘，登录后可在 `/settings` 配 S3 兼容存储（保存时验证连接）；`srcset` 出图，随记配图默认收成缩略图，点开就地放大 |
| 评论 | 默认待审，审核入口在文章页自己的评论区；蜜罐 + 同 IP 十分钟三条限流                                                                                                           |
| 搜索 | 全表 `LIKE`，中文两字词也能搜到（为什么不用 FTS5 见 `src/lib/search.ts`）                                                                                                     |
| 目录 | 发布时从正文抽 h2/h3，桌面右侧横线目录（可图钉固定），移动端正文顶部折叠                                                                                                      |
| 登录 | 部署时用环境变量 `ADMIN_PASSWORD` 设口令，PBKDF2 校验 + HMAC 签名 cookie，同 IP 十分钟五次限流                                                                                |
| 订阅 | `/feed.xml`（Atom），文章和随记都在里面；发布时随页面一起清缓存                                                                                                               |
| 备份 | 服务器本地：SQLite dump + `.data/` 目录同步（异地备份建议单独做）                                                                                                             |
| 主题 | 深浅色跟随系统，可手动切换，无闪烁                                                                                                                                            |

没有 sitemap、没有标签系统、没有分享按钮 —— 都是有意不做的。标签的写法是标题末尾加 `#ai` 这样一个词，渲染时缩小退到浅色，仅此而已。RSS 在 2026-08 补了回来，理由见 `src/pages/feed.xml.ts` 开头。

## 代码结构

```
src/
├── pages/
│   ├── index.astro            关于页（就是首页）
│   ├── posts/[...page].astro  文章索引：按年分组的紧凑单行
│   ├── posts/[id].astro       文章页（登录后可就地编辑）
│   ├── notes/[...page].astro  随记时间线
│   ├── search.astro           搜索
│   ├── feed.xml.ts            Atom 订阅源（/feed.xml）
│   ├── login.astro            口令登录（平时没有入口，会话过期时编辑接口会跳过来）
│   ├── settings.astro         存储设置（登录后页脚入口）
│   ├── media/[...path].ts     图片出口，本地磁盘
│   └── api/
│       ├── admin/             写接口，中间件统一鉴权
│       ├── auth/              登录 / 退出
│       ├── comments/[id].ts   读者提交评论
│       └── views.ts           浏览量自增
├── components/
│   ├── admin/                 三个就地编辑器（Post / Note / Page）+ CodeMirror 封装（无框架）
│   └── ...                    时间线、页头页脚、评论、目录等
├── lib/                       数据访问与纯逻辑，见下
├── layouts/Site.astro         唯一的外壳
├── styles/                    theme.css（色板 + 排版 token）、typography.css、global.css
└── middleware.ts              认会话
```

`src/lib/` 里每个文件对应一件事：

| 文件                                                                | 负责                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| `db.ts`                                                             | 所有 SQL，返回原始行                                     |
| `entries.ts`                                                        | 草稿读写与发布（发布时渲染 HTML、盖发布时间）            |
| `render.ts`                                                         | markdown → HTML（unified + shiki），顺带抽标题和展开图片 |
| `schema.ts`                                                         | zod 校验，发布时才跑完整规则                             |
| `datetime.ts`                                                       | 站点时区的时间格式与相对时间                             |
| `session.ts` / `password.ts`                                        | 会话签名 / 口令校验                                      |
| `ratelimit.ts`                                                      | SQLite 固定窗口限流，评论和登录共用                      |
| `cache.ts`                                                          | 页面缓存头；发布后的失效交给 Nginx 短 TTL 兜             |
| `images.ts` / `search.ts` / `pages.ts` / `comments.ts` / `title.ts` | 各自领域的读写                                           |

**几条贯穿全站的约定**

- **排版只有三档**：正文 17/18px（文章、随记、关于页），列表和从属内容 16px，日期这类元信息 14px。字号行高定义在 `theme.css` 的 `--reading-*`，`.app-prose` 和编辑器读同一份 —— 所以写的时候的换行位置就是发出去之后的换行位置。
- **时间一律是站点时区的 `YYYY-MM-DD HH:mm:ss` 字符串**，库里写的、导出的、页面上显示的是同一串字符（`src/lib/datetime.ts` 说明了为什么不存 UTC）。
- **编辑态贴着阅读态**：方框用负外边距抵消自己的内边距，进出编辑态文字不横移；两态之间是淡入淡出，不是硬切。
- **页面上没有分隔线**，分隔一律靠留白；唯一的实心色块是配图。

## 本地开发

需要 Node ≥ 22.12 和 pnpm。

```bash
pnpm install
pnpm db:init                   # 建本地 SQLite（.data/mars.db），迁移自动执行
pnpm dev                       # http://localhost:4321
```

**登录只用部署环境变量 `ADMIN_PASSWORD`**（docker compose 的 `environment`）：
明文口令，换掉再重启即换口令；会话 cookie 的签名密钥由口令派生，不单独配置。
没配的话首次请求即报错（500），日志会说明原因。想覆盖存储路径再设
`MARS_*` 环境变量，不设全走默认值。

若出现 `The file does not exist at node_modules/.vite/...`，是构建清掉了 Vite 的依赖缓存而 dev 进程还指着旧路径，`rm -rf node_modules/.vite` 后重启即可。用 Node 22 开发时 `node:sqlite` 会打一行 ExperimentalWarning（容器运行时已用 Node 24，无此警告），正常，不影响使用。

常用脚本：

```bash
pnpm build          # astro check + 构建
pnpm preview        # node dist/server/entry.mjs，跑构建产物
pnpm test           # 最小单测（node:test，零额外依赖，见 test/）
pnpm format         # prettier
pnpm smoke          # 冒烟检查，见「部署」
```

推送到 `main` 和开 PR 时，CI 会跑一遍 `format:check`、`test` 和 `build`（`.github/workflows/ci.yml`）。

## 配置

**站点常量**在 `src/site.ts`：标题、描述、作者、邮箱（页脚站名点开就是写邮件）、每页条数。

**环境变量**（全部可选，不配就用默认值）：

| 名字                  | 说明                                         |
| --------------------- | -------------------------------------------- |
| `ADMIN_PASSWORD`      | 站长登录口令（必配，明文）                   |
| `MARS_DB_FILE`        | SQLite 库文件路径，默认 `.data/mars.db`      |
| `MARS_MEDIA_DIR`      | 图片目录，默认 `.data/media`                 |
| `MARS_MIGRATIONS_DIR` | 迁移文件目录，默认项目根目录的 `migrations/` |

**登录只用 `ADMIN_PASSWORD`**：明文口令（换掉再重启即换口令，会话全部下线）；
会话签名密钥由口令派生，不单独配置。真正拦爆破的是「同 IP 十分钟五次」的
限流加二十位以上的随机口令。

**图片存储配置也在数据库**（`s3_config` 表）：登录后打开 `/settings` 填写
Endpoint / Region / Bucket / 密钥，可先「测试连接」再保存；勾了启用时保存会
先做真实读写验证，验证不过不保存。默认（未配置或未启用）走本地磁盘。

## 数据库

库文件默认 `.data/mars.db`（`MARS_DB_FILE` 可改）。启动时按 `migrations/` 目录顺序执行
尚未应用的迁移，用 `PRAGMA user_version` 记账：`migrate()` 只跑版本号大于当前值的
`.sql` 文件，全部成功后再把 `user_version` 更新到最新迁移号。

两个容易踩的坑：

- **导入外部 dump 前先把版本号对上**。D1 导出（`wrangler d1 export`）自带表结构，
  但 `user_version` 是 0——直接替换库文件会让启动迁移重放 `0001_init.sql` 撞表报
  `table entries already exists`。导入后手工执行 `PRAGMA user_version = 15`
  （等于当前最新迁移号）再启动即可；D1 库里没有的 `s3_config` 表由
  `0014_s3_config.sql` 补建。
- **迁移文件不可重放**。`0008_drop_slug.sql` 这类会重建、删表，`user_version` 归零
  后重启等于重放历史，可能丢数据。新增表用 `CREATE TABLE IF NOT EXISTS`；
  重建型迁移保持一次性并在文件头注明。

## 部署

v2 是自部署：构建产物是一个 Node 服务，上线到自己的服务器。镜像由
`.github/workflows/docker.yml` 构建并推送（见下），本地想先跑一遍产物：

```bash
pnpm build
pnpm preview                    # 本地先跑一遍
```

服务器上的运行方式（示例）：

- 把 `dist/` 同步到服务器项目目录；`.data/`（SQLite + 图片）留在服务器上，不进产物
- systemd 或 pm2 托管 `node dist/server/entry.mjs`，环境变量按「配置」一节设置
- Nginx 反代 `127.0.0.1:4321`；公开 GET 页面建议配 microcache（60 秒左右），
  带 `mars_session` cookie 的请求绕开缓存——这正是原来 Cloudflare 边缘缓存做的事

**Docker 部署（推荐）**：`Dockerfile` 在仓库里，`.github/workflows/docker.yml` 会在
push 到 main / v2-selfhost 时用 GitHub Actions 构建镜像并推到 GHCR
（`ghcr.io/<owner>/mars-blog:latest`）。
服务器上参照 `compose.example.yaml`：服务挂到 Nginx Proxy Manager 所在网络，
NPM 里加一条 Proxy Host（域名 → `app:4321`，SSL 勾 Let's Encrypt）即可。
镜像默认私有：服务器拉取前用有 `read:packages` 权限的 PAT 登录一次 ghcr.io，
或把镜像包设为 public。

**部署完跑一次冒烟**：

```bash
pnpm smoke http://localhost:4321        # 打本地
pnpm smoke https://你的域名             # 打线上
```

它检查若干路由的状态码、写接口无会话是否 401、错口令登录是否 302 而不是 500。

**数据库迁移**在 `migrations/`，按序号执行。服务启动时自动把没跑过的迁移补上
（用 `PRAGMA user_version` 记账，等价于原来的 `wrangler d1 migrations apply`）。
手动初始化或查看当前状态：

```bash
pnpm db:init
```

> 顺序很重要：**先部署不再引用某列的代码，再对线上库执行删列的迁移**。反过来做会让线上在两次操作之间 500。

首次部署：容器启动即自动迁移建表（迁移里带了一条 `slug='about'` 的初始记录，
首页有东西可显示）；配好 `ADMIN_PASSWORD` 环境变量后，打开 `/login` 输入口令即登录。

## 运维

平时不用管，但有三件事得知道它们存在。

**改了渲染链之后要重刷老内容。** `body_html` 是发布那一刻算好存进库的，之后再改 `src/lib/render.ts`（换 shiki 主题、改标题 id 的算法、改图片标签的拼法）都不会影响已经发出去的内容——它们会一直停在旧的 HTML 上。

```bash
MARS_SESSION=<cookie 值> pnpm rerender
```

cookie 从浏览器取：登录后 devtools → Application → Cookies → 复制 `mars_session` 的值。这个接口没有页面入口是有意的——它是运维动作，不该在读者能看到的界面上占一个按钮。

**备份要自己做。** GitHub 每日导出已移除；SQLite 是单机文件，没有版本恢复机制，
建议在服务器上挂个 cron：把 `.data/` 整个目录（数据库 + 图片）增量同步到另一块
磁盘或对象存储，数据库文件最好用 SQLite 的在线备份（`.backup`）再拷。这份备份
就是唯一的回滚手段。仓库里的 `backup/` 是旧机制的历史快照，留着当参考。

**从 D1 迁到本地 SQLite（一次性）。** 旧站数据在 Cloudflare D1 里，迁出分两步：

```bash
# 1. 导出（wrangler 认证：wrangler login，或设 CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID）
npx wrangler@4.115.0 d1 export mars-blog --remote --no-schema --output d1-data.sql
# 2. 导入（会先清空本地数据表再写入；迁移种子里的 about 页会被 D1 的覆盖）
node scripts/import-d1.mjs d1-data.sql
```

覆盖：文章（含草稿）、关于页、评论（含审核状态）、浏览量、图片元数据。
图片二进制来自 `backup/media/`（存在则自动拷贝；没有就按 `<uid>/<宽度>.<扩展名>`
下载到 `.data/media/`）。导入后打开文章页抽查，确认无误再下线旧站。

**没人引用的图片会攒着。** `images` 表没有 `entry_id`，删一篇文章或编辑时删掉一张图，
`.data/media` 里的文件不会跟着消失。想清的话写个本地脚本扫一遍：正文里的
`/media/<uid>` 引用对比磁盘上的文件，差出来的就是孤儿，**只报告不删除**——草稿里、
甚至还没保存的编辑器里都可能正引用着它。

## 一些取舍

为什么内容离开 git、为什么不用 FTS5、为什么不做弹层、边缘缓存怎么保证不把登录态发给匿名访客 —— 这些写在 `DESIGN.md` 和相关文件的注释里。

`DESIGN.md` 与代码同步维护，记录的是「为什么这么做」；这份 README 记录「怎么用」。

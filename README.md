# mars-blog

一个人写、一个人读的中文博客。内容存在 Cloudflare D1，图片存在 R2，整站跑在 Cloudflare Workers 上。

它的前身是 `astro-paper-blog`（内容在 git 里的静态站），排版、字体和阅读体验一并搬了过来，发布链路换成了「打开页面就能写」。

**没有后台。** 登录之后，阅读页面本身就是编辑界面：文章页点铅笔，这一页原地变成编辑态；随记在列表里就地展开；关于页同理；评论审核就在文章的评论区里。`/admin` 不存在。

## 功能

| 模块 | 说明                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| 内容 | 文章（有标题、目录、评论）、随记（无标题，正文直接在列表里展开）、关于页                                      |
| 写作 | CodeMirror 6 编辑器，贴图/拖图即上传，草稿自动保存，发布时才渲染 HTML                                         |
| 图片 | 浏览器端压成 400/800/1600 三档 webp + jpeg 兜底，存 R2，`srcset` 出图；随记的配图默认收成缩略图，点开就地放大 |
| 评论 | 默认待审，审核入口在文章页自己的评论区；蜜罐 + 同 IP 十分钟三条限流                                           |
| 搜索 | 全表 `LIKE`，中文两字词也能搜到（为什么不用 FTS5 见 `src/lib/search.ts`）                                     |
| 目录 | 发布时从正文抽 h2/h3，桌面右侧横线目录（可图钉固定），移动端正文顶部折叠                                      |
| 登录 | 单口令，PBKDF2 校验 + HMAC 签名 cookie，同 IP 十分钟五次限流                                                  |
| 备份 | 每天把 D1 导成 markdown 提交回本仓库（`backup/`），格式与旧的静态站一致                                       |
| 主题 | 深浅色跟随系统，可手动切换，无闪烁                                                                            |

没有 RSS、没有 sitemap、没有标签系统、没有分享按钮 —— 都是有意不做的。标签的写法是标题末尾加 `#ai` 这样一个词，渲染时缩小退到浅色，仅此而已。

## 代码结构

```
src/
├── pages/
│   ├── index.astro            关于页（就是首页）
│   ├── posts/[...page].astro  文章索引：按年分组的紧凑单行
│   ├── posts/[id].astro       文章页（登录后可就地编辑）
│   ├── notes/[...page].astro  随记时间线
│   ├── search.astro           搜索
│   ├── login.astro            口令登录（站上没有任何地方链接到它）
│   ├── media/[...path].ts     图片出口，R2 桶保持私有
│   └── api/
│       ├── admin/             写接口，中间件统一鉴权
│       ├── auth/              登录 / 退出
│       ├── comments/[id].ts   读者提交评论
│       ├── views/[id].ts      浏览量自增
│       └── export.ts          备份用的全量导出
├── components/
│   ├── admin/                 三个就地编辑器（Post / Note / Page）+ CodeMirror 封装
│   └── ...                    时间线、页头页脚、评论、目录等
├── lib/                       数据访问与纯逻辑，见下
├── layouts/Site.astro         唯一的外壳
├── styles/                    theme.css（色板 + 排版 token）、typography.css、global.css
└── middleware.ts              认会话 + 边缘缓存
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
| `ratelimit.ts`                                                      | D1 固定窗口限流，评论和登录共用                          |
| `cache.ts`                                                          | 边缘缓存的判定与失效                                     |
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
pnpm db:migrate:local          # 建本地 D1 表结构
pnpm dev                       # http://localhost:4321
```

`.dev.vars`（已 gitignore）放本地机密：

```ini
SESSION_SECRET=随便一串随机值
ADMIN_PASSWORD_HASH=用 node scripts/hash-password.mjs 生成
EXPORT_TOKEN=随便一串随机值
```

改了 `.dev.vars` 要重启 dev server。若出现 `The file does not exist at node_modules/.vite/...`，是构建清掉了 Vite 的依赖缓存而 dev 进程还指着旧路径，`rm -rf node_modules/.vite` 后重启即可。

常用脚本：

```bash
pnpm build          # astro check + 构建
pnpm preview        # 用 wrangler 跑构建产物
pnpm format         # prettier
pnpm smoke          # 冒烟检查，见「部署」
pnpm db:console "SELECT * FROM entries LIMIT 5"
```

推送到 `main` 和开 PR 时，CI 会跑一遍 `format:check` 和 `build`（`.github/workflows/ci.yml`）。

## 配置

**站点常量**在 `src/site.ts`：标题、描述、作者、邮箱（页脚站名点开就是写邮件）、每页条数。

**绑定**在 `wrangler.jsonc`：

| 绑定    | 用途                   | 创建                                        |
| ------- | ---------------------- | ------------------------------------------- |
| `DB`    | D1，所有内容           | `wrangler d1 create mars-blog`              |
| `MEDIA` | R2，图片原件与各档变体 | `wrangler r2 bucket create mars-blog-media` |

> R2 的绑定名不能叫 `IMAGES` —— adapter 会把它当成 Cloudflare Images 服务绑定。

**机密**不写进仓库，用 `wrangler secret put` 设置：

| 名字                  | 说明                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `ADMIN_PASSWORD_HASH` | 站长口令的 PBKDF2 哈希，用 `node scripts/hash-password.mjs` 生成 |
| `SESSION_SECRET`      | 会话 cookie 的 HMAC 密钥，换掉它等于让所有会话立刻失效           |
| `EXPORT_TOKEN`        | 每日备份拉 `/api/export` 用                                      |

> PBKDF2 的迭代次数固定 100000 —— Workers 的 WebCrypto 硬上限就是这个数，再高会抛 `NotSupportedError`，而且本地 miniflare 不拦，只会在线上炸。真正拦人的是限流加一个二十位以上的随机口令。

**GitHub Actions**（每日备份）需要仓库变量 `SITE_URL` 和仓库密钥 `EXPORT_TOKEN`，与线上的那个一致。

## 部署

```bash
pnpm build
pnpm exec wrangler deploy
```

或者 `pnpm deploy`（两步合一）。**部署完跑一次冒烟**：

```bash
pnpm smoke                              # 打线上
pnpm smoke http://localhost:4321        # 打本地
```

它检查若干路由的状态码、写接口无会话是否 401、错口令登录是否 302 而不是 500。有一类问题只在线上出现——Workers 的运行时限制本地 miniflare 不拦，构建和类型检查也看不见——这个脚本就是为它们准备的。

**数据库迁移**在 `migrations/`，按序号执行：

```bash
pnpm db:migrate        # 对线上库跑
```

> 顺序很重要：**先部署不再引用某列的代码，再对线上库删列**。反过来做会让线上在两次操作之间 500。

首次部署还要做的：

1. 建 D1 和 R2（见上表），把 `database_id` 填进 `wrangler.jsonc`
2. `pnpm db:migrate` 建表（迁移里带了一条 `slug='about'` 的初始记录，首页有东西可显示）
3. 三个 secret 设好
4. 打开 `/login` 输口令，然后就在页面上写

## 运维

平时不用管，但有三件事得知道它们存在。

**改了渲染链之后要重刷老内容。** `body_html` 是发布那一刻算好存进库的，之后再改 `src/lib/render.ts`（换 shiki 主题、改标题 id 的算法、改图片标签的拼法）都不会影响已经发出去的内容——它们会一直停在旧的 HTML 上。

```bash
MARS_SESSION=<cookie 值> pnpm rerender
```

cookie 从浏览器取：登录后 devtools → Application → Cookies → 复制 `mars_session` 的值。这个接口没有页面入口是有意的——它是运维动作，不该在读者能看到的界面上占一个按钮。

**没人引用的图片会攒着。** `images` 表没有 `entry_id`，删一篇文章或编辑时删掉一张图，R2 里的对象不会跟着消失。每日备份会把这类图片列进 `backup/orphans.json`，**只报告不删除**——草稿里、甚至还没保存的编辑器里都可能正引用着它。确认要清的话，手动删 R2 对象和 `images` 行。

**每日备份带图片二进制。** `backup/` 里除了 markdown 还有 `media/`，按 `<uid>/<宽度>.<扩展名>` 存，增量补齐（已有的不会重下）。只备份 markdown 的话，搬走之后每个 `/media/<uid>` 都是 404——D1 有 Time Travel，R2 什么都没有。

## 一些取舍

为什么内容离开 git、为什么不用 FTS5、为什么不做弹层、边缘缓存怎么保证不把登录态发给匿名访客 —— 这些写在 `DESIGN.md` 和相关文件的注释里。

`DESIGN.md` 与代码同步维护，记录的是「为什么这么做」；这份 README 记录「怎么用」。

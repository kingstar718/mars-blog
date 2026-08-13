# mars-blog 设计文档

> 版本说明：本文档主体写的是 v1（Cloudflare Workers + D1 + R2）时期的架构与取舍。
> v2（`v2-selfhost` 分支）已改为自部署：Node + SQLite + 本地磁盘，部署差异见
> README「自部署」章节；这里记录的"为什么"仍然有效，具体实现以代码为准。

自部署的中文博客：内容存在 SQLite、图片存在本地磁盘、整站跑在 Node 上。取代 `astro-paper-blog`（静态站，内容在 git 仓库里）。

这份文档记录**为什么这么做**；怎么跑起来、有哪些命令看 `README.md`。

## 一、为什么重做

`astro-paper-blog` 的内容是 git 仓库里的 Markdown，发布必须经过「写文件 → 提交 → 推送 → 构建」。这条链路在电脑前很顺，离开电脑就断了：手机上发一条带图随记要在快捷指令里搭二十多个动作，长文更无从谈起。

最初的判断是「缺一个写作后台」，于是先做了 `/admin`：列表、编辑器、评论审核、独立页面编辑。**这个判断只对了一半**——真正要的不是后台，是「打开就能写」。后台把写作从阅读里分了出去，于是每次改一个错别字都要跳一趟。第二轮把它整个拆掉了，见第二节。

内容由 D1 承载的代价是清楚的，见第七节。

## 二、总体形态

**没有后台。登录之后，阅读页面本身就是编辑界面。**

```
读者 ──→ 公开页面（SSR，从 D1 读，走边缘缓存）

作者 ──→ 同一批页面（带会话，绕开缓存，长出铅笔）
          └─ 点铅笔 → 这一块原地变成编辑态 → 写接口 → D1 / R2
```

具体到每一类内容：

| 内容   | 编辑入口             | 编辑态                                      |
| ------ | -------------------- | ------------------------------------------- |
| 文章   | 文章页右上角铅笔     | 标题落回 `h1` 的位置，正文落回正文的位置    |
| 随记   | 列表里每条右上角铅笔 | 那一条原地展开成编辑框                      |
| 关于页 | 页面右上角铅笔       | 同上，保存即生效                            |
| 评论   | 文章自己的评论区     | 待审评论排在它该在的位置，下面跟着通过/垃圾 |

这么做的理由是**上下文**：评论是回应某段话的，草稿是某一天写了一半的东西，它们都得和所在的位置待在一起才判断得了。后台列表把上下文全剥掉了。

顺带没了的东西：一个 React 路由、一个后台布局、一个列表页、一个整页编辑器、一个审核页。

**实现方式**：编辑器是一段普通的 `<script>`，把建好的 DOM 挂进服务端预留的空占位 `div`，同时把已渲染的正文 `hidden` 掉。所以正文始终是服务端渲染的 HTML（无 JS 可读、可缓存），编辑器只是临时盖在它的位置上。进出是淡入淡出，编辑框的最小高度取自原正文的高度，页面不跳。

这三段脚本各自封在一个只含 `<script>` 的 `.astro` 组件里，跟着 `{session && ...}` 一起条件渲染——Astro 按「组件有没有渲染」决定要不要发脚本，写在页面顶层的话匿名访客也会下载到 CodeMirror。

单仓库、单部署、单个 D1 绑定。UI 直接从 `astro-paper-blog` 搬：Timeline、画廊、`typography.css`、`theme.css`、字体分包都是 `.astro` + CSS，复制过来改数据源即可。这也是继续用 Astro 而不是换 React 全家桶的原因。

编辑器一开始是 React island，后来也去掉了——理由见第九节第 11 步。

## 三、技术栈

| 层     | 选型                        | 说明                                                        |
| ------ | --------------------------- | ----------------------------------------------------------- |
| 运行时 | Node（自部署）              | 自己的服务器 + systemd/pm2 + Nginx 反代                     |
| 框架   | Astro + `@astrojs/node`     | 全站 SSR，`output: "server"`                                |
| 数据   | SQLite（node:sqlite）       | 全部内容，唯一真相源                                        |
| 图片   | 本地磁盘或 S3 兼容存储      | 登录后在 `/settings` 配置并验证，经 `/media/[...path]` 出图 |
| 编辑器 | CodeMirror 6（原生 script） | Markdown 源码编辑，不做所见即所得                           |
| 登录   | 单口令                      | 部署环境变量 `ADMIN_PASSWORD`（明文），HMAC 签名 cookie     |
| 校验   | zod                         | 从旧站的 `content.config.ts` 搬，发布前跑                   |
| 备份   | 服务器本地 cron             | SQLite dump + `.data/` 目录同步（异地可选）                 |

编辑器选 CodeMirror 而不是 TipTap/Milkdown：技术文章带代码块，所见即所得反而碍事。

**登录一开始是 GitHub OAuth**，后来换成了口令。一个人用的站接 OAuth 太重：三个 secret、一个回调地址、换域名还要回第三方改配置。换掉的只是「签发会话之前那一下」，会话机制本身没动。口令是部署环境变量里的明文（`ADMIN_PASSWORD`），不落库；真正拦爆破的是限流：同 IP 十分钟五次，加上二十位以上的随机口令。

## 四、数据模型

```sql
-- 文章与随记共用一张表，用 kind 区分
CREATE TABLE entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL CHECK (kind IN ('post', 'note')),
  title         TEXT,                    -- note 为空
  body          TEXT NOT NULL,           -- Markdown 原文
  pub_datetime  TEXT NOT NULL,           -- 站点时间 'YYYY-MM-DD HH:mm:ss'
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  body_html     TEXT,                    -- 发布时渲染，只在发布时写
  headings_json TEXT                     -- 发布时抽出的 h2/h3，目录用
);

CREATE TABLE images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key     TEXT NOT NULL UNIQUE,
  variants   TEXT NOT NULL,              -- JSON：各尺寸的 key 与宽高
  created_at TEXT NOT NULL
);

CREATE TABLE comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id   INTEGER NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
  author     TEXT NOT NULL,
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'approved', 'spam')),
  created_at TEXT NOT NULL
);

-- 独立页面（关于）。没塞进 entries：kind 上有 CHECK 约束，
-- 加一个取值要整表重建，而 entries 被几张表外键引用着
CREATE TABLE pages (
  slug TEXT PRIMARY KEY, title TEXT NOT NULL,
  body TEXT NOT NULL, body_html TEXT, updated_at TEXT NOT NULL
);

CREATE TABLE views (
  entry_id INTEGER PRIMARY KEY REFERENCES entries (id) ON DELETE CASCADE,
  count    INTEGER NOT NULL DEFAULT 0
);

-- 固定窗口限流，评论和登录共用
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start TEXT NOT NULL
);
```

### 时间

所有时间列存 **站点时间（`Asia/Shanghai`）的 `YYYY-MM-DD HH:mm:ss`**，库里写的、导出的 frontmatter、页面上显示的是同一串字符。

一度改成过 ISO8601 UTC，理由是「后台有日期控件，存 UTC 才对」。后来日期控件去掉了——发布时间由按下发布的那一刻决定，不再由人填——那个理由就不成立了，于是 `0005_local_datetime.sql` 换了回来。

这是单人单时区站点才成立的选择：格式不带偏移量，换时区就是错的。字符串排序仍然等于时间排序，索引和 `ORDER BY` 不受影响。

**发布时间的规则**：首次发布时盖戳，之后无论改多少次都不变（改错别字不该把文章顶回时间线顶部）。「首次」看的是 `body_html` 是不是 NULL——它只在发布时写入，撤回不会清空——所以撤回再发也不会重置。

### 文章地址

`/posts/<id>`。曾经有一列 slug 用来给文章一个可读的英文 URL，但它只能手填——中文标题转不出像样的英文——所以在 `0008` 里去掉了，地址改用主键。代价是文章链接不再自解释。

### 随记与文章同表

两者只差几个字段（note 没有 title），拆两张表要在时间线查询里做 union，得不偿失。约束靠 zod 在写入前保证，不靠数据库。

### 删过的列

`slug`、`description`、`ai_generated`，以及 `entry_updates` / `entry_revisions` 两张表。删的理由都一样：**要人手动维护、维护错了没有任何提示**。AI 标记尤其典型——勾错、忘了勾都不会有人发现，最后改成在标题末尾写 `#ai`，标题本来就要写。

> SQLite 的 `DROP COLUMN` 不能删带索引或唯一约束的列，那种情况要整表重建；而 `views` 对 `entries` 有外键，`DROP TABLE entries` 会级联清空它——`0008` 就是这么把浏览量清掉过一次，后来改成先把数据搬进无外键的临时表再重建。**上线顺序也重要：先部署不再引用某列的代码，再对线上库删列。**

## 五、图片管线

`astro:assets` 没了——body 里引用的是 R2 的地址，Astro 不处理远程图，`srcset`、webp、宽高属性会一起消失。

**在浏览器里生成多尺寸**，这是唯一的免费路径：

1. 选图后用 Canvas 缩到 400 / 800 / 1600 三档
2. 每档出 webp + jpeg 兜底
3. 一起传 R2，把各尺寸的 key 和宽高写进 `images.variants`
4. 渲染时读 `variants` 拼 `srcset` 和 `width`/`height`

Workers 上跑不了 sharp，CF Images 的变换要付费，所以计算放在浏览器端。好处是不花服务端算力，坏处是上传时手机会卡一下。

`width`/`height` 必须写进标签，否则图片加载时会有布局跳动——原来这是 `astro:assets` 自动做的。

`createImageBitmap` 要带 `imageOrientation: "from-image"`，否则手机竖拍的照片会按 EXIF 之前的方向躺倒。

### 正文里怎么引用

存的是 `![](/media/<uid>)` 这种短引用，不是 R2 的完整 URL。markdown 的 `![]()` 塞不下 `srcset`，所以渲染时按 uid 查出全部尺寸再拼标签。好处是换域名、换存储只用改渲染那一处，正文不动。

### 图片出口

桶保持私有，一律经 `/media/[...path]` 读：

- `/media/<uid>` → 最大的 jpeg，给不认识 srcset 的地方兜底
- `/media/<uid>/<宽度>.<扩展名>` → 指定变体，`srcset` 里用的就是这些

也可以给 R2 挂自定义域名让 CDN 直接回源、省掉 Worker 调用。没这么做是因为桶要转公开、还多一个域名要管；key 里带 uid、内容不可变，加上一年的 `immutable` 缓存后回源次数本来就极少。

### 随记里的图

一条随记可能带好几张图。默认只出一排 52px 的缩略图，点一下才就地展开大图，再点收起——一列随记里每条都先摊开一张三百多像素高的图，翻起来太重。大图的框子固定 3:2，换图时高度不变，页面不会上下弹；只有一张图时不存在切换，按原比例展示。

不做全屏弹层：随记本身内联在时间线里，覆盖全屏的层打断感太强。

## 六、缓存与鉴权

公开页面每次访问都要跑一遍 SSR 加若干条 SQLite 查询，首页尤其亏。v1 用 Cloudflare 的 Cache API 在边缘存 60 秒；v2 把这层交给 Nginx microcache（同样 60 秒左右、带会话的请求绕开），发布接口的 `purge` 因此成为空操作——短 TTL 兜新鲜度。

**登录态的页面绝不能进缓存**——那份 HTML 带着编辑按钮和草稿，被原样发给匿名访客就是事故。所以中间件里带会话的请求一律绕开缓存，读和写都不碰；`shouldCache` 再把 `/api/`、`/search`、`/login` 排除掉，是第二道保险。

鉴权只有两件事：认一遍会话（HMAC 验签，不查库）、守住 `/api/admin/*`。公开页面也认会话——登录之后列表要长出铅笔、草稿要进时间线、评论区要出审核操作。

会话是一个签名 cookie，不落库：单用户站点不需要 session 表，能证明「你输对过口令」就够了，所以载荷里只有过期时间，没有身份。代价是签发后无法主动吊销，有效期压到 7 天；签名密钥由口令派生（不单独配置），真要立刻失效就换口令再重启。

## 七、内容离开 git 之后

这几样东西不会自己存在，必须显式补上。

| 失去              | 补法                                   |
| ----------------- | -------------------------------------- |
| `git log` / 回滚  | SQLite 在线备份（`.backup`），粒度自定 |
| 整库拿走的能力    | SQLite dump + markdown 导出脚本        |
| schema 构建期校验 | zod 移到 API 层，发布前校验            |
| prettier 格式检查 | 内容统一由编辑器生成，不再有人手写     |
| pagefind 搜索     | 换成全表 LIKE，见下                    |

**备份必须做**，它是「哪天想搬走就能搬走」的保险。SQLite 是单机文件，没有版本恢复机制，
备份就是唯一的回滚手段。v1 用 GitHub Actions 每日拉 `/api/export` 提交回仓库；
v2 移除了 GitHub 同步，改为服务器本地 cron：SQLite 在线备份（`.backup`）加
`.data/` 目录增量同步，异地再放一份更好。

## 八、几个具体结论

**搜索：直接 LIKE 扫表，没有建 FTS5。** 试过，两条路都不通：默认的 `unicode61` 分词器按空白切词，中文一整句变成一个 token；换成 `trigram` 能做中文子串匹配，但它要求查询至少三个字符——「字体」「排版」这类两字词一律返回 0 条，而这恰恰是中文最常用的构词单位。本站几十到几百篇的量级，全表 LIKE 在 D1 上是毫秒级。

**评论：自建，不挂 giscus。** 既然内容已经在 SQLite，评论也放这儿，备份和迁移只有一处。新评论一律 pending。防垃圾是蜜罐 + 限流：蜜罐字段不参与 zod 校验，否则返回的 400 等于告诉脚本这个字段不能填，蜜罐当场失效。量上来了再加 Turnstile。

**浏览量：D1 的 UPSERT 原子自增**，不用 KV（最终一致、无原子自增，并发会丢更新）。累加在客户端触发，服务端渲染时加会把爬虫和预取一起算进去。

**排版只有三档**：正文 17/18px（文章、随记、关于页），列表和从属内容 16px，元信息 14px。字号行高定义在 `theme.css` 的 `--reading-*`，`.app-prose` 和 CodeMirror 读同一份——写的时候的换行位置就是发出去之后的换行位置。全站没有分隔线，分隔靠留白；唯一的实心色块是配图。

## 九、走过的路

1. **骨架** — Worker + Astro + D1 建表 + 登录 + 后台列表页
2. **编辑器** — CodeMirror + 自动保存 + 预览 + zod 校验 + 发布
3. **图片** — Canvas 多尺寸 + R2
4. **前台** — 从 `astro-paper-blog` 搬 UI，接 D1
5. **迁移** — 旧站的文章、随记、图片导入 D1
6. **加固** — 本地备份（SQLite `.backup` + `.data/` 同步）
7. **增量** — 浏览量、评论、搜索、目录、边缘缓存、限流
8. **拆后台** — 编辑并回阅读页，`/admin` 整棵删除
9. **收口** — 登录换成口令，首页换成关于页，「短文」改称「随记」
10. **清残枝** — 拆后台留下的无主接口（预览、后台列表、待审评论列表）和一次性迁移脚本一起删掉
11. **去 React** — 三个编辑器改写成原生 script，全站不再有客户端框架

后面这三步是这个项目真正想清楚的地方：**减法比加法难**。前七步在加功能，后三步在把加过头的东西拿掉——一个人用的博客不需要后台、不需要 OAuth、不需要一个和列表页重复的首页。

第 10 步值得单独记一笔：删一个功能，界面上的入口好删，**背后那条链不会自己消失**。`/admin` 拆掉大半年后，`GET /api/admin/entries`、`GET /api/admin/comments`、整个 `/api/admin/preview` 还挂在那里，各自还牵着一个 `db.ts` 里的查询函数——没有任何调用方，但每次改 schema 都要顺手改它们，还占着鉴权面。这类东西靠读代码发现不了（每个文件单独看都合理），得反过来查：**对每个导出的符号，问一句「谁在调你」**。

第 11 步不是为了性能。React 只在登录态加载，匿名访客一个字节都没付过，省下的 60KB 全落在我自己头上。真正的理由是**它是这个代码库里唯一的例外**：评论、目录、图片缩放、主题切换本来就都是 `.astro` 里的原生 `<script>`，只有编辑器另起一套。而那三个岛没用到任何 React 独有的东西——没有 context、没有 suspense、没有生态组件，就是 `useState` + `createPortal` 裹着一个本来就是命令式的 CodeMirror。最能说明问题的是 `Markdown.tsx`：`useEffect` 里 `new EditorView()`，再用 `useImperativeHandle` 把 `insert`/`focus` 暴露出去——套一层声明式外壳，套完立刻从 ref 打洞钻回命令式。去掉之后那个文件反而更短。

代价是 `disabled` 这类状态要自己写回 DOM。这在只有五个按钮的界面里是可以接受的，再复杂就该把框架请回来。

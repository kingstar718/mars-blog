# mars-blog 设计文档

带写作后台的动态博客，全部跑在 Cloudflare 上。取代 `astro-paper-blog`（静态站，内容在 git 仓库里）。

## 一、为什么重做

`astro-paper-blog` 的内容是 git 仓库里的 Markdown，发布必须经过「写文件 → 提交 → 推送 → 构建」。这条链路在电脑前很顺，离开电脑就断了：手机上发一条带图短文要在快捷指令里搭二十多个动作，长文更无从谈起。

真正缺的是一个**写作后台**：打开就能写、草稿自动保存、图片粘贴即传、发布一键完成。这件事静态站绕不过去，所以内容改由 D1 承载。

代价是清楚的，见「六、失去了什么，怎么补」。

## 二、总体形态

**一个 Astro 项目跑在 Cloudflare Workers 上**，公开页面和后台在同一个部署里。

```
读者  ──→  公开页面（SSR，从 D1 读）
作者  ──→  /admin（React island 编辑器）──→  API ──→  D1 / R2
```

单仓库、单部署、单个 D1 绑定。不拆成「前台 + 后台」两个 Worker——单用户规模下，拆开只是多一份部署和一份跨域配置。

UI 直接从 `astro-paper-blog` 搬：Timeline、TimelineItem、画廊、`typography.css`、`theme.css`、字体分包都是 `.astro` + CSS，复制过来改数据源即可，不重写。这也是继续用 Astro 而不是换 React 全家桶的原因。

## 三、技术栈

| 层     | 选型                          | 说明                                                     |
| ------ | ----------------------------- | -------------------------------------------------------- |
| 运行时 | Cloudflare Workers            | Pages 正在并入 Workers                                   |
| 框架   | Astro + `@astrojs/cloudflare` | 公开页 SSR，后台 `prerender = false`                     |
| 数据   | D1                            | 全部内容，唯一真相源                                     |
| 图片   | R2 + 自定义域名               | 已绑定支付方式                                           |
| 编辑器 | CodeMirror 6（React island）  | Markdown 源码编辑，不做所见即所得                        |
| 登录   | GitHub OAuth                  | 单用户，校验 login 即可，不建用户表                      |
| 校验   | zod                           | 从 `astro-paper-blog/src/content.config.ts` 搬，发布前跑 |
| 备份   | Cron Trigger Worker           | 每日导出 Markdown 推 GitHub，见第六节                    |

编辑器选 CodeMirror 而不是 TipTap/Milkdown：技术文章带代码块，所见即所得反而碍事。

## 四、数据模型

```sql
-- 文章与短文共用一张表，用 kind 区分
CREATE TABLE entries (
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL,          -- 'post' | 'note'
  slug          TEXT UNIQUE,            -- note 可为空
  title         TEXT,                   -- note 为空
  description   TEXT,                   -- post 必填，<= 45 字
  body          TEXT NOT NULL,          -- Markdown 原文
  pub_datetime  TEXT NOT NULL,          -- ISO8601 UTC
  status        TEXT NOT NULL,          -- 'draft' | 'published'
  featured      INTEGER NOT NULL DEFAULT 0,
  ai_generated  INTEGER,
  canonical_url TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- 对应原 frontmatter 的 updates[]
CREATE TABLE entry_updates (
  id       INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  datetime TEXT NOT NULL,
  action   TEXT NOT NULL,               -- 创建 | 修改 | 排版 | 翻译
  note     TEXT NOT NULL,
  agent    TEXT NOT NULL
);

-- git 历史的替代品，见第六节
CREATE TABLE entry_revisions (
  id               INTEGER PRIMARY KEY,
  entry_id         INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  body             TEXT NOT NULL,
  frontmatter_json TEXT NOT NULL,
  created_at       TEXT NOT NULL
);

CREATE TABLE images (
  id         INTEGER PRIMARY KEY,
  entry_id   INTEGER REFERENCES entries(id) ON DELETE SET NULL,
  r2_key     TEXT NOT NULL UNIQUE,
  variants   TEXT NOT NULL,             -- JSON：各尺寸的 key 与宽高
  created_at TEXT NOT NULL
);

CREATE TABLE views (
  slug  TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);
```

### 时间

`pub_datetime` 存 **ISO8601 UTC**，读出来再转 `Asia/Shanghai` 显示。

原方案存的是本地时间字符串 `"YYYY-MM-DD HH:mm"`——那是为了让手写 frontmatter 时所见即所得，现在时间由后台的日期控件产生，这个理由不成立了。迁移脚本负责换算。

### 短文与文章同表

两者只差几个字段（note 没有 title/description/featured），拆两张表要在时间线查询里做 union，得不偿失。约束靠 zod 在写入前保证，不靠数据库。

## 五、图片管线

`astro:assets` 没了——body 里引用的是 R2 的绝对 URL，Astro 不处理远程图，`srcset`、webp、宽高属性会一起消失。

**在浏览器里生成多尺寸**，这是唯一的免费路径：

1. 选图后用 Canvas 缩到 400 / 800 / 1600 三档
2. 每档出 webp + jpeg 兜底，共 6 个文件
3. 一起传 R2，把各尺寸的 key 和宽高写进 `images.variants`
4. 前台读 `variants` 拼 `srcset` 和 `width`/`height`

Workers 上跑不了 sharp，CF Images 的变换要付费，所以计算放在浏览器端。好处是不花服务端算力，坏处是上传时手机会卡一下。

`width`/`height` 必须写进标签，否则图片加载时会有布局跳动——原来这是 `astro:assets` 自动做的。

## 六、失去了什么，怎么补

内容离开 git 之后，这几样东西不会自己存在，必须显式补上。

| 失去              | 补法                                          |
| ----------------- | --------------------------------------------- |
| `git log` / 回滚  | `entry_revisions`，每次发布快照正文           |
| 整库拿走的能力    | Cron Trigger 每日导出 Markdown 推 GitHub 仓库 |
| schema 构建期校验 | zod 移到 API 层，发布前校验                   |
| prettier 格式检查 | 后台统一生成，格式由代码保证，不再有人手写    |
| CI 收录检查       | 不再需要——文件名截断这类问题不存在了          |
| pagefind 搜索     | 见「七、待定」                                |

**每日导出必须做**，它是「哪天想搬走就能搬走」的保险。D1 有 Time Travel，但那是 Cloudflare 的恢复机制，不是你能读、能 grep、能带走的东西。约五十行代码。

## 七、待定

- **搜索**：pagefind 依赖静态 HTML，SSR 下不可用。候选：D1 的 FTS5 全文索引（中文分词是问题）、或公开页改回 SSG + Deploy Hook 保住 pagefind。一期先不做搜索。
- **评论**：二期。表结构先不定，等确定自建还是 giscus。
- **浏览量**：`views` 表已留位。用 `ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count` 原子自增，不要用 KV（最终一致、无原子自增，并发会丢更新）。

## 八、分期

1. **骨架** — Worker + Astro + D1 建表 + GitHub OAuth + 后台列表页
2. **编辑器** — CodeMirror + 自动保存 + 近似预览 + zod 校验 + 发布
3. **图片** — Canvas 多尺寸 + R2 + 自定义域名
4. **前台** — 从 `astro-paper-blog` 搬 UI，接 D1
5. **迁移** — 现有 6 篇文章、5 条短文、4 张图导入 D1
6. **加固** — revisions、每日导出备份
7. **增量** — 浏览量、评论、搜索

五之前 `astro-paper-blog` 照常使用，两边互不影响。

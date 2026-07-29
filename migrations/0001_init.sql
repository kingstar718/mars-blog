-- mars-blog 初始表结构
-- 设计说明见 DESIGN.md「四、数据模型」

-- 文章与短文共用一张表，用 kind 区分。
-- 两者只差几个字段，拆表要在时间线查询里做 union，得不偿失；
-- 「note 不能有 title」这类约束由 zod 在写入前保证，不放进数据库。
CREATE TABLE entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT    NOT NULL CHECK (kind IN ('post', 'note')),
  slug          TEXT    UNIQUE,
  title         TEXT,
  description   TEXT,
  body          TEXT    NOT NULL,
  -- ISO8601 UTC。显示时转 Asia/Shanghai，见 src/lib/datetime.ts
  pub_datetime  TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  featured      INTEGER NOT NULL DEFAULT 0,
  ai_generated  INTEGER,
  canonical_url TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

-- 时间线要按发布时间倒序取已发布的内容，这是最热的查询
CREATE INDEX idx_entries_timeline ON entries (status, pub_datetime DESC);
CREATE INDEX idx_entries_kind ON entries (kind, status, pub_datetime DESC);

-- 对应原 frontmatter 的 updates[]，文末更新记录
CREATE TABLE entry_updates (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
  datetime TEXT    NOT NULL,
  action   TEXT    NOT NULL CHECK (action IN ('创建', '修改', '排版', '翻译')),
  note     TEXT    NOT NULL,
  agent    TEXT    NOT NULL
);

CREATE INDEX idx_entry_updates_entry ON entry_updates (entry_id, datetime DESC);

-- git 历史的替代品：每次发布快照一份正文。
-- 内容离开 git 之后，没有这张表就意味着一次误操作永久丢失。
CREATE TABLE entry_revisions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id         INTEGER NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
  body             TEXT    NOT NULL,
  frontmatter_json TEXT    NOT NULL,
  created_at       TEXT    NOT NULL
);

CREATE INDEX idx_entry_revisions_entry ON entry_revisions (entry_id, created_at DESC);

-- variants 是 JSON：各尺寸的 R2 key 与宽高，前台据此拼 srcset。
-- 宽高必须记下来，否则图片加载时会有布局跳动——
-- 这原本是 astro:assets 自动做的，现在没有了。
CREATE TABLE images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id   INTEGER REFERENCES entries (id) ON DELETE SET NULL,
  r2_key     TEXT    NOT NULL UNIQUE,
  variants   TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);

CREATE INDEX idx_images_entry ON images (entry_id);

-- 用 UPSERT 原子自增，不要换成 KV：
-- KV 最终一致且没有原子自增，并发读会丢更新。
CREATE TABLE views (
  slug  TEXT    PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

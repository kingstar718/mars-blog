-- v3 静态化：D1 只需要评论、浏览量、限流三张表。
-- 历史迁移（v1/v2 的 entries/comments/views/settings 等）已随静态化删除；
-- 已存在的线上库不受影响，本文件用 IF NOT EXISTS 保证可重复应用。

-- 固定窗口限流，评论和浏览量共用（key 是 IP 加盐后的 SHA-256）
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT    PRIMARY KEY,
  count        INTEGER NOT NULL,
  -- 窗口起点，站点时间的 'YYYY-MM-DD HH:mm:ss'
  window_start TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

-- 浏览量按路径计数，同 IP 24 小时一次
CREATE TABLE IF NOT EXISTS page_views (
  path  TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

-- 评论按文章 slug 关联，新评论一律 pending，站长就地审核
CREATE TABLE IF NOT EXISTS post_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_slug TEXT    NOT NULL,
  author     TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'approved', 'spam')),
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_comments_slug
  ON post_comments (entry_slug, status, created_at);

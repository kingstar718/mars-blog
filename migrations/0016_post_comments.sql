-- v3 静态化：评论改按文章 slug 关联。
-- 旧 comments 表按数字 entry_id，帖子改 slug 后无法复用；
-- 复用旧 D1 时执行本迁移新建表，旧评论数据需要额外映射才能迁过来。
CREATE TABLE post_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_slug TEXT    NOT NULL,
  author     TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'approved', 'spam')),
  created_at TEXT    NOT NULL
);

CREATE INDEX idx_post_comments_slug ON post_comments (entry_slug, status, created_at);

-- 评论。
--
-- 自建而不是挂 giscus：既然内容已经在 D1，评论也放这儿，备份和迁移只有一处。
-- 代价是防垃圾要自己做，status 这一列就是为审核留的。
CREATE TABLE comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id   INTEGER NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
  author     TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'approved', 'spam')),
  created_at TEXT    NOT NULL
);

CREATE INDEX idx_comments_entry ON comments (entry_id, status, created_at);

-- 搜索没有建 FTS5 表，这是刻意的：
-- 默认的 unicode61 分词器按空白切词，中文一整句会变成一个 token；
-- 换成 trigram 又要求查询至少三个字符，「字体」「排版」这类两字词一律搜不到，
-- 而它们恰恰是中文最常用的构词单位。
-- 本站内容量级下直接 LIKE 扫表更准也更简单，见 src/lib/search.ts。

-- 去掉 entries.slug（后台里那个「英文标题」）。
--
-- 文章的地址随之改成 /posts/<id>。slug 存在的唯一理由就是给文章一个
-- 可读的英文 URL，既然不再手填，就没有别的东西能生成它——中文标题
-- 转不出像样的英文。
--
-- 必须重建表：slug 上有 UNIQUE 约束，SQLite 的 DROP COLUMN 不能删有索引的列。
--
-- 顺序有讲究，踩过一次：views 要改成按 entry_id 计数，如果先建好带
-- 「REFERENCES entries ON DELETE CASCADE」的新表再去 DROP 旧的 entries，
-- 那一刻级联会把刚灌进去的计数全部清空。所以先把 slug→id 的对应关系
-- 存进一张没有外键的临时表，等 entries 重建完再拿它去还原 views。
--
-- comments 那边躲不掉：它的外键指向 entries，DROP TABLE entries 时评论会被
-- 级联删除。线上评论表是空的，本地只有测试数据，这个代价可以接受。
-- 重命名之后 comments 的外键会重新指回 entries，不需要额外处理。

CREATE TABLE slug_map AS SELECT id, slug FROM entries;

CREATE TABLE entries_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT    NOT NULL CHECK (kind IN ('post', 'note')),
  title         TEXT,
  body          TEXT    NOT NULL,
  pub_datetime  TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  ai_generated  INTEGER,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  body_html     TEXT
);

INSERT INTO entries_new
  (id, kind, title, body, pub_datetime, status, ai_generated, created_at, updated_at, body_html)
SELECT
   id, kind, title, body, pub_datetime, status, ai_generated, created_at, updated_at, body_html
FROM entries;

DROP INDEX IF EXISTS idx_entries_timeline;
DROP INDEX IF EXISTS idx_entries_kind;
DROP TABLE entries;
ALTER TABLE entries_new RENAME TO entries;

CREATE INDEX idx_entries_timeline ON entries (status, pub_datetime DESC);
CREATE INDEX idx_entries_kind ON entries (kind, status, pub_datetime DESC);

CREATE TABLE views_new (
  entry_id INTEGER PRIMARY KEY REFERENCES entries (id) ON DELETE CASCADE,
  count    INTEGER NOT NULL DEFAULT 0
);

INSERT INTO views_new (entry_id, count)
SELECT m.id, v.count FROM views v JOIN slug_map m ON m.slug = v.slug;

DROP TABLE views;
ALTER TABLE views_new RENAME TO views;
DROP TABLE slug_map;

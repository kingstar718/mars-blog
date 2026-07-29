-- 去掉「文末更新记录」和「文章摘要」两个功能。
--
-- 更新记录是从旧站 frontmatter 的 updates[] 搬过来的，现在不要了；
-- description 曾经出现在时间线的标题下面和 <meta name="description">，也一并去掉。
--
-- 这两份数据在仓库的 backup/ 里还留着一份（提交 e5d1f57 之前的导出带 updates 和
-- description），真要找回去 git 历史里翻得到。entry_revisions 里的
-- frontmatter_json 快照同样保留着当时的 description。

DROP INDEX IF EXISTS idx_entry_updates_entry;
DROP TABLE IF EXISTS entry_updates;

ALTER TABLE entries DROP COLUMN description;

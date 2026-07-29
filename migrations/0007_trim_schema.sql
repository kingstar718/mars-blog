-- 精简表结构：去掉四样从来没用起来的东西。
--
-- 1. entries.canonical_url —— 11 行全是 NULL，后台没有任何地方能填它，
--    只有导出时会在非空的情况下输出一行。旧站留下的转载规范链接字段。
--
-- 2. entries.featured —— 「精选」这个功能不要了，连同后台的勾选框和
--    时间线上的星标一起去掉。
--
-- 3. images.entry_id 与 idx_images_entry —— 上传发生在图片插进正文之前，
--    那时还不知道属于哪条内容，所以这一列从来没被写过。
--    等于在一个恒为 NULL 的列上挂了个索引。
--
-- 4. entry_revisions —— 当初的定位是「git 历史的替代品」，但每日备份
--    已经把全站导成 markdown 提交进 GitHub，两者职责重叠，只差粒度。
--    表里一条数据都没有。
--
-- 顺带：「首次发布」的判断依据随之从 entry_revisions 改成了 body_html
--       是否为 NULL（它只在发布时写入，撤回不会清空），见 src/lib/entries.ts。

DROP INDEX IF EXISTS idx_entry_revisions_entry;
DROP TABLE IF EXISTS entry_revisions;

DROP INDEX IF EXISTS idx_images_entry;
ALTER TABLE images DROP COLUMN entry_id;

ALTER TABLE entries DROP COLUMN canonical_url;
ALTER TABLE entries DROP COLUMN featured;

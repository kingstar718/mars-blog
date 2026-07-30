-- 删掉 entries.ai_generated。
--
-- 这个标记要人在编辑器里手动勾，勾错、忘了勾都没有任何提示，
-- 维护成本全在人身上。改成写标题时加个 #ai，标题本来就要写。
--
-- 该列没有索引，也不在任何约束里，SQLite 可以直接 DROP COLUMN，
-- 不必重建整张表（重建会连带 views 的外键，见 0008 踩过的坑）。
--
-- 上线顺序：先部署不再引用该列的代码，再对远端库跑这条。
ALTER TABLE entries DROP COLUMN ai_generated;

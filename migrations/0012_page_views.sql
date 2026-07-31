-- 浏览量从「按文章计数」改成「按路径计数」。
--
-- 原来只有文章页在计数，随记列表、首页、搜索页一次访问都不留痕，
-- 所以问「全站被看了多少次」答不上来。改成以路径为键之后，
-- 全站合计就是一句 SUM，而文章页那个「N 次阅读」仍然读同一张表——
-- 一套机制，一个口径，不再是两个都叫「浏览量」但含义不同的数字。
--
-- 代价是丢掉了 entry_id 的外键级联：删一篇文章，它那行计数不会跟着消失。
-- 这是有意的——删了再重建同一个地址，历史计数应该接得上；真要清理，
-- 孤儿路径和孤儿图片一样是「报告而不自动删」的那一类。

CREATE TABLE page_views (
  -- 只存路径，不带 query：搜索页的 ?q= 是任意的，带上会把表撑爆
  path  TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

-- 已有的文章浏览量原样搬过去，地址就是它现在的地址
INSERT INTO page_views (path, count)
SELECT '/posts/' || entry_id, count FROM views;

DROP TABLE views;

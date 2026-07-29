-- 文章的目录。
--
-- 旧站的目录来自 Astro 渲染 markdown 时顺带给出的 headings，构建期就有了。
-- 这边渲染发生在发布那一刻，所以把标题一并存下来，读的时候不用再解析 HTML。
-- 结构是 [{ depth, slug, text }]，slug 用 github-slugger 生成，与旧站同一算法，
-- 老文章里指向锚点的链接不会失效。
ALTER TABLE entries ADD COLUMN headings_json TEXT;

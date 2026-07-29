-- 正文渲染结果的缓存。
--
-- 旧站 markdown 转 HTML 是构建期做的，内容进 D1 之后没有构建期了。
-- 每次请求都跑一遍 remark + shiki 太贵，所以发布时算一次存下来，
-- 读的时候直接取。草稿预览仍然即时渲染，不写这一列。
ALTER TABLE entries ADD COLUMN body_html TEXT;

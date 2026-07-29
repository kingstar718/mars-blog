-- 独立页面（关于等）。
--
-- 没有塞进 entries：那张表的 kind 上有 CHECK 约束，加一个取值要整表重建，
-- 而 entries 被 entry_updates / entry_revisions / images / comments 四张表
-- 外键引用着，重建的风险远大于收益。独立页面本来就没有时间线、没有分页、
-- 不进搜索结果，和 entries 共用一张表也占不到便宜。
CREATE TABLE pages (
  slug       TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  body_html  TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO pages (slug, title, body, updated_at) VALUES (
  'about',
  '关于',
  '这里是陆上江南的博客。

我把它当作一片安静的自留地：记录技术折腾、工具使用、网页改造，也偶尔写一些和生活、阅读、长期主义有关的东西。内容不追求高频更新，更希望每一篇都留下当时真实的问题、判断和取舍。

这个站点跑在 Cloudflare 上，内容存在 D1，图片存在 R2，写作和发布都在自建的后台里完成。它的前身是一个基于 AstroPaper 改造的静态站，排版、字体和阅读体验一并搬了过来。

你可以在这里找到：

- 博客改造过程和工程记录
- Markdown、Astro、前端工具链相关笔记
- 一些中文写作和排版实验
- 后续慢慢补上的个人观察

如果想联系我：[GitHub](https://github.com/kingstar718) · [邮箱](mailto:kingstar718@foxmail.com)',
  '2026-07-29T05:00:00.000Z'
);

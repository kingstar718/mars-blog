# mars-blog 设计文档

> 版本说明：本文档对应 v3（静态化）。v1/v2（Cloudflare Workers / 自部署 SQLite）
> 的历史理由已随代码删除，这里只记 v3 的架构与取舍。

## 一、总体形态

**静态页 + Functions 动态层。**

```
读者 ──→ Pages 静态 HTML（构建期生成，CDN 缓存）

作者 ──→ 同一批页面（登录后长出铅笔）
          └─ 点铅笔 → 就地编辑 → PUT /api/content → R2 → Deploy Hook → 重建
```

- 内容真相源是 **R2 内容桶里的 markdown**（posts/ notes/ pages/）
- 构建期 `scripts/sync-content.mjs` 用 S3 协议把 R2 拉到 `src/content/`，Astro 渲染成纯 HTML
- 动态能力全部走 Pages Functions：登录、内容读写、评论、浏览量、图片代理
- 编辑保存 = 写 R2 + 触发 Deploy Hook 重建，新内容约 1-2 分钟后上线

为什么静态化：一个个人博客的阅读流量是压倒性的，静态页零计算、全缓存、
免费额度用不完；需要动态的部分（一个月写几篇、几条评论、几个浏览数）
边缘函数完全扛得住。

## 二、没有后台

**登录之后，阅读页面本身就是编辑界面。** 文章页点铅笔原地变编辑态，
随记在列表里就地展开，关于页同理；评论审核就在文章的评论区里——
评论是回应某段话的，得和那篇文章待在一起才判断得了。

编辑器是原生 textarea，直接在 markdown 源码上写；阅读态始终是服务端渲染的
HTML（无 JS 可读、可缓存），编辑态只是临时盖在它上面。编辑器刻意不做语法
高亮——写作态的渲染一律交给构建产物，编辑器只负责文本与图片插入，整包不到
2 KB，只在点下铅笔后才动态加载，匿名访客永远拿不到。

## 三、技术栈

| 层       | 选型                       | 说明                                                             |
| -------- | -------------------------- | ---------------------------------------------------------------- |
| 托管     | Cloudflare Pages           | 静态 HTML + Functions，生产分支 main                             |
| 框架     | Astro 6 + Vite 7           | `output: "static"`，配置用 .mjs（理由见文件头注释）              |
| 内容     | R2（S3 协议）              | markdown 真相源；构建期拉取                                      |
| 图片     | R2 + `/media/*` 代理       | 私有桶，浏览器端压缩三档上传                                     |
| 动态数据 | D1                         | 评论（post_comments）、浏览量（page_views）、限流（rate_limits） |
| 登录     | 单口令                     | `ADMIN_PASSWORD` + HMAC cookie，7 天过期                         |
| 编辑器   | 原生 textarea              | 就地编辑，点铅笔才加载                                           |
| 样式     | Tailwind v4 + 自定义 token | theme.css 色板 / typography.css 排版三档                         |

## 四、内容模型

一篇内容 = R2 里一个 .md 文件。frontmatter 是唯一元数据：

```yaml
---
title: 标题
pubDatetime: 2026-08-13T09:00:00.000Z
description: ...
featured: false
draft: false
updated: ...
---
正文
```

- 文章 slug = 文件名（支持中文）；随记无标题；关于页固定 `pages/about.md`
- schema 校验在 `src/content.config.ts`，构建期由 astro:content 执行
- `draft: true` 的条目不生成页面（因此 v3 没有「草稿页」，见取舍）

## 五、动态层

### 登录与会话

口令登录（`POST /api/auth/login`），会话是一个 HMAC 签名的 cookie，
密钥由口令派生（换口令即全部下线）。前端用 `GET /api/auth/session`
判断登录态，决定是否显示编辑入口。

### 内容读写

- `GET /api/content`：列目录；`GET /api/content/<key>`：读文件
- `PUT /api/content/<key>`：写文件 + 触发 Deploy Hook
- `DELETE /api/content/<key>`：删除 + 触发 Deploy Hook
- 会话校验统一在 `functions/api/content/_middleware.ts`

### 评论

`/api/comments`：提交（pending）+ 读者拉已通过列表；`?all=1` 且登录时返回
全量供就地审核；`/api/admin/comments` 通过/垃圾。限流：同 IP 十分钟三条
（D1 固定窗口）。

### 浏览量

`POST /api/views` 按路径计数，同 IP 24 小时一次；`GET /api/views/total`
（登录）给页脚的「N 次访问」。

### 图片

浏览器端压缩成 400/800/1600 三档 webp+jpeg，`POST /api/admin/images`
写 MEDIA 桶，正文里存 `![](/media/<uid>)` 短引用；`/media/[...path]`
代理出图，key 带 uid 内容不可变，一年 immutable 缓存。

## 六、关键取舍

- **没有草稿页**：静态构建不渲染 `draft: true`，草稿无从打开；
  「新文章」走独立的 `/new-post` 页面，保存即发布
- **没有设置页**：v2 的 `/settings` 是配 S3 存储，v3 图片直传 R2，页面失去意义
- **保存不是即时的**：写 R2 后要等重建（1-2 分钟）才生效，代价换来了
  读者端永远是缓存友好的纯静态页
- **搜索是客户端过滤**：构建期把内容打进索引，浏览器端实时过滤；
  个人博客数据量完全扛得住，换来零动态接口
- **中文 slug**：文章地址直接用文件名，中文标题不需要转英文
- **目录编辑态接管**：进编辑态后目录从编辑器实时算（只认 h2/h3），
  退出还原构建时那份

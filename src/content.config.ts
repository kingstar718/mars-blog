import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "zod";

/**
 * 静态化（v3）的内容集合。
 *
 * 内容真相源是 R2 里的 markdown（scripts/sync-content.mjs 拉到
 * src/content/），schema 与旧 DB 的 frontmatter 字段一一对应，
 * 校验规则沿用旧站 astro-paper-blog 的 content.config。
 */

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string().min(1, "文章必须有标题"),
    description: z.string().optional().default(""),
    /** ISO8601 UTC，展示时转 Asia/Shanghai */
    pubDatetime: z.coerce.date(),
    featured: z.boolean().optional().default(false),
    canonical_url: z.string().url().optional(),
    /** true 时构建跳过，用于「存草稿」 */
    draft: z.boolean().optional().default(false),
    updated: z.coerce.date().optional(),
  }),
});

/** 随记没有标题，正文一两段直接在时间线里展开 */
const notes = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/notes" }),
  schema: z.object({
    pubDatetime: z.coerce.date(),
    draft: z.boolean().optional().default(false),
  }),
});

/** 固定页（目前只有首页的 about） */
const pages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string().optional().default(""),
  }),
});

export const collections = { posts, notes, pages };

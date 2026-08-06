import type { APIRoute } from "astro";
import { db } from "@/lib/env";
import { listPublishedByKind, type EntryRow } from "@/lib/db";
import { formatMachine, now, toSiteTime } from "@/lib/datetime";
import { site } from "@/site";

/**
 * Atom 订阅源，地址 /feed.xml。
 *
 * README 曾经写着「没有 RSS」是有意不做，这次加回来：个人博客给读者
 * 最传统的出口就是订阅源，而成本只有这一个文件——正文 HTML 发布时
 * 已经渲染好存在库里，取最新 N 条拼 XML 就行，还能走全站那套边缘缓存
 * （s-maxage=60，发布时跟着 purge 一起清，见 lib/cache.ts）。
 *
 * 文章和随记都在里面；随记没有详情页，链接指向时间线。
 * 正文里的 /media/... 是站内相对地址，这里补成绝对地址，订阅器才能显示图。
 */

const FEED_LIMIT = 20;

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/** 把正文里的站内图片地址补成绝对地址 */
const absoluteMedia = (html: string, origin: string) =>
  html.replaceAll("/media/", `${origin}/media/`);

const entryXml = (row: EntryRow, origin: string) => {
  const isPost = row.kind === "post";
  const href = isPost ? `${origin}/posts/${row.id}` : `${origin}/notes`;
  const title = isPost
    ? (row.title ?? "无题")
    : `随记 ${toSiteTime(row.pub_datetime).format("YYYY-MM-DD HH:mm")}`;
  const body = row.body_html ?? escapeXml(row.body);

  return [
    "    <entry>",
    `      <title>${escapeXml(title)}</title>`,
    `      <link href="${escapeXml(href)}"/>`,
    `      <id>${escapeXml(href)}</id>`,
    `      <updated>${escapeXml(formatMachine(row.pub_datetime))}</updated>`,
    `      <content type="html">${escapeXml(absoluteMedia(body, origin))}</content>`,
    "    </entry>",
  ].join("\n");
};

export const GET: APIRoute = async ({ url }) => {
  const origin = url.origin;
  const database = db();

  // 两种内容各取一页，合并后按发布时间倒序截前 FEED_LIMIT 条
  const [posts, notes] = await Promise.all([
    listPublishedByKind(database, "post", FEED_LIMIT),
    listPublishedByKind(database, "note", FEED_LIMIT),
  ]);
  const entries = [...posts.results, ...notes.results]
    .sort((a, b) => (a.pub_datetime < b.pub_datetime ? 1 : -1))
    .slice(0, FEED_LIMIT);

  const updated = entries[0]
    ? formatMachine(entries[0].pub_datetime)
    : formatMachine(now());

  const xml = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom">`,
    `  <title>${escapeXml(site.title)}</title>`,
    `  <subtitle>${escapeXml(site.description)}</subtitle>`,
    `  <link href="${escapeXml(origin)}/"/>`,
    `  <link rel="self" href="${escapeXml(origin)}/feed.xml"/>`,
    `  <updated>${escapeXml(updated)}</updated>`,
    `  <author>`,
    `    <name>${escapeXml(site.author)}</name>`,
    `    <email>${escapeXml(site.email)}</email>`,
    `  </author>`,
    `  <id>${escapeXml(origin)}/</id>`,
    ...entries.map(row => entryXml(row, origin)),
    `</feed>`,
  ].join("\n");

  return new Response(xml, {
    headers: { "content-type": "application/atom+xml; charset=utf-8" },
  });
};

import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { toSiteString } from "@/lib/entries";
import { site } from "@/site";

/**
 * Atom 订阅源，地址 /feed.xml。构建期从内容集合生成，
 * 随每次部署一起发布。文章和随记都在里面；
 * 随记没有详情页，链接指向时间线。
 */

const FEED_LIMIT = 20;

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const markdownToHtml = async (markdown: string) =>
  String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeStringify)
      .process(markdown)
  );

/** 把正文里的站内图片地址补成绝对地址 */
const absoluteMedia = (html: string, origin: string) =>
  html.replaceAll("/media/", `${origin}/media/`);

export const GET: APIRoute = async ({ url }) => {
  const origin = url.origin;
  const posts = (await getCollection("posts")).filter(post => !post.data.draft);
  const notes = (await getCollection("notes")).filter(note => !note.data.draft);

  const entries = [...posts, ...notes]
    .sort((a, b) => b.data.pubDatetime.getTime() - a.data.pubDatetime.getTime())
    .slice(0, FEED_LIMIT);

  const entryXml = [];
  for (const entry of entries) {
    const isPost = entry.collection === "posts";
    const pub = toSiteString(entry.data.pubDatetime);
    const href = isPost ? `${origin}/posts/${entry.id}` : `${origin}/notes`;
    const title = isPost ? entry.data.title : `随记 ${pub.slice(0, 10)}`;
    const body = await markdownToHtml(entry.body ?? "");
    entryXml.push(
      [
        "    <entry>",
        `      <title>${escapeXml(title)}</title>`,
        `      <link href="${escapeXml(href)}"/>`,
        `      <id>${escapeXml(href)}</id>`,
        `      <updated>${escapeXml(entry.data.pubDatetime.toISOString())}</updated>`,
        `      <content type="html">${escapeXml(absoluteMedia(body, origin))}</content>`,
        "    </entry>",
      ].join("\n")
    );
  }

  const updated = entries[0]
    ? entries[0].data.pubDatetime.toISOString()
    : new Date().toISOString();

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
    ...entryXml,
    `</feed>`,
  ].join("\n");

  return new Response(xml, {
    headers: { "content-type": "application/atom+xml; charset=utf-8" },
  });
};

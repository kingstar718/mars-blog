import assert from "node:assert/strict";
import test from "node:test";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { homeStats, fillHomeStats } from "../src/lib/homeStats.ts";

const now = Date.parse("2026-10-08T12:00:00Z");
const entry = (id, days, extra = {}) => ({
  id,
  data: { pubDatetime: new Date(now - days * 86400000), ...extra },
});

test("home metrics exclude drafts and future entries, and handle empty collections", () => {
  const values = homeStats(
    [entry("old", 42, { title: "旧文" }), entry("draft", 1, { draft: true })],
    [
      entry("recent", 2),
      entry("boundary", 7),
      entry("old", 8),
      entry("future", -1),
    ],
    now
  );
  assert.equal(values.recent_notes_count, "2");
  assert.equal(values.notes_count, "3");
  assert.equal(values.latest_post_days_ago, "42");
  assert.equal(values.latest_post_url, "/posts/old");
  assert.equal(homeStats([], [], now).latest_post_title, "");
});

test("author Markdown controls formatting and links, with escaped statistic values", async () => {
  const processor = await createMarkdownProcessor();
  const result = await processor.render(
    "我写了 **{{recent_notes_count}}** 条。\n\n`{{recent_notes_count}}`\n\n[《{{latest_post_title}}》]({{latest_post_url}})\n\n{{unknown}}"
  );
  const html = fillHomeStats(result.code, {
    recent_notes_count: "2",
    latest_post_title: "<script> & **标题**",
    latest_post_url: "/posts/example",
  });
  assert.match(html, /<strong>2<\/strong>/);
  assert.match(html, /<code>2<\/code>/);
  assert.match(html, /href="\/posts\/example"/);
  assert.match(html, /&lt;script&gt; &amp; \*\*标题\*\*/);
  assert.match(html, /{{unknown}}/);
  assert.doesNotMatch(html, /<script>/);
});

test("first entry spans both collections; calendar metrics use Shanghai dates", () => {
  const at = Date.parse("2026-01-01T00:10:00+08:00");
  const item = (id, date, extra = {}) => ({
    id,
    body: "你好 **世界** [hello](/ignored)",
    data: { pubDatetime: new Date(date), ...extra },
  });
  const posts = [item("p", "2025-12-31T23:50:00+08:00")];
  const notes = [
    item("n", "2025-12-30T12:00:00+08:00"),
    item("same-day", "2025-12-31T23:55:00+08:00"),
    item("new", "2026-01-01T00:05:00+08:00"),
    item("draft", "2000-01-01T00:00:00Z", { draft: true }),
  ];
  const values = homeStats(posts, notes, at);
  assert.equal(values.first_entry_date, "2025-12-30");
  assert.equal(values.blog_days, "3");
  assert.equal(values.writing_days, "3");
  assert.equal(values.year_posts_count, "0");
  assert.equal(values.year_notes_count, "1");
  assert.equal(values.total_words, "20");
  assert.equal(homeStats(notes, posts, at).first_entry_date, "2025-12-30");
  assert.equal(homeStats([], [], at).blog_days, "0");
  assert.equal(homeStats([], [], at).writing_days, "0");
});

test("word count excludes Markdown syntax, destinations, images, and code", async () => {
  const { countBodyWords } = await import("../src/lib/homeStats.ts");
  assert.equal(
    countBodyWords(
      "# 你好 **世界**\n\n[hello world](https://example.com) ![不计图片](x) `不计代码`\n\n```js\n不计代码\n```"
    ),
    6
  );
});

test("highlighted code replaces split variables while preserving markup and unknown tokens", async () => {
  const processor = await createMarkdownProcessor({
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    },
  });
  for (const language of ["json", "css", "yaml", "js", "text"]) {
    const result = await processor.render(
      `\`\`\`${language}\n{{posts_count}} {{latest_post_title}} {{unknown}}\n\`\`\``
    );
    const html = fillHomeStats(result.code, {
      posts_count: "7",
      latest_post_title: '<script> & "标题"',
    });
    const text = html.replace(/<[^>]*>/g, "");
    assert.equal(text, "7 &lt;script&gt; &amp; &quot;标题&quot; {{unknown}}");
    assert.deepEqual(
      html.match(/<\/?span\b[^>]*>/g),
      result.code.match(/<\/?span\b[^>]*>/g)
    );
    assert.doesNotMatch(html, /<script>/);
    assert.equal(fillHomeStats(result.code, {}), result.code);
  }
});

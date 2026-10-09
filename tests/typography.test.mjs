import assert from "node:assert/strict";
import test from "node:test";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import rehypeTypography from "../scripts/rehype-typography.mjs";

test("English reading blocks are marked while CJK and code remain unchanged", async () => {
  const processor = await createMarkdownProcessor({
    rehypePlugins: [rehypeTypography],
  });
  const { code } = await processor.render(
    "## English heading\n\nRead **one page** every day.\n\n中文与 English 2026 混排。\n\n日本語と English。\n\n- A quiet morning\n\n`const value = 123`\n\n```text\nEnglish code 123\n```"
  );
  assert.match(code, /<h2[^>]*lang="en"/);
  assert.match(code, /<p lang="en">Read <strong>one page<\/strong>/);
  assert.match(code, /<li lang="en">A quiet morning/);
  assert.match(code, /<p>中文与 English 2026 混排。<\/p>/);
  assert.match(code, /<p>日本語と English。<\/p>/);
  assert.match(code, /<p><code>const value = 123<\/code><\/p>/);
  assert.doesNotMatch(code, /<(?:pre|code)[^>]*lang="en"/);
});

test("author language declarations and their descendants are respected", () => {
  const paragraph = {
    type: "element",
    tagName: "p",
    properties: {},
    children: [{ type: "text", value: "An English sentence." }],
  };
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "div",
        properties: { lang: "fr" },
        children: [paragraph],
      },
    ],
  };
  rehypeTypography()(tree);
  assert.equal(tree.children[0].properties.lang, "fr");
  assert.equal(paragraph.properties.lang, undefined);
});

test("statistic placeholders do not classify Chinese titles as English", async () => {
  const { fillHomeStats } = await import("../src/lib/homeStats.ts");
  const processor = await createMarkdownProcessor({
    rehypePlugins: [rehypeTypography],
  });
  const { code } = await processor.render(
    "[**{{latest_post_title}}**]({{latest_post_url}})\n\n## {{latest_post_title}}\n\n> Latest: {{latest_post_title}}\n\nAn English sentence."
  );
  const html = fillHomeStats(code, {
    latest_post_title: "中文标题",
    latest_post_url: "/posts/example",
  });
  assert.match(
    html,
    /<p><a href="\/posts\/example"><strong>中文标题<\/strong><\/a><\/p>/
  );
  assert.doesNotMatch(html, /<(?:h2|blockquote)[^>]*lang="en"/);
  assert.match(html, /<p>Latest: 中文标题<\/p>/);
  assert.match(html, /<p lang="en">An English sentence\.<\/p>/);
});

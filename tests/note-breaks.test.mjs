import assert from "node:assert/strict";
import test from "node:test";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import remarkNoteBreaks from "../scripts/remark-note-breaks.mjs";

const processor = await createMarkdownProcessor({
  remarkPlugins: [remarkNoteBreaks],
});
const noteURL = new URL("../src/content/notes/breaks.md", import.meta.url);

test("notes preserve soft breaks, paragraph boundaries, and inline markup", async () => {
  const { code } = await processor.render(
    "第一行\n**第二行**\n[第三行](/notes)\n\n另一段\n\n> 引用一\n> 引用二\n\n- 列表一\n  列表二",
    { fileURL: noteURL }
  );
  assert.match(code, /第一行<br>\n<strong>第二行<\/strong><br>\n<a/);
  assert.match(code, /<p>另一段<\/p>/);
  assert.match(code, /引用一<br>\n引用二/);
  assert.match(code, /列表一<br>\n列表二/);
});

test("notes keep hard breaks and code intact; posts and pages retain soft breaks", async () => {
  const { code } = await processor.render(
    "第一行  \n第二行\n\n`inline code`\n\n```text\ncode one\ncode two\n```",
    { fileURL: noteURL }
  );
  assert.equal((code.match(/<br>/g) ?? []).length, 1);
  assert.match(code, /<code>inline code<\/code>/);
  const pre = code.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/)?.[0];
  assert.ok(pre);
  assert.doesNotMatch(pre, /<br>/);
  assert.equal(pre.replace(/<[^>]*>/g, ""), "code one\ncode two");
  for (const collection of ["posts", "pages"]) {
    const { code: html } = await processor.render("第一行\n第二行", {
      fileURL: new URL(
        `../src/content/${collection}/breaks.md`,
        import.meta.url
      ),
    });
    assert.equal(html, "<p>第一行\n第二行</p>");
  }
});

test("Atom rendering can explicitly enable note breaks without a content path", async () => {
  const render = async isNote =>
    String(
      await unified()
        .use(remarkParse)
        .use(remarkNoteBreaks, { notesOnly: !isNote })
        .use(remarkRehype)
        .use(rehypeStringify)
        .process("第一行\n第二行")
    );
  assert.equal(await render(true), "<p>第一行<br>\n第二行</p>");
  assert.equal(await render(false), "<p>第一行\n第二行</p>");
});

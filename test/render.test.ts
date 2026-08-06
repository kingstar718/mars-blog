import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "@/lib/render";
import type { StoredImage } from "@/lib/images";

describe("标题与目录", () => {
  it("抽出各级标题并给标题加锚点 id", async () => {
    const { html, headings } = await renderMarkdown(
      "# 一级\n\n## 二级标题\n\n### 三级\n\n正文"
    );
    assert.deepEqual(headings, [
      { depth: 1, slug: "一级", text: "一级" },
      { depth: 2, slug: "二级标题", text: "二级标题" },
      { depth: 3, slug: "三级", text: "三级" },
    ]);
    assert.ok(html.includes('id="二级标题"'));
  });

  it("重复标题得到不重复的 slug", async () => {
    const { headings } = await renderMarkdown("## 重复\n\n## 重复\n\n### 重复");
    const slugs = headings.map(heading => heading.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });
});

describe("图片展开", () => {
  const uid = "00000000-0000-0000-0000-000000000000";

  it("把 /media 短引用展开成带 srcset 的 img", async () => {
    const image: StoredImage = {
      uid,
      variants: [
        { key: `${uid}/400.webp`, width: 400, height: 300, format: "webp" },
        { key: `${uid}/800.webp`, width: 800, height: 600, format: "webp" },
      ],
    };
    const { html } = await renderMarkdown(
      `![图](/media/${uid})`,
      new Map([[uid, image]])
    );
    assert.ok(html.includes(`src="/media/${uid}/800.webp"`));
    assert.ok(html.includes(`/media/${uid}/400.webp 400w`));
    assert.ok(html.includes(`/media/${uid}/800.webp 800w`));
    assert.ok(html.includes('loading="lazy"'));
  });
});

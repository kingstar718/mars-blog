import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";
import type { Plugin } from "unified";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import vitesseLight from "shiki/themes/vitesse-light.mjs";
import vitesseDark from "shiki/themes/vitesse-dark.mjs";
import langTs from "shiki/langs/typescript.mjs";
import langJs from "shiki/langs/javascript.mjs";
import langBash from "shiki/langs/bash.mjs";
import langJson from "shiki/langs/json.mjs";
import langCss from "shiki/langs/css.mjs";
import langHtml from "shiki/langs/html.mjs";
import langMd from "shiki/langs/markdown.mjs";
import langSql from "shiki/langs/sql.mjs";
import langAstro from "shiki/langs/astro.mjs";
import langYaml from "shiki/langs/yaml.mjs";
import GithubSlugger from "github-slugger";
import type { StoredImage } from "./images";

/**
 * markdown -> HTML。
 *
 * 旧站这一步由 Astro 的 remark/rehype 链完成，内容在 D1 之后没有构建期了，
 * 只能自己搭一条等价的。配色和 transformer 与旧站保持一致，
 * 这样搬过来的 typography.css 不用改。
 *
 * 渲染结果缓存进 entries.body_html（发布时算一次），不在每次请求里跑 shiki。
 */

// JS 正则引擎而不是默认的 oniguruma WASM：Workers 上不用操心 WASM 的加载和体积。
// 代价是少数极复杂的语法定义可能不被支持，常用语言没问题。
const highlighter = await createHighlighterCore({
  themes: [vitesseLight, vitesseDark],
  langs: [
    langTs,
    langJs,
    langBash,
    langJson,
    langCss,
    langHtml,
    langMd,
    langSql,
    langAstro,
    langYaml,
  ],
  engine: createJavaScriptRegexEngine(),
});

const KNOWN_LANGS = new Set(highlighter.getLoadedLanguages());

const highlight = (code: string, lang: string) =>
  highlighter.codeToHtml(code, {
    lang: KNOWN_LANGS.has(lang) ? lang : "text",
    themes: { light: "vitesse-light", dark: "vitesse-dark" },
    // 逐 span 输出 --shiki-light / --shiki-dark 变量，由 CSS 决定用哪套，
    // 而不是输出两份 HTML。旧站也是这个设置。
    defaultColor: false,
    transformers: [
      transformerNotationHighlight(),
      transformerNotationWordHighlight(),
      transformerNotationDiff({ matchAlgorithm: "v3" }),
    ],
  });

/** 把 <pre><code class="language-x"> 换成 shiki 的输出 */
const rehypeShiki = () => (tree: Root) => {
  visit(tree, "element", (node: Element, index, parent) => {
    if (node.tagName !== "pre" || !parent || index === undefined) return;
    const code = node.children[0];
    if (code?.type !== "element" || code.tagName !== "code") return;

    const className = Array.isArray(code.properties?.className)
      ? code.properties.className.join(" ")
      : "";
    const lang = /language-(\S+)/.exec(className)?.[1] ?? "text";
    const source = code.children
      .map(child => (child.type === "text" ? child.value : ""))
      .join("")
      .replace(/\n$/, "");

    parent.children[index] = {
      type: "raw",
      value: highlight(source, lang),
    } as never;
  });
};

/**
 * 把 /media/<uid> 展开成带 srcset 和宽高的 <img>。
 *
 * markdown 的 ![]() 塞不下 srcset，所以正文里只存短引用，这里再查表补齐。
 * 宽高必须写上，缺了图片加载时会有布局跳动——旧站这是 astro:assets 干的。
 */
const rehypeImages: Plugin<[Map<string, StoredImage>], Root> =
  images => tree => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img") return;
      const src = String(node.properties?.src ?? "");
      const uid = /^\/media\/([0-9a-f-]{36})$/.exec(src)?.[1];
      if (!uid) return;

      const image = images.get(uid);
      if (!image) return;

      const sorted = [...image.variants].sort((a, b) => a.width - b.width);
      const webp = sorted.filter(variant => variant.format === "webp");
      const jpeg = sorted.filter(variant => variant.format === "jpeg");
      const largest = (jpeg.length > 0 ? jpeg : webp).at(-1);
      if (!largest) return;

      const srcset = (webp.length > 0 ? webp : jpeg)
        .map(
          variant =>
            `/media/${uid}/${variant.width}.${variant.format === "webp" ? "webp" : "jpg"} ${variant.width}w`
        )
        .join(", ");

      node.properties = {
        ...node.properties,
        src: `/media/${uid}/${largest.width}.${largest.format === "webp" ? "webp" : "jpg"}`,
        srcset,
        sizes: "(max-width: 768px) 100vw, 768px",
        width: largest.width,
        height: largest.height,
        loading: "lazy",
        decoding: "async",
      };
    });
  };

export interface Heading {
  depth: number;
  slug: string;
  text: string;
}

/** hast 节点里的纯文本，用来做标题的锚点和目录文案 */
const textOf = (node: Element): string =>
  node.children
    .map(child =>
      child.type === "text"
        ? child.value
        : child.type === "element"
          ? textOf(child)
          : ""
    )
    .join("");

/**
 * 给标题加 id，同时把目录收集出来。
 *
 * 旧站这一步是 Astro 自带的 rehypeHeadingIds 做的，用的是 github-slugger，
 * 这里保持同一个算法——锚点链接才不会因为换了实现而失效。
 */
const rehypeHeadings: Plugin<[Heading[]], Root> = headings => tree => {
  const slugger = new GithubSlugger();
  visit(tree, "element", (node: Element) => {
    const match = /^h([1-6])$/.exec(node.tagName);
    if (!match) return;
    const text = textOf(node);
    const slug = slugger.slug(text);
    node.properties = { ...node.properties, id: slug };
    headings.push({ depth: Number(match[1]), slug, text });
  });
};

export const renderMarkdown = async (
  markdown: string,
  images: Map<string, StoredImage> = new Map()
) => {
  const headings: Heading[] = [];
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeShiki)
    .use(rehypeImages, images)
    .use(rehypeHeadings, headings)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown);

  return { html: String(file), headings };
};

/** 正文里引用到的所有图片 uid */
export const extractImageUids = (markdown: string) => [
  ...new Set(
    [...markdown.matchAll(/\/media\/([0-9a-f-]{36})/g)].map(match => match[1])
  ),
];

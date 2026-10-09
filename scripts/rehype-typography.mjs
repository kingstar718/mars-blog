/** 在构建期区分纯英文阅读块；保留显式语言、代码及中英混排正文。 */
export default function rehypeTypography() {
  const blocks = new Set([
    "p",
    "li",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "h4",
    "th",
    "td",
  ]);
  const cjk =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
  const text = node => {
    if (node.type === "text") return node.value;
    if (["pre", "code"].includes(node.tagName)) return "";
    return (node.children ?? []).map(text).join("");
  };
  return tree => {
    const visit = (node, explicitLanguage = false) => {
      if (node.type === "element") {
        if (["pre", "code"].includes(node.tagName)) return;
        const authored = Boolean(node.properties?.lang);
        if (!explicitLanguage && !authored && blocks.has(node.tagName)) {
          const words = text(node);
          if (/[A-Za-z]{2}/.test(words) && !cjk.test(words)) {
            node.properties ??= {};
            node.properties.lang = "en";
          }
        }
        explicitLanguage ||= authored;
      }
      for (const child of node.children ?? []) visit(child, explicitLanguage);
    };
    visit(tree);
  };
}

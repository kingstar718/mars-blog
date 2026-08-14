/**
 * 从 markdown 原文里抽大纲，带行号。
 *
 * 页面上那份目录是构建时算好的，编辑态下它显示的是**上一次发布**的结构。
 * 编辑态不能沿用它，得从编辑器里的当前内容重新算一份。
 * 与服务端同一条规则：只取 h2/h3，少于两条就不出目录。
 */

export interface OutlineItem {
  depth: 2 | 3;
  text: string;
  /** 1 起的行号，用来把编辑器滚过去 */
  line: number;
}

/** ``` 或 ~~~ 开头的围栏，最多缩进三格 */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
/** 同样允许最多三格缩进——CommonMark 是这么规定的 */
const ATX = /^ {0,3}(#{1,6})[ \t]+(.*)$/;

const stripInline = (text: string) =>
  text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]+#+[ \t]*$/, "")
    .trim();

export const extractOutline = (markdown: string): OutlineItem[] => {
  const items: OutlineItem[] = [];
  let fence: string | null = null;

  markdown.split("\n").forEach((raw, index) => {
    const fenced = FENCE.exec(raw);
    if (fenced) {
      const marker = fenced[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      return;
    }
    if (fence !== null) return;

    const matched = ATX.exec(raw);
    if (!matched) return;
    const depth = matched[1].length;
    if (depth !== 2 && depth !== 3) return;

    const text = stripInline(matched[2]);
    if (text) items.push({ depth, text, line: index + 1 });
  });

  return items;
};

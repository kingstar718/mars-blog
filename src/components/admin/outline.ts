/**
 * 从 markdown 原文里抽大纲，带行号。
 *
 * 页面上那份目录是发布时算好存进 headings_json 的，编辑态下它显示的是
 * **上一次发布**的结构——你新加的章节不在里面，删掉的还留着。所以编辑态
 * 不能沿用它，得从编辑器里的当前内容重新算一份。
 *
 * 和服务端那条链不是同一个实现：那边是渲染完在 hast 上走一遍（见
 * render.ts），这里只能扫源码，因为编辑器里的东西还没渲染。两边的规则
 * 保持一致——只取 h2/h3，少于两条就不出目录。
 */

export interface OutlineItem {
  depth: 2 | 3;
  text: string;
  /** 1 起的行号，用来把编辑器滚过去 */
  line: number;
}

/** ``` 或 ~~~ 开头的围栏，最多缩进三格（再多就是代码块内容了） */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
/** 同样允许最多三格缩进——CommonMark 是这么规定的，服务端的 remark 也这么认 */
const ATX = /^ {0,3}(#{1,6})[ \t]+(.*)$/;

/**
 * 标题里的行内标记去掉，跟服务端对齐——那边取的是渲染后的纯文本，
 * `## 用 \`zod\` 校验` 在目录里应该显示成「用 zod 校验」而不是带反引号。
 */
const stripInline = (text: string) =>
  text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // 结尾的 closing #（`## 标题 ##` 这种写法）不是内容
    .replace(/[ \t]+#+[ \t]*$/, "")
    .trim();

export const extractOutline = (markdown: string): OutlineItem[] => {
  const items: OutlineItem[] = [];
  // 记住开围栏用的是哪种符号：``` 开的只能被 ``` 关，中间的 ~~~ 是内容
  let fence: string | null = null;

  markdown.split("\n").forEach((raw, index) => {
    const fenced = FENCE.exec(raw);
    if (fenced) {
      const marker = fenced[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      return;
    }
    // 代码块里的 # 是注释或 shell 提示符，不是标题
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

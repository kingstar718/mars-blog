import { EditorView, minimalSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/**
 * CodeMirror 6 的薄封装。
 *
 * 用 minimalSetup 而不是 basicSetup：后者带行号、折叠栏、活动行高亮，
 * 那是给代码用的，写中文长文时全是噪音。行号一栏还会白占左边距。
 *
 * lineWrapping 必须开，否则长段中文会横向溢出。
 */

export interface EditorOptions {
  /** 初始内容。之后由编辑器自己拥有，外部改内容就重建 */
  value: string;
  /** 每次输入都调，用来更新按钮的 disabled */
  onChange?: (value: string) => void;
  /** 粘贴、拖入的图片 */
  onFiles?: (files: File[]) => void;
  /** 编辑区最小高度。列表里的就地编辑要矮一些，整页编辑要高一些 */
  minHeight?: string;
  /** 编辑区自己的上下留白。列表里的就地编辑要贴着原正文，所以传 0 */
  contentPadding?: string;
  /**
   * 固定高度。给了就由编辑器自己滚（CodeMirror 的 .cm-scroller），
   * 页面不再被文章撑长——否则写长文时上面的工具栏早就滚没了。
   */
  height?: string;
}

export interface EditorHandle {
  /** 宿主元素，自己挂进 DOM */
  el: HTMLElement;
  /** 在光标处插入文本，插完把光标移到末尾 */
  insert: (text: string) => void;
  /** 取得焦点，光标落到全文末尾 */
  focus: () => void;
  /** 当前内容 */
  value: () => string;
  /** 滚到某一行（1 起）并把光标放过去，编辑态的目录跳转用 */
  scrollToLine: (line: number) => void;
  /** 视口顶部那一行的行号，编辑态的 scroll-spy 用 */
  topLine: () => number;
  /** 编辑器自己的滚动容器。固定高度时页面不滚、它滚，监听要挂在这上面 */
  scroller: () => HTMLElement | null;
  destroy: () => void;
}

/**
 * 写作态的语法着色：靠字号和字重表达层级，颜色只用来压低标记符号。
 */
const prose = HighlightStyle.define([
  {
    tag: tags.heading1,
    fontSize: "1.5em",
    fontWeight: "600",
    lineHeight: "1.4",
  },
  {
    tag: tags.heading2,
    fontSize: "1.3em",
    fontWeight: "500",
    lineHeight: "1.4",
  },
  { tag: tags.heading3, fontSize: "1.125em", fontWeight: "500" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "500" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, color: "var(--foreground)" },
  { tag: tags.link, color: "var(--accent)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--faint)" },
  { tag: tags.quote, color: "var(--muted-foreground)" },
  { tag: tags.monospace, fontFamily: "var(--font-code)" },
  { tag: [tags.processingInstruction, tags.meta], color: "var(--faint)" },
]);

export const createEditor = ({
  value,
  onChange,
  onFiles,
  height,
  // 固定高度时正文要撑满滚动区，否则文章不满一屏，下半截点下去没反应
  minHeight = height ? "100%" : "60vh",
  contentPadding = "12px 0",
}: EditorOptions): EditorHandle => {
  const el = document.createElement("div");
  if (height) el.style.height = height;

  const pickFiles = (list: FileList | null | undefined) => {
    const files = [...(list ?? [])].filter(file =>
      file.type.startsWith("image/")
    );
    if (files.length === 0) return false;
    onFiles?.(files);
    return true;
  };

  const view = new EditorView({
    state: EditorState.create({
      doc: value,
      extensions: [
        minimalSetup,
        markdown(),
        syntaxHighlighting(prose),
        EditorView.lineWrapping,
        Prec.high(keymap.of([indentWithTab])),
        EditorView.updateListener.of(update => {
          if (update.docChanged) onChange?.(update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          paste: event => pickFiles(event.clipboardData?.files),
          drop: event => {
            if (pickFiles(event.dataTransfer?.files)) {
              event.preventDefault();
              return true;
            }
            return false;
          },
        }),
        EditorView.theme({
          "&": {
            fontSize: "var(--reading-font-size)",
            color: "var(--foreground)",
            backgroundColor: "transparent",
            ...(height ? { height: "100%" } : {}),
          },
          ...(height ? { ".cm-scroller": { overflow: "auto" } } : {}),
          "&.cm-focused": { outline: "none" },
          ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "var(--foreground)",
          },
          "&.cm-focused .cm-selectionBackground, ::selection": {
            backgroundColor: "var(--muted)",
          },
          ".cm-content": {
            fontFamily: "var(--font-app)",
            lineHeight: "var(--reading-line-height)",
            padding: contentPadding,
            minHeight,
          },
          ".cm-line": { padding: "0" },
        }),
      ],
    }),
    parent: el,
  });

  return {
    el,
    insert: text => {
      const at = view.state.selection.main.head;
      view.dispatch({
        changes: { from: at, insert: text },
        selection: { anchor: at + text.length },
      });
      view.focus();
    },
    focus: () => {
      view.dispatch({ selection: { anchor: view.state.doc.length } });
      view.focus();
    },
    value: () => view.state.doc.toString(),
    scrollToLine: line => {
      const clamped = Math.min(Math.max(line, 1), view.state.doc.lines);
      const { from } = view.state.doc.line(clamped);
      view.dispatch({
        selection: { anchor: from },
        effects: EditorView.scrollIntoView(from, { y: "start" }),
      });
      view.focus();
    },
    topLine: () =>
      view.state.doc.lineAt(
        view.lineBlockAtHeight(view.scrollDOM.scrollTop).from
      ).number,
    scroller: () => view.scrollDOM,
    destroy: () => view.destroy(),
  };
};

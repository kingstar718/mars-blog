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
 *
 * 这里没有框架：CodeMirror 本身就是命令式的，建一个 view、拿着它调
 * dispatch/focus。原来外面包了一层 React 组件，用 useEffect 建、
 * useImperativeHandle 再把 insert/focus 暴露回去——等于套一层声明式外壳，
 * 套完立刻从 ref 打洞钻出来。去掉之后少了三个 hook 和一次「外部 value
 * 变了要同步进来」的判等：文档由编辑器自己拥有，开的时候给初值就行。
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
 * 写作态的语法着色。
 *
 * CodeMirror 自带的 defaultHighlightStyle 是给代码用的：所有文本同一个字号，
 * 靠颜色区分。写长文时这样看不出结构——标题和正文一样大，扫一眼找不到章节。
 * 这里改成靠字号和字重表达层级，和前台的排版逻辑一致；颜色只用来压低标记符号
 * （## ** ` 这些），让它们退到背景里而不是抢眼。
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
    fontWeight: "600",
    lineHeight: "1.4",
  },
  { tag: tags.heading3, fontSize: "1.15em", fontWeight: "600" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, color: "var(--foreground)" },
  { tag: tags.link, color: "var(--accent)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--faint)" },
  { tag: tags.quote, color: "var(--muted-foreground)" },
  // 代码是唯一该用等宽的地方，正文用页面的阅读字体。
  // 这里不能带上 tags.content：那是「所有正文内容」的大类，加进来等于把
  // 整篇文章判给等宽字体——中文没有等宽字形会回退成宋体，看不出来，
  // 英文单词却会变成等宽，于是阅读态和编辑态的字体对不上
  { tag: tags.monospace, fontFamily: "var(--font-code)" },
  // 标记符号本身：不是内容，压到浅灰
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
  // 高度由下面 theme 里的 .cm-content 决定，这里不要再加 min-h。
  // 例外是固定高度：百分比要有一层有确定高度的父元素才算得出来，
  // 编辑器挂在这个 div 里，高度就得给它。
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
        // Tab 默认是「跳到下一个可聚焦元素」，在编辑器里按一下焦点就飞了。
        // Prec.high 保证它排在 minimalSetup 的 defaultKeymap 前面。
        Prec.high(keymap.of([indentWithTab])),
        EditorView.updateListener.of(update => {
          if (update.docChanged) onChange?.(update.state.doc.toString());
        }),
        // 贴图和拖图直接进上传，这是手机和截图流最顺的路径
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
          // 颜色一律走 CSS 变量，跟着页面主题走；写死的话暗色下是一块白
          "&": {
            // 字号行高读 theme.css 的 --reading-*，和 .app-prose 同一份：
            // 写的时候的换行位置就是发出去之后的换行位置。
            // 落在 .reading-note 子树里（比如评论）会自动跟着压小一档，
            // 不用传参
            fontSize: "var(--reading-font-size)",
            color: "var(--foreground)",
            backgroundColor: "transparent",
            // 高度落在上面那个宿主 div 上，编辑器撑满它即可
            ...(height ? { height: "100%" } : {}),
          },
          // 高度固定时由 CodeMirror 自己滚，滚动条贴着编辑框而不是整页
          ...(height ? { ".cm-scroller": { overflow: "auto" } } : {}),
          "&.cm-focused": { outline: "none" },
          ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "var(--foreground)",
          },
          "&.cm-focused .cm-selectionBackground, ::selection": {
            backgroundColor: "var(--muted)",
          },
          // 高度必须给到 .cm-content——它才是那个 contenteditable。
          // 只把外层撑高的话，正文不满一屏时下面全是死区：
          // 看着还在编辑框里，点下去焦点却落到页面上，敲什么都没反应。
          ".cm-content": {
            // 不能写 inherit：继承链上一级是 .cm-scroller，CodeMirror 在那里
            // 定了 monospace，inherit 拿到的是等宽而不是页面的阅读字体
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
        // y: "start" 把这一行顶到可视区顶部，跟阅读态点目录的落点一致
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

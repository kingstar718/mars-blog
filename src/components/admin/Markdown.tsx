import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { EditorView, minimalSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export interface MarkdownHandle {
  /** 在光标处插入文本，插完把光标移到末尾 */
  insert: (text: string) => void;
  /** 取得焦点，光标落到全文末尾 */
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onFiles?: (files: File[]) => void;
  /** 编辑区最小高度。列表里的就地编辑要矮一些，整页编辑要高一些 */
  minHeight?: string;
  ref?: Ref<MarkdownHandle>;
}

/**
 * CodeMirror 6 的薄封装。
 *
 * 用 minimalSetup 而不是 basicSetup：后者带行号、折叠栏、活动行高亮，
 * 那是给代码用的，写中文长文时全是噪音。行号一栏还会白占左边距。
 *
 * lineWrapping 必须开，否则长段中文会横向溢出。
 */

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
  // 代码是唯一该用等宽的地方，正文用页面的阅读字体
  {
    tag: [tags.monospace, tags.content],
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
  },
  // 标记符号本身：不是内容，压到浅灰
  { tag: [tags.processingInstruction, tags.meta], color: "var(--faint)" },
]);
export default function Markdown({
  value,
  onChange,
  onFiles,
  minHeight = "60vh",
  ref,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  // 回调放进 ref，避免它变化时重建整个编辑器（会丢光标和撤销历史）
  const handler = useRef(onChange);
  handler.current = onChange;
  const filesHandler = useRef(onFiles);
  filesHandler.current = onFiles;

  useImperativeHandle(ref, () => ({
    insert: text => {
      const instance = view.current;
      if (!instance) return;
      const at = instance.state.selection.main.head;
      instance.dispatch({
        changes: { from: at, insert: text },
        selection: { anchor: at + text.length },
      });
      instance.focus();
    },
    focus: () => {
      const instance = view.current;
      if (!instance) return;
      instance.dispatch({ selection: { anchor: instance.state.doc.length } });
      instance.focus();
    },
  }));

  useEffect(() => {
    if (!host.current) return;

    const pickFiles = (list: FileList | null | undefined) => {
      const files = [...(list ?? [])].filter(file =>
        file.type.startsWith("image/")
      );
      if (files.length === 0) return false;
      filesHandler.current?.(files);
      return true;
    };

    const instance = new EditorView({
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
            if (update.docChanged) handler.current(update.state.doc.toString());
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
              // 与 .app-prose 的阅读态一致（17px / 行高 1.8），
              // 写的时候的段落节奏就是发出去之后的段落节奏
              fontSize: "1.0625rem",
              color: "var(--foreground)",
              backgroundColor: "transparent",
            },
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
              lineHeight: "1.8",
              padding: "12px 0",
              minHeight,
            },
            ".cm-line": { padding: "0" },
          }),
        ],
      }),
      parent: host.current,
    });
    view.current = instance;

    return () => instance.destroy();
    // 只在挂载时建一次；后续外部改 value 走下面那个 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部替换内容（比如切换到另一篇）时同步进来，
  // 但要跳过「值本来就一样」的情况，否则每次输入都会重设光标
  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    const current = instance.state.doc.toString();
    if (current === value) return;
    instance.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  // 高度由上面 theme 里的 .cm-content 决定，这里不要再加 min-h
  return <div ref={host} />;
}

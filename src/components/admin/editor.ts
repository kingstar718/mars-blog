/**
 * 极简 textarea 编辑器。
 *
 * 编辑态只负责文本输入：语法高亮、目录精确联动这类「写作态渲染」由 Astro
 * 构建产物兑现，编辑器不重复做。换来的是零依赖、零体积，以及原生光标 /
 * 输入法行为——CodeMirror 时代光标偶发消失的问题一并消失。
 *
 * 对外接口与旧版一致（EditorHandle），四个编辑器页面和 TOC 无需改动：
 * - scrollToLine / topLine 在软换行下是近似值，够目录跳转和滚动高亮用
 * - insert / focus / value / onChange 与图片粘贴、拖入行为完全保留
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
  /** 固定高度。给了就由编辑器自己滚，页面不再被文章撑长 */
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

/** 行高的近似值：目录跳转和高亮的换算基数 */
const lineHeightOf = (textarea: HTMLTextAreaElement) => {
  const computed = parseFloat(getComputedStyle(textarea).lineHeight);
  return Number.isFinite(computed) && computed > 0 ? computed : 24;
};

/** 第 line 行（1 起）在全文里的字符偏移 */
const lineStart = (text: string, line: number) => {
  let at = 0;
  for (let i = 1; i < line; i += 1) {
    at = text.indexOf("\n", at);
    if (at < 0) return text.length;
    at += 1;
  }
  return at;
};

export const createEditor = ({
  value,
  onChange,
  onFiles,
  height,
  minHeight = height ? "100%" : "60vh",
  contentPadding = "12px 0",
}: EditorOptions): EditorHandle => {
  const el = document.createElement("div");
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.wrap = "soft";
  textarea.spellcheck = false;
  textarea.autocapitalize = "off";
  textarea.autocomplete = "off";
  textarea.autocorrect = false;

  Object.assign(textarea.style, {
    width: "100%",
    height: height ? "100%" : "auto",
    minHeight: height ? undefined : minHeight,
    resize: "none",
    border: "0",
    outline: "none",
    background: "transparent",
    color: "var(--foreground)",
    caretColor: "var(--foreground)",
    fontFamily: "var(--font-app)",
    fontSize: "var(--reading-font-size)",
    lineHeight: "var(--reading-line-height)",
    padding: contentPadding,
  });

  if (height) el.style.height = height;
  el.appendChild(textarea);

  const pickFiles = (list: FileList | null | undefined) => {
    const files = [...(list ?? [])].filter(file =>
      file.type.startsWith("image/")
    );
    if (files.length === 0) return false;
    onFiles?.(files);
    return true;
  };

  textarea.addEventListener("input", () => onChange?.(textarea.value));
  textarea.addEventListener("paste", event =>
    pickFiles(event.clipboardData?.files)
  );
  textarea.addEventListener("drop", event => {
    if (pickFiles(event.dataTransfer?.files)) event.preventDefault();
  });

  const totalLines = () => textarea.value.split("\n").length;

  return {
    el,
    insert: text => {
      const at = textarea.selectionStart ?? textarea.value.length;
      textarea.setRangeText(text, at, at, "end");
      onChange?.(textarea.value);
      textarea.focus();
    },
    focus: () => {
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    },
    value: () => textarea.value,
    scrollToLine: line => {
      const clamped = Math.min(Math.max(line, 1), totalLines());
      const from = lineStart(textarea.value, clamped);
      textarea.setSelectionRange(from, from);
      textarea.scrollTop = Math.max(0, (clamped - 1) * lineHeightOf(textarea));
      textarea.focus();
    },
    topLine: () =>
      Math.min(
        totalLines(),
        Math.max(1, Math.round(textarea.scrollTop / lineHeightOf(textarea)) + 1)
      ),
    scroller: () => textarea,
    destroy: () => {
      el.remove();
    },
  };
};

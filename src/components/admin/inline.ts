import type { EditorHandle } from "./editor";
import { resizeImage } from "./resize";
import { uploadImage } from "./api";

/**
 * 三个就地编辑器（文章 / 随记 / 关于页）共用的那部分。
 *
 * 它们的差别只在「藏哪几个节点、挂进哪个占位、按钮行有哪些动作」，
 * 而进出编辑态的时序、图片上传、打开即聚焦这三件事三处一模一样。
 */

/**
 * CodeMirror 那一包压到构建产物里是 500 KB。
 * 改成点下去才拉。promise 记在模块作用域里：三个编辑器共用同一次下载，
 * 第二次进编辑态直接命中，不会重复请求。
 */
let editorModule: Promise<typeof import("./editor")> | null = null;
export const loadEditor = () => (editorModule ??= import("./editor"));

/**
 * 登录态下，页面空闲时就把它拉下来，不等你点铅笔。
 */
export const preloadEditor = () => {
  const run = () => void loadEditor();
  if ("requestIdleCallback" in window) {
    requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1000);
  }
};

/** 与 global.css 的动画时长、页面上 duration-150 保持一致 */
const FADE_MS = 150;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** 传节点的函数而不是节点本身：随记那边要编辑哪一条是点下去才知道的 */
type ReadingNodes = () => (HTMLElement | null)[];

/** 一处挂载。文章有两处：标题落回 h1 的位置，正文落回正文的位置 */
export interface Mount {
  slot: HTMLElement;
  node: HTMLElement;
}

export interface Opened {
  mounts: Mount[];
  editor: EditorHandle;
}

/** 淡入用动画，淡出用过渡 */
const ENTER = ["transition-opacity", "duration-150", "note-editor-enter"];

export const createInline = () => {
  let open = false;
  let mounts: Mount[] = [];
  let editor: EditorHandle | null = null;

  /**
   * 进入编辑态。`build` 里做各自的取数据和建 DOM。
   * 取数据失败就把阅读态恢复原样，什么都不改。
   */
  const start = async (reading: ReadingNodes, build: () => Promise<Opened>) => {
    if (open) return;
    const nodes = reading();
    for (const node of nodes) {
      if (node) node.style.opacity = "0";
    }
    try {
      const [opened] = await Promise.all([build(), wait(FADE_MS)]);
      for (const node of nodes) {
        if (node) {
          node.hidden = true;
          node.style.opacity = "";
        }
      }
      mounts = opened.mounts;
      editor = opened.editor;
      for (const mount of mounts) {
        mount.node.classList.add(...ENTER);
        mount.slot.appendChild(mount.node);
      }
      open = true;
      editor.focus();
    } catch (error) {
      for (const node of nodes) {
        if (node) node.style.opacity = "";
      }
      throw error;
    }
  };

  /** 退出编辑态，把阅读态淡回来 */
  const close = async (reading: ReadingNodes) => {
    if (!open) return;
    for (const mount of mounts) {
      mount.node.classList.remove("note-editor-enter");
      mount.node.classList.add("opacity-0");
    }
    await wait(FADE_MS);
    for (const mount of mounts) mount.node.remove();
    editor?.destroy();
    mounts = [];
    editor = null;
    for (const node of reading()) {
      if (!node) continue;
      node.style.opacity = "0";
      node.hidden = false;
      requestAnimationFrame(() => {
        node.style.opacity = "";
      });
    }
    open = false;
  };

  return {
    start,
    close,
    isOpen: () => open,
    editor: () => editor,
  };
};

/**
 * 选图 / 粘贴 / 拖入都走这里：先在浏览器压出多个尺寸再上传，插进光标处。
 *
 * 多张图之间不留空行——随记的画廊靠「同一个段落里的连续 img」识别。
 */
export const createUploader = (
  getEditor: () => EditorHandle | null,
  /** 上传中的张数变了就调一次，用来更新那句「上传 N 张…」 */
  onCount: (count: number) => void
) => {
  let uploading = 0;

  return async (files: File[]) => {
    uploading += files.length;
    onCount(uploading);
    try {
      const snippets: string[] = [];
      for (const file of files) {
        const variants = await resizeImage(file);
        const form = new FormData();
        form.set(
          "meta",
          JSON.stringify(
            variants.map(({ width, height, format }) => ({
              width,
              height,
              format,
            }))
          )
        );
        variants.forEach((variant, index) =>
          form.append(`file${index}`, variant.blob)
        );
        const { markdown } = await uploadImage(form);
        snippets.push(markdown);
      }
      getEditor()?.insert(`\n\n${snippets.join("\n")}\n\n`);
    } catch (error) {
      alert(`上传失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      uploading = Math.max(0, uploading - files.length);
      onCount(uploading);
    }
  };
};

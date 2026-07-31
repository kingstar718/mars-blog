import { useEffect, useRef, useState } from "react";
import type { MarkdownHandle } from "./Markdown";
import { resizeImage } from "./resize";
import { uploadImage } from "./api";

/**
 * 三个就地编辑器（文章 / 随记 / 关于页）共用的那部分。
 *
 * 它们的差别只在「藏哪几个节点、挂进哪个占位、按钮行有哪些动作」，
 * 而进出编辑态的时序、图片上传、打开即聚焦这三件事三处一模一样。
 * 原来是各写一遍，六百行里三分之一是重复的——改一处淡出时长要改三个文件。
 *
 * 时序本身是有讲究的，也正是不该复制三遍的原因：
 * 阅读态先淡出，取数据和淡出并行（数据回得再快也要等动画走完，
 * 否则等于没有动画），淡完才把节点 hidden 掉、挂上编辑器。
 */

/** 与 global.css 的动画时长、页面上 duration-150 保持一致 */
const FADE_MS = 150;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** 传节点的函数而不是节点本身：随记那边要编辑哪一条是点下去才知道的 */
type ReadingNodes = () => (HTMLElement | null)[];

export function useInlineEditor() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const editorRef = useRef<MarkdownHandle>(null);

  // 打开就把光标放进去（落到全文末尾，正好接着写）。
  // 点了「编辑」还要再点一下方框才能打字，就算不上就地编辑了。
  useEffect(() => {
    if (open) editorRef.current?.focus();
  }, [open]);

  /**
   * 进入编辑态。`load` 里做各自的取数据和 setState（包括设置 slot）。
   * 取数据失败就把阅读态恢复原样，什么都不改。
   */
  const start = async (reading: ReadingNodes, load: () => Promise<void>) => {
    const nodes = reading();
    setBusy(true);
    for (const node of nodes) {
      if (node) node.style.opacity = "0";
    }
    try {
      const [loaded] = await Promise.all([
        load().then(() => true),
        wait(FADE_MS),
      ]);
      if (!loaded) return;
      for (const node of nodes) {
        if (node) {
          node.hidden = true;
          node.style.opacity = "";
        }
      }
      setOpen(true);
    } catch (error) {
      for (const node of nodes) {
        if (node) node.style.opacity = "";
      }
      throw error;
    } finally {
      setBusy(false);
    }
  };

  /** 退出编辑态，把阅读态淡回来 */
  const close = async (reading: ReadingNodes) => {
    setClosing(true);
    await wait(FADE_MS);
    for (const node of reading()) {
      if (!node) continue;
      // 先摆成透明再显示，下一帧回到不透明——直接 hidden=false 是硬切
      node.style.opacity = "0";
      node.hidden = false;
      requestAnimationFrame(() => {
        node.style.opacity = "";
      });
    }
    setOpen(false);
    setClosing(false);
  };

  /** 编辑器外层的类：淡入用动画，淡出用过渡 */
  const fadeClass = `transition-opacity duration-150 ${
    closing ? "opacity-0" : "note-editor-enter"
  }`;

  return { open, closing, busy, setBusy, editorRef, start, close, fadeClass };
}

/**
 * 选图 / 粘贴 / 拖入都走这里：先在浏览器压出多个尺寸再上传，插进光标处。
 *
 * 多张图之间不留空行——随记的画廊靠「同一个段落里的连续 img」识别，
 * 中间空一行就会被拆成几个独立段落，画廊就散了。
 */
export function useImageUpload(
  editorRef: React.RefObject<MarkdownHandle | null>
) {
  const [uploading, setUploading] = useState(0);

  const handleFiles = async (files: File[]) => {
    setUploading(count => count + files.length);
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
      editorRef.current?.insert(`\n\n${snippets.join("\n")}\n\n`);
    } catch (error) {
      alert(`上传失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setUploading(count => Math.max(0, count - files.length));
    }
  };

  return { uploading, handleFiles };
}

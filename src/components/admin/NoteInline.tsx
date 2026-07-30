import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Markdown, { type MarkdownHandle } from "./Markdown";
import { resizeImage } from "./resize";
import {
  createEntry,
  fetchEntry,
  publishEntry,
  removeEntry,
  saveEntry,
  uploadImage,
} from "./api";

/**
 * 短文的就地编辑。
 *
 * 短文没有详情页，写一条短文本来就是「打开、敲两行、发出去」，
 * 为它跳一趟后台再跳回来太重了。
 *
 * 编辑器通过 portal 渲染进那条短文自己的位置（服务端在每条短文后面留了一个
 * 空占位 div），同时把渲染好的正文藏起来——所以视觉上是这条短文原地变成了
 * 编辑态，而不是从别处弹出来一个面板。
 *
 * 两个状态之间是交叉淡入淡出，不是硬切：正文淡出之后编辑框才淡入，
 * 编辑框的最小高度直接取自原正文的高度，所以下面的内容不会跳。
 *
 * 岛本身不负责渲染短文正文：正文是服务端渲染的 HTML，保持无 JS 可读、可缓存。
 */

type Mode = { kind: "closed" } | { kind: "edit"; id: number } | { kind: "new" };

/** 与 global.css 里的动画时长、NoteTimelineItem 上的 duration-150 保持一致 */
const FADE_MS = 150;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const bodyEl = (id: number) =>
  document.querySelector<HTMLElement>(`[data-note-body="${id}"]`);

const slotEl = (key: string) =>
  document.querySelector<HTMLElement>(`[data-note-editor-slot="${key}"]`);

export default function NoteInline() {
  const [mode, setMode] = useState<Mode>({ kind: "closed" });
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [closing, setClosing] = useState(false);
  const [body, setBody] = useState("");
  const [minHeight, setMinHeight] = useState("6rem");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const editorRef = useRef<MarkdownHandle>(null);

  // 页面上的「编辑」「+ 新短文」按钮通过自定义事件叫醒这个岛
  useEffect(() => {
    const onEdit = (event: Event) => {
      const id = (event as CustomEvent<number>).detail;
      const target = slotEl(String(id));
      if (!target) return;
      const read = bodyEl(id);
      // 编辑框跟原正文一样高：高度不变，下面的内容就不会被顶动。
      // 但要封顶——图多的短文在编辑态只是几行 markdown 链接，
      // 照搬阅读态的高度会留下一大片空白
      // 下限一行（26px）：短文本来就可能只有一行，编辑框凭空高出去也是跳
      const height = Math.min(
        Math.max(read?.getBoundingClientRect().height ?? 0, 26),
        200
      );
      setBusy(true);
      if (read) read.style.opacity = "0";
      // 淡出和取正文并行，正文回来得快也要等动画走完，否则等于没有动画
      void Promise.all([fetchEntry(id), wait(FADE_MS)])
        .then(([{ entry }]) => {
          if (read) {
            read.hidden = true;
            read.style.opacity = "";
          }
          setBody(entry.body);
          setMinHeight(`${height}px`);
          setMode({ kind: "edit", id });
          setSlot(target);
        })
        .catch(() => {
          if (read) read.style.opacity = "";
          alert("打开失败，请重试");
        })
        .finally(() => setBusy(false));
    };
    const onNew = () => {
      const target = slotEl("new");
      if (!target) return;
      setBody("");
      setMinHeight("6rem");
      setMode({ kind: "new" });
      setSlot(target);
    };
    addEventListener("note:edit", onEdit);
    addEventListener("note:new", onNew);
    return () => {
      removeEventListener("note:edit", onEdit);
      removeEventListener("note:new", onNew);
    };
  }, []);

  // 打开就把光标放进去（落到全文末尾，正好接着写）。
  // 点了「编辑」还要再点一下方框才能打字，就算不上就地编辑了。
  useEffect(() => {
    if (mode.kind !== "closed" && slot) editorRef.current?.focus();
  }, [mode, slot]);

  const close = async () => {
    setClosing(true);
    await wait(FADE_MS);
    if (mode.kind === "edit") {
      const read = bodyEl(mode.id);
      if (read) {
        // 先摆成透明再显示，下一帧回到不透明——直接 hidden=false 是硬切
        read.style.opacity = "0";
        read.hidden = false;
        requestAnimationFrame(() => {
          read.style.opacity = "";
        });
      }
    }
    setMode({ kind: "closed" });
    setSlot(null);
    setClosing(false);
  };

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

  const save = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const id =
        mode.kind === "edit"
          ? mode.id
          : (await createEntry({ kind: "note", body })).id;
      if (mode.kind === "edit") await saveEntry(id, { kind: "note", body });
      const result = await publishEntry(id);
      if (!result.ok) {
        alert(Object.values(result.errors ?? {}).join("\n") || "发布失败");
        return;
      }
      // 直接刷新：正文 HTML 是服务端渲染的，让服务端重新给一份最省事，
      // 顺带把时间线的排序、分页、统计一起更新了
      location.reload();
    } catch (error) {
      alert(`保存失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (mode.kind !== "edit") return;
    if (!confirm("删除这条短文后不可恢复，确定吗？")) return;
    setBusy(true);
    try {
      await removeEntry(mode.id);
      location.reload();
    } catch (error) {
      alert(`删除失败：${error instanceof Error ? error.message : "未知错误"}`);
      setBusy(false);
    }
  };

  if (mode.kind === "closed" || !slot) return null;

  return createPortal(
    <div
      // reading-note：和这条短文的正文用同一份字号行高 token，
      // 编辑器在这棵子树里自己就读到了，不用逐个传参
      className={`reading-note mt-2 transition-opacity duration-150 ${
        closing ? "opacity-0" : "note-editor-enter"
      }`}
    >
      {/* 方框靠负外边距抵消自己的内边距：文字仍然落在阅读态那一列上，
          进出编辑态时一个字都不会横移，变的只是周围多了一圈描边 */}
      <div className="border-border focus-within:border-accent/60 -mx-2 -my-1 rounded-md border px-2 py-1 transition-colors">
        <Markdown
          value={body}
          onChange={setBody}
          onFiles={files => void handleFiles(files)}
          ref={editorRef}
          minHeight={minHeight}
          contentPadding="0"
        />
      </div>
      {/* 按钮行是这次唯一新增的高度，让它自己展开出来 */}
      <div className="note-actions-enter">
        <div>
          <div className="text-muted-foreground mt-3 flex items-center gap-4 text-sm">
            <label className="hover:text-accent cursor-pointer">
              插图
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={event => {
                  const files = [...(event.target.files ?? [])];
                  event.target.value = "";
                  if (files.length > 0) void handleFiles(files);
                }}
              />
            </label>
            <button
              onClick={() => void save()}
              disabled={busy || !body.trim()}
              className="text-accent font-medium disabled:opacity-40"
            >
              {mode.kind === "new" ? "发布" : "更新"}
            </button>
            <button onClick={() => void close()} className="hover:text-accent">
              取消
            </button>
            {mode.kind === "edit" && (
              <button
                onClick={() => void remove()}
                disabled={busy}
                className="hover:text-red-600 disabled:opacity-40"
              >
                删除
              </button>
            )}
            {uploading > 0 && (
              <span className="text-faint text-xs">上传 {uploading} 张…</span>
            )}
          </div>
        </div>
      </div>
    </div>,
    slot
  );
}

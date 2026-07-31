import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Markdown from "./Markdown";
import { useImageUpload, useInlineEditor } from "./useInlineEditor";
import {
  createEntry,
  fetchEntry,
  publishEntry,
  removeEntry,
  saveEntry,
} from "./api";

/**
 * 随记的就地编辑。
 *
 * 随记没有详情页，写一条本来就是「打开、敲两行、发出去」，
 * 为它跳一趟别的页面太重了。
 *
 * 编辑器通过 portal 渲染进那条随记自己的位置（服务端在每条后面留了一个
 * 空占位 div），同时把渲染好的正文藏起来——所以视觉上是这条原地变成了
 * 编辑态，而不是从别处弹出来一个面板。进出的时序见 useInlineEditor。
 *
 * 岛本身不负责渲染正文：正文是服务端渲染的 HTML，保持无 JS 可读、可缓存。
 */

type Mode = { kind: "closed" } | { kind: "edit"; id: number } | { kind: "new" };

const bodyEl = (id: number) =>
  document.querySelector<HTMLElement>(`[data-note-body="${id}"]`);

const slotEl = (key: string) =>
  document.querySelector<HTMLElement>(`[data-note-editor-slot="${key}"]`);

export default function NoteInline() {
  const [mode, setMode] = useState<Mode>({ kind: "closed" });
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [body, setBody] = useState("");
  const [minHeight, setMinHeight] = useState("6rem");
  const editor = useInlineEditor();
  const { uploading, handleFiles } = useImageUpload(editor.editorRef);

  // 页面上的「编辑」「+ 新随记」按钮通过自定义事件叫醒这个岛
  useEffect(() => {
    const onEdit = (event: Event) => {
      const id = (event as CustomEvent<number>).detail;
      const target = slotEl(String(id));
      if (!target) return;
      const read = bodyEl(id);
      // 编辑框跟原正文一样高，下面的内容就不会被顶动。但要封顶——图多的
      // 随记在编辑态只是几行 markdown 链接，照搬阅读态的高度会留下一大片空白；
      // 下限一行（26px）：随记本来就可能只有一行，编辑框凭空高出去也是跳
      const height = Math.min(
        Math.max(read?.getBoundingClientRect().height ?? 0, 26),
        200
      );
      void editor
        .start(
          () => [read],
          async () => {
            const { entry } = await fetchEntry(id);
            setBody(entry.body);
            setMinHeight(`${height}px`);
            setMode({ kind: "edit", id });
            setSlot(target);
          }
        )
        .catch(() => alert("打开失败，请重试"));
    };

    const onNew = () => {
      const target = slotEl("new");
      if (!target) return;
      setBody("");
      setMinHeight("6rem");
      setMode({ kind: "new" });
      setSlot(target);
      // 新建没有要藏的阅读态，也没有要取的数据，走同一条路只是为了同一套动画
      void editor.start(
        () => [],
        () => Promise.resolve()
      );
    };

    addEventListener("note:edit", onEdit);
    addEventListener("note:new", onNew);
    return () => {
      removeEventListener("note:edit", onEdit);
      removeEventListener("note:new", onNew);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = async () => {
    await editor.close(() => [mode.kind === "edit" ? bodyEl(mode.id) : null]);
    setMode({ kind: "closed" });
    setSlot(null);
  };

  const save = async () => {
    if (!body.trim()) return;
    editor.setBusy(true);
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
      editor.setBusy(false);
    }
  };

  const remove = async () => {
    if (mode.kind !== "edit") return;
    if (!confirm("删除这条随记后不可恢复，确定吗？")) return;
    editor.setBusy(true);
    try {
      await removeEntry(mode.id);
      location.reload();
    } catch (error) {
      alert(`删除失败：${error instanceof Error ? error.message : "未知错误"}`);
      editor.setBusy(false);
    }
  };

  if (!editor.open || mode.kind === "closed" || !slot) return null;

  return createPortal(
    <div className={`mt-2 ${editor.fadeClass}`}>
      {/* 方框靠负外边距抵消自己的内边距：文字仍然落在阅读态那一列上，
          进出编辑态时一个字都不会横移，变的只是周围多了一圈描边 */}
      <div className="border-border focus-within:border-accent/60 -mx-2 -my-1 rounded-md border px-2 py-1 transition-colors">
        <Markdown
          value={body}
          onChange={setBody}
          onFiles={files => void handleFiles(files)}
          ref={editor.editorRef}
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
              disabled={editor.busy || !body.trim()}
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
                disabled={editor.busy}
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

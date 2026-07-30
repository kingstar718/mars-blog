import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Markdown, { type MarkdownHandle } from "./Markdown";
import { resizeImage } from "./resize";
import {
  createEntry,
  fetchEntry,
  publishEntry,
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
 * 岛本身不负责渲染短文正文：正文是服务端渲染的 HTML，保持无 JS 可读、可缓存。
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
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const editorRef = useRef<MarkdownHandle>(null);

  // 页面上的「编辑」「+ 新短文」按钮通过自定义事件叫醒这个岛
  useEffect(() => {
    const onEdit = (event: Event) => {
      const id = (event as CustomEvent<number>).detail;
      const target = slotEl(String(id));
      if (!target) return;
      setBusy(true);
      void fetchEntry(id)
        .then(({ entry }) => {
          setBody(entry.body);
          setMode({ kind: "edit", id });
          setSlot(target);
          const el = bodyEl(id);
          if (el) el.hidden = true;
        })
        .finally(() => setBusy(false));
    };
    const onNew = () => {
      const target = slotEl("new");
      if (!target) return;
      setBody("");
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

  const close = () => {
    if (mode.kind === "edit") {
      const el = bodyEl(mode.id);
      if (el) el.hidden = false;
    }
    setMode({ kind: "closed" });
    setSlot(null);
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

  if (mode.kind === "closed" || !slot) return null;

  return createPortal(
    <div className="mt-2">
      {/* 边框只有一条左侧竖线：整块方框会把这条短文从时间线里割出来，
          而它此刻仍然是时间线上的一条 */}
      <div className="border-accent/40 focus-within:border-accent border-s-2 ps-3">
        <Markdown
          value={body}
          onChange={setBody}
          onFiles={files => void handleFiles(files)}
          ref={editorRef}
          minHeight="6rem"
        />
      </div>
      <div className="text-muted-foreground mt-1 flex items-center gap-4 text-sm">
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
        <button onClick={close} className="hover:text-accent">
          取消
        </button>
        {uploading > 0 && (
          <span className="text-faint text-xs">上传 {uploading} 张…</span>
        )}
      </div>
    </div>,
    slot
  );
}

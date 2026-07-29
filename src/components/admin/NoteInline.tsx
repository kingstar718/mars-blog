import { useEffect, useRef, useState } from "react";
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
 * 为它跳一趟后台再跳回来太重了。所以编辑器直接长在列表里，
 * 用的是和后台同一个 CodeMirror 封装、同一套接口。
 *
 * 挂载方式有点特别：这个岛不负责渲染短文正文——正文是服务端渲染好的 HTML，
 * 保持无 JS 可读、可缓存。岛只在被点开时把那段正文藏起来，把自己顶上去。
 * 由 notes 页面上的一小段脚本通过 data-edit-note 触发。
 */

type Mode = { kind: "closed" } | { kind: "edit"; id: number } | { kind: "new" };

const bodyEl = (id: number) =>
  document.querySelector<HTMLElement>(`[data-note-body="${id}"]`);

export default function NoteInline() {
  const [mode, setMode] = useState<Mode>({ kind: "closed" });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const editorRef = useRef<MarkdownHandle>(null);

  // 页面上的「编辑」「+ 新短文」按钮通过自定义事件叫醒这个岛
  useEffect(() => {
    const onEdit = (event: Event) => {
      const id = (event as CustomEvent<number>).detail;
      setBusy(true);
      void fetchEntry(id)
        .then(({ entry }) => {
          setBody(entry.body);
          setMode({ kind: "edit", id });
          const el = bodyEl(id);
          if (el) el.hidden = true;
        })
        .finally(() => setBusy(false));
    };
    const onNew = () => {
      setBody("");
      setMode({ kind: "new" });
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
      // 也顺带把时间线的排序、分页、统计都更新了
      location.reload();
    } catch (error) {
      alert(`保存失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setBusy(false);
    }
  };

  if (mode.kind === "closed") return null;

  return (
    <div className="border-border bg-background fixed inset-x-0 bottom-0 z-40 border-t">
      <div className="app-layout py-3">
        <div className="border-border rounded-md border px-4 py-2">
          <Markdown
            value={body}
            onChange={setBody}
            onFiles={files => void handleFiles(files)}
            ref={editorRef}
            minHeight="24vh"
          />
        </div>
        <div className="mt-2 flex items-center gap-5 text-sm">
          <label className="text-muted-foreground hover:text-accent cursor-pointer">
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
          <button
            onClick={close}
            className="text-muted-foreground hover:text-accent"
          >
            取消
          </button>
          {uploading > 0 && (
            <span className="text-faint text-xs">上传 {uploading} 张…</span>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Markdown from "./Markdown";
import { useImageUpload, useInlineEditor } from "./useInlineEditor";
import {
  fetchEntry,
  publishEntry,
  removeEntry,
  saveEntry,
  unpublishEntry,
} from "./api";

/**
 * 文章的就地编辑：文章页原地变成编辑态。
 *
 * 和随记那边是同一套（见 useInlineEditor），差别只在文章多一个标题，
 * 以及多了「撤回」。这里不做预览——阅读态就是预览，退出编辑就看见了。
 *
 * 正文仍由服务端渲染，编辑器 portal 进页面上留好的占位。标题和正文各有
 * 一个占位：整块渲染在末尾的话，标题会跑到日期行下面去。
 */

const el = (selector: string) => document.querySelector<HTMLElement>(selector);

interface Props {
  id: number;
  status: "draft" | "published";
}

export default function PostInline({ id, status: initialStatus }: Props) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [minHeight, setMinHeight] = useState("60vh");
  const [error, setError] = useState<string | null>(null);
  const editor = useInlineEditor();
  const { uploading, handleFiles } = useImageUpload(editor.editorRef);

  const reading = () => [el("[data-post-title]"), el("[data-post-body]")];

  const start = () => {
    const target = el("[data-post-editor-slot]");
    const titleTarget = el("[data-post-title-slot]");
    if (!target || !titleTarget) return;
    // 编辑器至少和原文一样高，页面不会因为进编辑态而缩掉一大截
    const height = el("[data-post-body]")?.getBoundingClientRect().height ?? 0;

    void editor
      .start(reading, async () => {
        const { entry } = await fetchEntry(id);
        setTitle(entry.title ?? "");
        setBody(entry.body);
        setStatus(entry.status);
        setMinHeight(`${Math.max(height, 240)}px`);
        setSlot(target);
        setTitleSlot(titleTarget);
      })
      .catch(() => alert("打开失败，请重试"));
  };

  // 页面上的铅笔按钮，以及新建文章后带 ?edit=1 跳回来的那次自动打开
  useEffect(() => {
    const onEdit = () => start();
    addEventListener("post:edit", onEdit);
    if (new URLSearchParams(location.search).has("edit")) {
      history.replaceState(null, "", location.pathname);
      start();
    }
    return () => removeEventListener("post:edit", onEdit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = async () => {
    await editor.close(reading);
    setSlot(null);
    setTitleSlot(null);
  };

  const save = async () => {
    editor.setBusy(true);
    setError(null);
    try {
      await saveEntry(id, { kind: "post", title, body });
      const result = await publishEntry(id);
      if (!result.ok) {
        setError(Object.values(result.errors ?? {}).join("；") || "发布失败");
        return;
      }
      // 正文 HTML 是服务端渲染的，刷新一次拿回来最省事
      location.reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败");
    } finally {
      editor.setBusy(false);
    }
  };

  const unpublish = async () => {
    if (!confirm("撤回后这篇文章将只有你自己看得到，确定吗？")) return;
    editor.setBusy(true);
    try {
      await unpublishEntry(id);
      location.reload();
    } catch {
      setError("撤回失败");
      editor.setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("删除这篇文章后不可恢复，确定吗？")) return;
    editor.setBusy(true);
    try {
      await removeEntry(id);
      location.assign("/posts");
    } catch {
      setError("删除失败");
      editor.setBusy(false);
    }
  };

  if (!editor.open || !slot || !titleSlot) return null;

  const action = status === "published" ? "更新" : "发布";

  // 两个 portal：标题落回 h1 的位置（日期行在它下面），正文落回正文的位置
  return (
    <>
      {createPortal(
        <input
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="标题"
          // 字号字重和阅读态的 h1 一样，描边聚焦时才出现；
          // 负外边距抵消内边距，文字不横移
          className={`focus:border-accent/60 -mx-2 -my-1 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-bold outline-none sm:text-3xl ${editor.fadeClass}`}
        />,
        titleSlot
      )}
      {createPortal(
        <div className={editor.fadeClass}>
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

          <div className="note-actions-enter">
            <div>
              <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-4 text-sm">
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
                  disabled={editor.busy || !title.trim() || !body.trim()}
                  className="text-accent font-medium disabled:opacity-40"
                >
                  {action}
                </button>
                <button
                  onClick={() => void close()}
                  className="hover:text-accent"
                >
                  取消
                </button>
                {status === "published" && (
                  <button
                    onClick={() => void unpublish()}
                    disabled={editor.busy}
                    className="hover:text-accent disabled:opacity-40"
                  >
                    撤回
                  </button>
                )}
                <button
                  onClick={() => void remove()}
                  disabled={editor.busy}
                  className="hover:text-red-600 disabled:opacity-40"
                >
                  删除
                </button>
                {uploading > 0 && (
                  <span className="text-faint text-xs">
                    上传 {uploading} 张…
                  </span>
                )}
                {error && <span className="text-xs text-red-600">{error}</span>}
              </div>
            </div>
          </div>
        </div>,
        slot
      )}
    </>
  );
}

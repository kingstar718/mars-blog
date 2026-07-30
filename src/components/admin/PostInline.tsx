import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Markdown, { type MarkdownHandle } from "./Markdown";
import { resizeImage } from "./resize";
import {
  fetchEntry,
  publishEntry,
  removeEntry,
  saveEntry,
  unpublishEntry,
  uploadImage,
} from "./api";

/**
 * 文章的就地编辑：文章页原地变成编辑态。
 *
 * 和短文那边是同一套思路（见 NoteInline），差别只在文章多一个标题，
 * 以及多了「撤回」。这里不做预览——阅读态就是预览，退出编辑就看见了。
 *
 * 正文仍由服务端渲染，编辑器 portal 进页面上留好的占位；进出都是淡入淡出。
 */

const el = (selector: string) => document.querySelector<HTMLElement>(selector);

/** 与 global.css 的动画时长、页面上 duration-150 保持一致 */
const FADE_MS = 150;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface Props {
  id: number;
  status: "draft" | "published";
}

export default function PostInline({ id, status: initialStatus }: Props) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [minHeight, setMinHeight] = useState("60vh");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<MarkdownHandle>(null);

  const reading = () => ({
    title: el("[data-post-title]"),
    body: el("[data-post-body]"),
  });

  const start = async () => {
    const target = el("[data-post-editor-slot]");
    const titleTarget = el("[data-post-title-slot]");
    if (!target || !titleTarget) return;
    const nodes = reading();
    // 编辑器至少和原文一样高，页面不会因为进编辑态而缩掉一大截
    const height = nodes.body?.getBoundingClientRect().height ?? 0;
    setBusy(true);
    for (const node of Object.values(nodes)) {
      if (node) node.style.opacity = "0";
    }
    try {
      const [{ entry }] = await Promise.all([fetchEntry(id), wait(FADE_MS)]);
      for (const node of Object.values(nodes)) {
        if (node) {
          node.hidden = true;
          node.style.opacity = "";
        }
      }
      setTitle(entry.title ?? "");
      setBody(entry.body);
      setStatus(entry.status);
      setMinHeight(`${Math.max(height, 240)}px`);
      setSlot(target);
      setTitleSlot(titleTarget);
      setOpen(true);
    } catch {
      for (const node of Object.values(nodes)) {
        if (node) node.style.opacity = "";
      }
      alert("打开失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  // 页面上的铅笔按钮，以及新建文章后带 ?edit=1 跳回来的那次自动打开
  useEffect(() => {
    const onEdit = () => void start();
    addEventListener("post:edit", onEdit);
    if (new URLSearchParams(location.search).has("edit")) {
      history.replaceState(null, "", location.pathname);
      void start();
    }
    return () => removeEventListener("post:edit", onEdit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open && slot) editorRef.current?.focus();
  }, [open, slot]);

  const close = async () => {
    setClosing(true);
    await wait(FADE_MS);
    for (const node of Object.values(reading())) {
      if (!node) continue;
      node.style.opacity = "0";
      node.hidden = false;
      requestAnimationFrame(() => {
        node.style.opacity = "";
      });
    }
    setOpen(false);
    setSlot(null);
    setTitleSlot(null);
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
    setBusy(true);
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
      setBusy(false);
    }
  };

  const unpublish = async () => {
    if (!confirm("撤回后这篇文章将只有你自己看得到，确定吗？")) return;
    setBusy(true);
    try {
      await unpublishEntry(id);
      location.reload();
    } catch {
      setError("撤回失败");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("删除这篇文章后不可恢复，确定吗？")) return;
    setBusy(true);
    try {
      await removeEntry(id);
      location.assign("/posts");
    } catch {
      setError("删除失败");
      setBusy(false);
    }
  };

  if (!open || !slot || !titleSlot) return null;

  const action = status === "published" ? "更新" : "发布";
  const fade = `transition-opacity duration-150 ${
    closing ? "opacity-0" : "note-editor-enter"
  }`;

  // 两个 portal：标题要落回 h1 的位置（日期行在它下面），正文落回正文的位置。
  // 一整块渲染在末尾的话，标题会跑到日期下面去。
  return (
    <>
      {createPortal(
        <input
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="标题"
          // 字号字重和阅读态的 h1 一样，描边聚焦时才出现；
          // 负外边距抵消内边距，文字不横移
          className={`focus:border-accent/60 -mx-2 -my-1 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-bold outline-none sm:text-3xl ${fade}`}
        />,
        titleSlot
      )}
      {createPortal(
        <div className={fade}>
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
                  disabled={busy || !title.trim() || !body.trim()}
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
                    disabled={busy}
                    className="hover:text-accent disabled:opacity-40"
                  >
                    撤回
                  </button>
                )}
                <button
                  onClick={() => void remove()}
                  disabled={busy}
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

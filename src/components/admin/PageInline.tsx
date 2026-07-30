import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Markdown, { type MarkdownHandle } from "./Markdown";

/**
 * 独立页面（关于）的就地编辑。
 *
 * 和文章、随记是同一套：页面原地变成编辑态，正文落回正文的位置。
 * 独立页面没有草稿也没有发布，保存即生效，所以按钮只有「保存 / 取消」。
 *
 * 标题不在这里改：它只出现在浏览器标签上，页面里根本没有这行字，
 * 摆一个输入框出来反而比阅读态多了一样东西。保存时原样带回去。
 */

const FADE_MS = 150;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const el = (selector: string) => document.querySelector<HTMLElement>(selector);

export default function PageInline({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [minHeight, setMinHeight] = useState("40vh");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<MarkdownHandle>(null);

  const start = async () => {
    const target = el("[data-page-editor-slot]");
    const reading = el("[data-page-body]");
    if (!target) return;
    const height = reading?.getBoundingClientRect().height ?? 0;
    setBusy(true);
    if (reading) reading.style.opacity = "0";
    try {
      const [response] = await Promise.all([
        fetch(`/api/admin/pages?slug=${slug}`),
        wait(FADE_MS),
      ]);
      if (!response.ok) throw new Error("读取失败");
      const { page } = (await response.json()) as {
        page: { title: string; body: string };
      };
      if (reading) {
        reading.hidden = true;
        reading.style.opacity = "";
      }
      setTitle(page.title);
      setBody(page.body);
      setMinHeight(`${Math.max(height, 160)}px`);
      setSlot(target);
      setOpen(true);
    } catch {
      if (reading) reading.style.opacity = "";
      alert("打开失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onEdit = () => void start();
    addEventListener("page:edit", onEdit);
    return () => removeEventListener("page:edit", onEdit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open && slot) editorRef.current?.focus();
  }, [open, slot]);

  const close = async () => {
    setClosing(true);
    await wait(FADE_MS);
    const reading = el("[data-page-body]");
    if (reading) {
      reading.style.opacity = "0";
      reading.hidden = false;
      requestAnimationFrame(() => {
        reading.style.opacity = "";
      });
    }
    setOpen(false);
    setSlot(null);
    setClosing(false);
  };

  const save = async () => {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/pages", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, title, body }),
      });
      if (!response.ok) throw new Error("保存失败");
      // HTML 是服务端算的，刷新一次拿回来
      location.reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败");
      setBusy(false);
    }
  };

  if (!open || !slot) return null;

  return createPortal(
    <div
      className={`transition-opacity duration-150 ${
        closing ? "opacity-0" : "note-editor-enter"
      }`}
    >
      <div className="border-border focus-within:border-accent/60 -mx-2 -my-1 rounded-md border px-2 py-1 transition-colors">
        <Markdown
          value={body}
          onChange={setBody}
          ref={editorRef}
          minHeight={minHeight}
          contentPadding="0"
        />
      </div>
      <div className="note-actions-enter">
        <div>
          <div className="text-muted-foreground mt-3 flex items-center gap-4 text-sm">
            <button
              onClick={() => void save()}
              disabled={busy || !body.trim()}
              className="text-accent font-medium disabled:opacity-40"
            >
              保存
            </button>
            <button onClick={() => void close()} className="hover:text-accent">
              取消
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      </div>
    </div>,
    slot
  );
}

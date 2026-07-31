import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Markdown from "./Markdown";
import { useInlineEditor } from "./useInlineEditor";

/**
 * 独立页面（关于）的就地编辑。
 *
 * 和文章、随记是同一套（见 useInlineEditor）：页面原地变成编辑态，
 * 正文落回正文的位置。独立页面没有草稿也没有发布，保存即生效，
 * 所以按钮只有「保存 / 取消」，也不需要插图。
 *
 * 标题不在这里改：它只出现在浏览器标签上，页面里根本没有这行字，
 * 摆一个输入框出来反而比阅读态多了一样东西。保存时原样带回去。
 */

const el = (selector: string) => document.querySelector<HTMLElement>(selector);

export default function PageInline({ slug }: { slug: string }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [minHeight, setMinHeight] = useState("40vh");
  const [error, setError] = useState<string | null>(null);
  const editor = useInlineEditor();

  const reading = () => [el("[data-page-body]")];

  useEffect(() => {
    const onEdit = () => {
      const target = el("[data-page-editor-slot]");
      if (!target) return;
      const height =
        el("[data-page-body]")?.getBoundingClientRect().height ?? 0;

      void editor
        .start(reading, async () => {
          const response = await fetch(`/api/admin/pages?slug=${slug}`);
          if (!response.ok) throw new Error("读取失败");
          const { page } = (await response.json()) as {
            page: { title: string; body: string };
          };
          setTitle(page.title);
          setBody(page.body);
          setMinHeight(`${Math.max(height, 160)}px`);
          setSlot(target);
        })
        .catch(() => alert("打开失败，请重试"));
    };

    addEventListener("page:edit", onEdit);
    return () => removeEventListener("page:edit", onEdit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = async () => {
    await editor.close(reading);
    setSlot(null);
  };

  const save = async () => {
    if (!body.trim()) return;
    editor.setBusy(true);
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
      editor.setBusy(false);
    }
  };

  if (!editor.open || !slot) return null;

  return createPortal(
    <div className={editor.fadeClass}>
      <div className="border-border focus-within:border-accent/60 -mx-2 -my-1 rounded-md border px-2 py-1 transition-colors">
        <Markdown
          value={body}
          onChange={setBody}
          ref={editor.editorRef}
          minHeight={minHeight}
          contentPadding="0"
        />
      </div>
      <div className="note-actions-enter">
        <div>
          <div className="text-muted-foreground mt-3 flex items-center gap-4 text-sm">
            <button
              onClick={() => void save()}
              disabled={editor.busy || !body.trim()}
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

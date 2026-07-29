import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import type { PageRow } from "@/lib/pages";

/**
 * 独立页面（关于等）的编辑。
 *
 * 和文章的编辑器分开：独立页面没有草稿态、没有发布、没有更新记录，
 * 保存即生效。硬套 Editor 的话要在里面塞一堆「这类内容不适用」的分支。
 */
export default function PageEditor({ slug }: { slug: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const dirty = useRef(false);

  useEffect(() => {
    fetch(`/api/admin/pages?slug=${slug}`)
      .then(response => response.json() as Promise<{ page: PageRow }>)
      .then(data => {
        setTitle(data.page.title);
        setBody(data.page.body);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (loading) return;
    if (!dirty.current) {
      dirty.current = true;
      return;
    }
    setState("saving");
    const timer = setTimeout(async () => {
      const response = await fetch("/api/admin/pages", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, title, body }),
      });
      setState(response.ok ? "saved" : "error");
    }, 1200);
    return () => clearTimeout(timer);
  }, [title, body, loading, slug]);

  if (loading) return <p className="text-muted-foreground text-sm">读取中…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <input
          value={title}
          onChange={event => setTitle(event.target.value)}
          className="border-border focus:border-accent flex-1 border-b bg-transparent pb-2 text-xl font-semibold outline-none"
        />
        <span className="text-faint ms-4 text-xs">
          {state === "saving" && "保存中…"}
          {state === "saved" && "已保存"}
          {state === "error" && <span className="text-red-600">保存失败</span>}
        </span>
      </div>
      <Markdown value={body} onChange={setBody} />
    </div>
  );
}

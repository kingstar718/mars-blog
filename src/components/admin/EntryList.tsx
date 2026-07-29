import { useEffect, useState } from "react";
import { listEntries, type EntryRow } from "./api";

// 库里存的就是站点时间的 'YYYY-MM-DD HH:mm:ss'，截到分钟即可。
// 不要走 new Date()：那会按浏览器所在时区解读，出了国就显示错了。
const formatDisplay = (stored: string) => stored.slice(0, 16);

interface Props {
  onNavigate: (path: string) => void;
}

export default function EntryList({ onNavigate }: Props) {
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listEntries()
      .then(data => setEntries(data.entries))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground text-sm">读取中…</p>;

  const posts = entries.filter(entry => entry.kind === "post");
  const notes = entries.filter(entry => entry.kind === "note");

  return (
    <>
      <div className="mb-6 flex items-baseline gap-4 text-sm">
        <span className="text-muted-foreground">
          {posts.length} 篇文章 · {notes.length} 条短文
        </span>
        <button
          onClick={() => onNavigate("/admin/new/post")}
          className="underline"
        >
          写文章
        </button>
        <button
          onClick={() => onNavigate("/admin/new/note")}
          className="underline"
        >
          写短文
        </button>
      </div>

      {entries.length === 0 && (
        <p className="text-muted-foreground text-sm">还没有内容。</p>
      )}

      <ul className="divide-border divide-y">
        {entries.map(entry => (
          <li key={entry.id} className="flex items-baseline gap-3 py-3">
            {entry.status === "draft" && (
              <span className="flex-none rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                草稿
              </span>
            )}
            <button
              onClick={() => onNavigate(`/admin/edit/${entry.id}`)}
              className="min-w-0 flex-1 truncate text-left hover:underline"
            >
              {entry.kind === "post" ? entry.title || "（无标题）" : entry.body}
            </button>
            <time className="text-faint flex-none text-xs">
              {formatDisplay(entry.pub_datetime)}
            </time>
          </li>
        ))}
      </ul>
    </>
  );
}

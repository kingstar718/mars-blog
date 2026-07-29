import { useEffect, useState } from "react";
import { listEntries, type EntryRow } from "./api";

const formatDisplay = (isoUtc: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(isoUtc))
    .replace(/\//g, "-");

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

  if (loading) return <p className="text-sm text-neutral-500">读取中…</p>;

  const posts = entries.filter(entry => entry.kind === "post");
  const notes = entries.filter(entry => entry.kind === "note");

  return (
    <>
      <div className="mb-6 flex items-baseline gap-4 text-sm">
        <span className="text-neutral-500">
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
        <p className="text-sm text-neutral-500">还没有内容。</p>
      )}

      <ul className="divide-y divide-neutral-200">
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
            <time className="flex-none text-xs text-neutral-500">
              {formatDisplay(entry.pub_datetime)}
            </time>
          </li>
        ))}
      </ul>
    </>
  );
}

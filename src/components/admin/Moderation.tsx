import { useEffect, useState } from "react";
import type { CommentRow } from "@/lib/comments";

/**
 * 待审评论。
 *
 * 新评论一律 pending，不经这里就永远不会出现在页面上——
 * 在没有验证码、没有速率限制之前，这道人工闸是唯一的防垃圾手段。
 */
export default function Moderation() {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () =>
    fetch("/api/admin/comments")
      .then(response => response.json() as Promise<{ comments: CommentRow[] }>)
      .then(data => setComments(data.comments))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  const decide = async (id: number, status: "approved" | "spam") => {
    // 先本地移除，请求失败再拉一次——审核是高频动作，等一个往返太黏
    setComments(list => list.filter(comment => comment.id !== id));
    const response = await fetch("/api/admin/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!response.ok) void load();
  };

  if (loading) return <p className="text-sm text-neutral-500">读取中…</p>;

  if (comments.length === 0) {
    return <p className="text-sm text-neutral-500">没有待审评论。</p>;
  }

  return (
    <ul className="divide-y divide-neutral-200">
      {comments.map(comment => (
        <li key={comment.id} className="py-4">
          <div className="flex items-baseline gap-3 text-sm">
            <span className="font-medium">{comment.author}</span>
            <time className="text-neutral-400">
              {new Date(comment.created_at).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
            </time>
            <span className="text-neutral-400">#{comment.entry_id}</span>
          </div>
          <p className="mt-1 text-sm whitespace-pre-wrap">{comment.body}</p>
          <div className="mt-2 flex gap-4 text-sm">
            <button
              onClick={() => void decide(comment.id, "approved")}
              className="text-neutral-900 underline"
            >
              通过
            </button>
            <button
              onClick={() => void decide(comment.id, "spam")}
              className="text-red-600"
            >
              垃圾
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

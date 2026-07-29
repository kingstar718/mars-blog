import { useCallback, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import Markdown from "./Markdown";
import {
  createEntry,
  fetchEntry,
  publishEntry,
  removeEntry,
  saveEntry,
  unpublishEntry,
  type EntryRow,
} from "./api";
import type { DraftInput } from "@/lib/schema";

type SaveState = "idle" | "saving" | "saved" | "error";

/** 数据库存 UTC，输入框要的是 datetime-local 那种本地格式 */
const toLocalInput = (isoUtc: string) => {
  const date = new Date(isoUtc);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const fromLocalInput = (local: string) => new Date(local).toISOString();

interface Props {
  id?: number;
  /** 只对新建有意义；打开已有条目时以数据库里的 kind 为准 */
  kind: "post" | "note";
  onNavigate: (path: string) => void;
}

export default function Editor({
  id: initialId,
  kind: initialKind,
  onNavigate,
}: Props) {
  const [id, setId] = useState(initialId);
  const [kind, setKind] = useState(initialKind);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [pubLocal, setPubLocal] = useState(() =>
    toLocalInput(new Date().toISOString())
  );
  const [featured, setFeatured] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(Boolean(initialId));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);

  const isPost = kind === "post";

  useEffect(() => {
    if (!initialId) return;
    fetchEntry(initialId)
      .then(({ entry }) => applyRow(entry))
      .finally(() => setLoading(false));
  }, [initialId]);

  const applyRow = (entry: EntryRow) => {
    setKind(entry.kind);
    setStatus(entry.status);
    setBody(entry.body);
    setTitle(entry.title ?? "");
    setSlug(entry.slug ?? "");
    setDescription(entry.description ?? "");
    setPubLocal(toLocalInput(entry.pub_datetime));
    setFeatured(entry.featured === 1);
    setAiGenerated(entry.ai_generated === 1);
  };

  const buildDraft = useCallback(
    (): DraftInput => ({
      kind,
      body,
      pubDatetime: fromLocalInput(pubLocal),
      ...(isPost ? { title, slug, description, featured, aiGenerated } : {}),
    }),
    [
      kind,
      body,
      pubLocal,
      isPost,
      title,
      slug,
      description,
      featured,
      aiGenerated,
    ]
  );

  // 自动保存：停手 1.2 秒后写库。
  // 每次改动都发请求会把 D1 打满，也没必要——写作是连续的。
  const draftRef = useRef(buildDraft);
  draftRef.current = buildDraft;
  const idRef = useRef(id);
  idRef.current = id;
  const dirty = useRef(false);

  useEffect(() => {
    if (loading) return;
    // 首次渲染不算改动，否则打开页面就会新建一条空草稿
    if (!dirty.current) {
      dirty.current = true;
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(async () => {
      try {
        const draft = draftRef.current();
        if (idRef.current) {
          await saveEntry(idRef.current, draft);
        } else {
          const created = await createEntry(draft);
          setId(created.id);
          // 地址栏跟上，刷新后还能回到这一篇
          history.replaceState(null, "", `/admin/edit/${created.id}`);
        }
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    body,
    title,
    slug,
    description,
    pubLocal,
    featured,
    aiGenerated,
    loading,
  ]);

  const onPublish = async () => {
    if (!id) return;
    const result = await publishEntry(id, note);
    if (result.ok) {
      setErrors({});
      setStatus("published");
      setNote("");
    } else {
      setErrors(result.errors ?? {});
    }
  };

  const onUnpublish = async () => {
    if (!id) return;
    await unpublishEntry(id);
    setStatus("draft");
  };

  const onDelete = async () => {
    if (!id || !confirm("删除后不可恢复，确定吗？")) return;
    await removeEntry(id);
    onNavigate("/admin");
  };

  if (loading) return <p className="text-sm text-neutral-500">读取中…</p>;

  const fieldError = (name: string) =>
    errors[name] ? (
      <p className="mt-1 text-xs text-red-600">{errors[name]}</p>
    ) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 text-sm">
        <button
          onClick={() => onNavigate("/admin")}
          className="text-neutral-500 hover:text-neutral-900"
        >
          ← 返回
        </button>
        <span className="text-xs text-neutral-400">
          {saveState === "saving" && "保存中…"}
          {saveState === "saved" && "已保存"}
          {saveState === "error" && (
            <span className="text-red-600">保存失败</span>
          )}
        </span>
      </div>

      {isPost && (
        <div className="space-y-3">
          <div>
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder="标题"
              className="w-full border-b border-neutral-200 pb-2 text-xl font-semibold outline-none focus:border-neutral-900"
            />
            {fieldError("title")}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <input
                value={slug}
                onChange={event => setSlug(event.target.value)}
                placeholder="slug（URL，小写英文加连字符）"
                className="w-full rounded border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
              />
              {fieldError("slug")}
            </div>
            <div>
              <input
                type="datetime-local"
                value={pubLocal}
                onChange={event => setPubLocal(event.target.value)}
                className="w-full rounded border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
              />
              {fieldError("pubDatetime")}
            </div>
          </div>

          <div>
            <input
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="摘要（时间线上只占一行）"
              className="w-full rounded border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
            />
            <div className="mt-1 flex justify-between text-xs">
              <span className="text-red-600">{errors.description}</span>
              <span
                className={
                  description.length > 45 ? "text-red-600" : "text-neutral-400"
                }
              >
                {description.length} / 45
              </span>
            </div>
          </div>

          <div className="flex gap-5 text-sm text-neutral-600">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={featured}
                onChange={event => setFeatured(event.target.checked)}
              />
              精选
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={aiGenerated}
                onChange={event => setAiGenerated(event.target.checked)}
              />
              AI 辅助生成
            </label>
          </div>
        </div>
      )}

      {!isPost && (
        <div>
          <input
            type="datetime-local"
            value={pubLocal}
            onChange={event => setPubLocal(event.target.value)}
            className="rounded border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
          />
          {fieldError("pubDatetime")}
        </div>
      )}

      <div className="border-t border-neutral-200 pt-4">
        <div className="mb-2 flex justify-end">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs text-neutral-500 hover:text-neutral-900"
          >
            {showPreview ? "回到编辑" : "预览"}
          </button>
        </div>

        {showPreview ? (
          <div
            className="prose-preview"
            dangerouslySetInnerHTML={{ __html: marked.parse(body) as string }}
          />
        ) : (
          <Markdown value={body} onChange={setBody} />
        )}
        {fieldError("body")}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-4">
        {status === "published" && (
          <input
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="这次改了什么（写进更新记录）"
            className="flex-1 rounded border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
          />
        )}
        <button
          onClick={onPublish}
          disabled={!id}
          className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-40"
        >
          {status === "published" ? "更新" : "发布"}
        </button>
        {status === "published" && (
          <button
            onClick={onUnpublish}
            className="text-sm text-neutral-500 hover:text-neutral-900"
          >
            撤回
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={!id}
          className="text-sm text-red-600 disabled:opacity-40"
        >
          删除
        </button>
      </div>

      {Object.keys(errors).length > 0 && (
        <p className="text-sm text-red-600">
          发布被拦下了，按上面的提示改完再试。
        </p>
      )}
    </div>
  );
}

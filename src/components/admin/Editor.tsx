import { useCallback, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import Markdown, { type MarkdownHandle } from "./Markdown";
import { resizeImage } from "./resize";
import {
  createEntry,
  fetchEntry,
  publishEntry,
  removeEntry,
  saveEntry,
  unpublishEntry,
  uploadImage,
  type EntryRow,
} from "./api";
import type { DraftInput } from "@/lib/schema";

type SaveState = "idle" | "saving" | "saved" | "error";

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
  // 发布时间不在这里编辑：按下「发布」的那一刻就是发布时间，
  // 已发布的条目再更新也不改它，免得改个错别字就顶到时间线最上面
  const [pubDatetime, setPubDatetime] = useState<string | null>(null);
  const [featured, setFeatured] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(Boolean(initialId));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState(0);

  const isPost = kind === "post";
  const editorRef = useRef<MarkdownHandle>(null);

  /**
   * 选图 / 粘贴 / 拖入都走这里：先在浏览器压出多个尺寸再上传。
   *
   * 多张图之间不留空行——短文的画廊靠「同一个段落里的连续 img」识别，
   * 中间空一行就会被拆成几个独立段落，画廊就散了。
   */
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
        variants.forEach((variant, index) => {
          form.append(`file${index}`, variant.blob);
        });
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
    setPubDatetime(entry.pub_datetime);
    setFeatured(entry.featured === 1);
    setAiGenerated(entry.ai_generated === 1);
  };

  const buildDraft = useCallback(
    (): DraftInput => ({
      kind,
      body,
      ...(isPost ? { title, slug, description, featured, aiGenerated } : {}),
    }),
    [kind, body, isPost, title, slug, description, featured, aiGenerated]
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
  }, [body, title, slug, description, featured, aiGenerated, loading]);

  const onPublish = async () => {
    if (!id) return;
    const result = await publishEntry(id, note);
    if (result.ok) {
      setErrors({});
      setStatus("published");
      setNote("");
      // 发布时间是服务端盖的，取回来显示
      void fetchEntry(id).then(({ entry }) =>
        setPubDatetime(entry.pub_datetime)
      );
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
        <span className="flex items-center gap-3 text-xs text-neutral-400">
          {status === "published" && pubDatetime && (
            <span>发布于 {pubDatetime.slice(0, 16)}</span>
          )}
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

      <div className="border-t border-neutral-200 pt-4">
        <div className="mb-2 flex items-center justify-end gap-4 text-xs">
          {uploading > 0 && (
            <span className="text-neutral-400">上传 {uploading} 张…</span>
          )}
          <label className="cursor-pointer text-neutral-500 hover:text-neutral-900">
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
            onClick={() => setShowPreview(!showPreview)}
            className="text-neutral-500 hover:text-neutral-900"
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
          <Markdown
            ref={editorRef}
            value={body}
            onChange={setBody}
            onFiles={files => void handleFiles(files)}
          />
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

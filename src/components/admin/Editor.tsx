import { useCallback, useEffect, useRef, useState } from "react";
import Markdown, { type MarkdownHandle } from "./Markdown";
import { resizeImage } from "./resize";
import {
  createEntry,
  fetchEntry,
  publishEntry,
  removeEntry,
  renderPreview,
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
  // 发布时间不在这里编辑：按下「发布」的那一刻就是发布时间，
  // 已发布的条目再更新也不改它，免得改个错别字就顶到时间线最上面
  const [pubDatetime, setPubDatetime] = useState<string | null>(null);
  const [aiGenerated, setAiGenerated] = useState(false);

  const [loading, setLoading] = useState(Boolean(initialId));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
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
    setPubDatetime(entry.pub_datetime);
    setAiGenerated(entry.ai_generated === 1);
  };

  const buildDraft = useCallback(
    (): DraftInput => ({
      kind,
      body,
      ...(isPost ? { title, aiGenerated } : {}),
    }),
    [kind, body, isPost, title, aiGenerated]
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
  }, [body, title, aiGenerated, loading]);

  // 预览走服务端的渲染管线，和发布出去的 HTML 是同一份产物。
  // 只在预览态里跑，编辑时不打扰。
  useEffect(() => {
    if (!showPreview) return;
    let stale = false;
    setPreviewHtml(null);
    const timer = setTimeout(() => {
      renderPreview(body)
        .then(({ html }) => {
          if (!stale) setPreviewHtml(html);
        })
        .catch(() => {
          if (!stale) setPreviewHtml("<p>预览渲染失败。</p>");
        });
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [showPreview, body]);

  const onPublish = async () => {
    if (!id) return;
    const result = await publishEntry(id);
    if (result.ok) {
      setErrors({});
      setStatus("published");
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

  if (loading) return <p className="text-muted-foreground text-sm">读取中…</p>;

  const fieldError = (name: string) =>
    errors[name] ? (
      <p className="mt-1 text-xs text-red-600">{errors[name]}</p>
    ) : null;

  // 工具栏的次要动作视觉上一致，只有「发布 / 更新」用强调色，删除用红
  const toolButton =
    "text-muted-foreground hover:text-accent text-sm disabled:opacity-40";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 text-sm">
        <button
          onClick={() => onNavigate("/admin")}
          className="text-muted-foreground hover:text-accent"
        >
          ← 返回
        </button>
        <span className="text-faint flex items-center gap-3 text-xs">
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
        <div>
          <input
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="标题"
            className="border-border focus:border-accent w-full border-b bg-transparent pb-2 text-xl font-semibold outline-none"
          />
          {fieldError("title")}
        </div>
      )}

      {/* 标题和编辑框之间的一条工具栏：所有动作都收在这里，
          编辑框里保持干净，写字的时候视线里没有按钮。 */}
      <div className="border-border flex flex-wrap items-center gap-x-5 gap-y-2 border-b pb-3">
        <label className={`${toolButton} cursor-pointer`}>
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
          className={toolButton}
        >
          {showPreview ? "回到编辑" : "预览"}
        </button>

        <button
          onClick={onPublish}
          disabled={!id}
          className="text-accent text-sm font-medium disabled:opacity-40"
        >
          {status === "published" ? "更新" : "发布"}
        </button>

        {status === "published" && (
          <button onClick={onUnpublish} className={toolButton}>
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

        {isPost && (
          <label className="text-muted-foreground ms-auto flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={aiGenerated}
              onChange={event => setAiGenerated(event.target.checked)}
              className="accent-accent"
            />
            AI 辅助生成
          </label>
        )}

        {uploading > 0 && (
          <span className="text-faint text-xs">上传 {uploading} 张…</span>
        )}
      </div>

      {/* 编辑区是一个有边框的方框：写作的地盘和页面其余部分分开 */}
      <div className="border-border focus-within:border-accent/60 rounded-md border px-4 py-2">
        {showPreview ? (
          previewHtml === null ? (
            <p className="text-muted-foreground py-6 text-sm">渲染中…</p>
          ) : (
            <div
              className="app-prose max-w-none py-2"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          )
        ) : (
          <Markdown
            ref={editorRef}
            value={body}
            onChange={setBody}
            onFiles={files => void handleFiles(files)}
          />
        )}
      </div>
      {fieldError("body")}

      {Object.keys(errors).length > 0 && (
        <p className="text-sm text-red-600">
          发布被拦下了，按上面的提示改完再试。
        </p>
      )}
    </div>
  );
}

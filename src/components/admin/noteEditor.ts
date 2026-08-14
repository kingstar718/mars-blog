import {
  createInline,
  createUploader,
  loadEditor,
  preloadEditor,
  type Opened,
} from "./inline";
import { DANGER, PRIMARY, action, fileLabel, h, shell } from "./dom";
import { fetchContent, removeContent, saveContent } from "./api";
import { buildMarkdown, parseMarkdown } from "@/lib/frontmatter";
import { isAdmin } from "./session";

/**
 * 随记的就地编辑。
 *
 * v3 里每条随记是 R2 里的一个 notes/<key>.md：frontmatter 只放
 * pubDatetime（和可选的 draft），正文是剩余部分。保存 = PUT 回 R2。
 */

type Mode = { kind: "edit"; key: string } | { kind: "new" };

const bodyEl = (key: string) =>
  document.querySelector<HTMLElement>(`[data-note-body="${key}"]`);
const slotEl = (key: string) =>
  document.querySelector<HTMLElement>(`[data-note-editor-slot="${key}"]`);

/** 新随记的文件名：日期 + 时间戳，保证唯一且可排序 */
const newNoteKey = () =>
  `notes/${new Date().toISOString().slice(0, 10)}-${Date.now()}.md`;

export const mountNoteEditor = () => {
  preloadEditor();

  const inline = createInline();
  let mode: Mode | null = null;
  let busy = false;

  const close = async () => {
    const current = mode;
    await inline.close(() => [
      current?.kind === "edit" ? bodyEl(current.key) : null,
    ]);
    mode = null;
  };

  const build = async (
    next: Mode,
    slot: HTMLElement,
    initial: string,
    minHeight: string
  ): Promise<Opened> => {
    const { createEditor } = await loadEditor();
    const parsed = parseMarkdown(initial);

    const uploadHint = h("span", { class: "text-faint text-xs" });
    uploadHint.hidden = true;
    const upload = createUploader(
      () => inline.editor(),
      count => {
        uploadHint.hidden = count === 0;
        uploadHint.textContent = `上传 ${count} 张…`;
      }
    );

    const editor = createEditor({
      value: parsed.body,
      minHeight,
      contentPadding: "0",
      onChange: () => syncSave(),
      onFiles: files => void upload(files),
    });

    const save = action(
      next.kind === "new" ? "发布" : "更新",
      PRIMARY,
      () => void submit()
    );
    const syncSave = () => {
      save.disabled = busy || editor.value().trim().length === 0;
    };
    syncSave();

    const submit = async () => {
      const body = editor.value();
      if (!body.trim()) return;
      busy = true;
      syncSave();
      try {
        const key = next.kind === "edit" ? next.key : newNoteKey();
        const fields = { ...parsed.fields };
        delete fields.draft;
        if (next.kind === "new") fields.pubDatetime = new Date().toISOString();
        await saveContent(key, buildMarkdown(fields, body));
        // 直接刷新：构建重新拉 R2，时间线排序、分页一起更新
        location.reload();
      } catch (error) {
        alert(
          `保存失败：${error instanceof Error ? error.message : "未知错误"}`
        );
        busy = false;
        syncSave();
      }
    };

    const remove = async () => {
      if (next.kind !== "edit") return;
      if (!confirm("删除这条随记后不可恢复，确定吗？")) return;
      busy = true;
      syncSave();
      try {
        await removeContent(next.key);
        location.reload();
      } catch (error) {
        alert(
          `删除失败：${error instanceof Error ? error.message : "未知错误"}`
        );
        busy = false;
        syncSave();
      }
    };

    const root = shell(
      editor.el,
      [
        fileLabel(files => void upload(files)),
        save,
        action("取消", "hover:text-accent", () => void close()),
        next.kind === "edit" && action("删除", DANGER, () => void remove()),
        uploadHint,
      ],
      { class: "mt-2" }
    );

    return { mounts: [{ slot, node: root }], editor };
  };

  const edit = (key: string) => {
    const slot = slotEl(key);
    if (!slot) return;
    void loadEditor();
    const read = bodyEl(key);
    const height = Math.min(
      Math.max(read?.getBoundingClientRect().height ?? 0, 26),
      200
    );
    void inline
      .start(
        () => [read],
        async () => {
          const raw = await fetchContent(key);
          mode = { kind: "edit", key };
          return build(mode, slot, raw, `${height}px`);
        }
      )
      .catch(() => alert("打开失败，请重试"));
  };

  const create = () => {
    const slot = slotEl("new");
    if (!slot) return;
    void loadEditor();
    void inline.start(
      () => [],
      () => {
        mode = { kind: "new" };
        return build(mode, slot, "", "6rem");
      }
    );
  };

  void isAdmin().then(ok => {
    if (!ok) return;
    // 事件委托挂在 document 上，分页换页后也不用重新绑定
    document.addEventListener("click", event => {
      const target = event.target as HTMLElement;
      const pencil = target.closest<HTMLElement>("[data-edit-note]");
      if (pencil) {
        edit(pencil.dataset.editNote ?? "");
        return;
      }
      if (target.closest("#new-note")) create();
    });
  });
};

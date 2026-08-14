import {
  createInline,
  createUploader,
  loadEditor,
  preloadEditor,
  type Opened,
} from "./inline";
import { takeoverToc, type TocTakeover } from "./toc";
import { DANGER, PRIMARY, action, fileLabel, h, shell } from "./dom";
import { fetchContent, removeContent, saveContent } from "./api";
import { buildMarkdown, parseMarkdown } from "@/lib/frontmatter";
import { isAdmin } from "./session";

/**
 * 文章的就地编辑：文章页原地变成编辑态。
 *
 * v3 的内容在 R2 里，文章就是一个 posts/<slug>.md 文件：
 * 标题、draft 都在 frontmatter，正文是剩余部分。保存 = PUT 回 R2 +
 * 触发 Deploy Hook 重建，所以这里不需要发布/撤回两段式——保存即上线，
 * 退出编辑就看见。
 */

const el = (selector: string) => document.querySelector<HTMLElement>(selector);

export const mountPostEditor = (slug: string) => {
  preloadEditor();

  const inline = createInline();
  let busy = false;
  // 编辑态期间目录归它管，退出时还回去
  let toc: TocTakeover | null = null;

  const key = `posts/${slug}.md`;
  const reading = () => [el("[data-post-title]"), el("[data-post-body]")];
  const close = async () => {
    await inline.close(reading);
    toc?.restore();
    toc = null;
  };

  const build = async (
    slot: HTMLElement,
    titleSlot: HTMLElement,
    raw: string,
    height: string
  ): Promise<Opened> => {
    const { createEditor } = await loadEditor();
    const parsed = parseMarkdown(raw);

    const error = h("span", { class: "text-xs text-red-600" });
    error.hidden = true;
    const fail = (message: string) => {
      error.textContent = message;
      error.hidden = false;
    };

    const uploadHint = h("span", { class: "text-faint text-xs" });
    uploadHint.hidden = true;
    const upload = createUploader(
      () => inline.editor(),
      count => {
        uploadHint.hidden = count === 0;
        uploadHint.textContent = `上传 ${count} 张…`;
      }
    );

    const title = h("input", {
      placeholder: "标题",
      class:
        "focus:border-accent/60 -mx-2 -my-1 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-bold outline-none sm:text-3xl",
    });
    title.value = parsed.fields.title ?? "";
    title.addEventListener("input", () => syncSave());

    const editor = createEditor({
      value: parsed.body,
      height,
      contentPadding: "0",
      onChange: () => {
        syncSave();
        toc?.refresh();
      },
      onFiles: files => void upload(files),
    });

    const isDraft = parsed.fields.draft === "true";
    const save = action(
      isDraft ? "发布" : "更新",
      PRIMARY,
      () => void submit()
    );
    const syncSave = () => {
      save.disabled = busy || !title.value.trim() || !editor.value().trim();
    };
    syncSave();

    const submit = async () => {
      busy = true;
      syncSave();
      error.hidden = true;
      try {
        const fields: Record<string, string> = {
          ...parsed.fields,
          title: title.value,
          updated: new Date().toISOString(),
        };
        delete fields.draft;
        await saveContent(key, buildMarkdown(fields, editor.value()));
        // 正文 HTML 是构建时渲染的，重建完成后刷新拿回最新版最省事
        location.reload();
      } catch (err) {
        fail(err instanceof Error ? err.message : "保存失败");
        busy = false;
        syncSave();
      }
    };

    const remove = async () => {
      if (!confirm("删除这篇文章后不可恢复，确定吗？")) return;
      busy = true;
      syncSave();
      try {
        await removeContent(key);
        location.assign("/posts");
      } catch {
        fail("删除失败");
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
        action("删除", DANGER, () => void remove()),
        uploadHint,
        error,
      ],
      { wrap: true, fade: true }
    );

    return {
      mounts: [
        { slot: titleSlot, node: title },
        { slot, node: root },
      ],
      editor,
    };
  };

  const start = () => {
    const slot = el("[data-post-editor-slot]");
    const titleSlot = el("[data-post-title-slot]");
    if (!slot || !titleSlot) return;
    // 不 await：让编辑器那一包和下面的取内容并行下载
    void loadEditor();

    const rect = el("[data-post-body]")?.getBoundingClientRect();
    const top = Math.min(Math.max(rect?.top ?? 0, 0), innerHeight / 2);
    const room = Math.round(innerHeight - top - 96);
    const height = Math.min(
      Math.max(rect?.height ?? 0, 240),
      Math.max(room, 240)
    );

    void inline
      .start(reading, async () => {
        const raw = await fetchContent(key);
        return build(slot, titleSlot, raw, `${height}px`);
      })
      .then(() => {
        const handle = inline.editor();
        if (handle) toc = takeoverToc(handle);
      })
      .catch(() => alert("打开失败，请重试"));
  };

  void isAdmin().then(ok => {
    if (!ok) return;
    document
      .querySelector("#edit-post")
      ?.addEventListener("click", () =>
        dispatchEvent(new CustomEvent("post:edit"))
      );
    addEventListener("post:edit", start);
    // 新建后带 ?edit=1 跳回来的那次自动打开
    if (new URLSearchParams(location.search).has("edit")) {
      history.replaceState(null, "", location.pathname);
      start();
    }
  });
};

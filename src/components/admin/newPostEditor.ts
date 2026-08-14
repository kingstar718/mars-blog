import { createUploader, loadEditor, preloadEditor } from "./inline";
import { PRIMARY, action, fileLabel, h, shell } from "./dom";
import { saveContent } from "./api";
import { buildMarkdown } from "@/lib/frontmatter";
import { isAdmin } from "./session";

/**
 * 新文章编辑器。
 *
 * 和就地编辑器不同：没有要藏的阅读态，页面就是一张空白稿纸。
 * 保存 = PUT posts/<slug>.md（标题 + pubDatetime 进 frontmatter），
 * 然后轮询文章页直到重建完成，再跳到 ?edit=1 继续改。
 */

const el = (selector: string) => document.querySelector<HTMLElement>(selector);

export const mountNewPostEditor = () => {
  const slot = el("[data-new-post-editor-slot]");
  if (!slot) return;

  void isAdmin().then(async ok => {
    if (!ok) {
      location.href = `/login?next=${encodeURIComponent("/new-post")}`;
      return;
    }
    preloadEditor();

    const { createEditor } = await loadEditor();
    let busy = false;

    const error = h("span", { class: "text-xs text-red-600" });
    error.hidden = true;
    const fail = (message: string) => {
      error.textContent = message;
      error.hidden = false;
    };

    const uploadHint = h("span", { class: "text-faint text-xs" });
    uploadHint.hidden = true;
    const upload = createUploader(
      () => editor,
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
    title.addEventListener("input", () => syncSave());

    const editor = createEditor({
      value: "",
      height: "60vh",
      contentPadding: "0",
      onChange: () => syncSave(),
      onFiles: files => void upload(files),
    });

    const save = action("发布", PRIMARY, () => void submit());
    const syncSave = () => {
      save.disabled = busy || !title.value.trim() || !editor.value().trim();
    };
    syncSave();

    const status = h("span", { class: "text-faint text-xs" });
    status.hidden = true;

    const submit = async () => {
      if (!title.value.trim() || !editor.value().trim()) return;
      busy = true;
      syncSave();
      error.hidden = true;
      const slug = `${new Date().toISOString().slice(0, 10)}-${Date.now()}`;
      try {
        await saveContent(
          `posts/${slug}.md`,
          buildMarkdown(
            { title: title.value, pubDatetime: new Date().toISOString() },
            editor.value()
          )
        );
        // 等重建完成再跳过去：Deploy Hook 触发的构建通常 1-2 分钟
        status.hidden = false;
        status.textContent = "已发布，等待重建完成后自动打开…";
        const url = `/posts/${slug}`;
        const deadline = Date.now() + 180_000;
        while (Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 10_000));
          const response = await fetch(url).catch(() => null);
          if (response?.ok) {
            location.href = `${url}?edit=1`;
            return;
          }
        }
        fail("重建超时，稍后刷新文章列表即可看到新文章。");
        busy = false;
        syncSave();
      } catch (err) {
        fail(err instanceof Error ? err.message : "保存失败");
        busy = false;
        syncSave();
      }
    };

    const root = shell(
      editor.el,
      [
        fileLabel(files => void upload(files)),
        save,
        action("取消", "hover:text-accent", () => history.back()),
        uploadHint,
        status,
        error,
      ],
      { wrap: true, fade: true }
    );

    // 标题输入放在 h1 的位置上
    const titleSlot = el("[data-new-post-title]");
    if (titleSlot) {
      titleSlot.hidden = true;
      titleSlot.parentElement?.insertBefore(title, titleSlot.nextSibling);
    }
    slot.appendChild(root);
    editor.focus();
  });
};

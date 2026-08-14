import { createInline, loadEditor, preloadEditor, type Opened } from "./inline";
import { PRIMARY, action, h, shell } from "./dom";
import { fetchContent, saveContent } from "./api";
import { buildMarkdown, parseMarkdown } from "@/lib/frontmatter";
import { isAdmin } from "./session";

/**
 * 独立页面（关于）的就地编辑。
 *
 * 和文章、随记是同一套：页面原地变成编辑态。保存即生效，
 * 按钮只有「保存 / 取消」，也不需要插图。
 */

const el = (selector: string) => document.querySelector<HTMLElement>(selector);

export const mountPageEditor = (slug: string) => {
  preloadEditor();

  const key = `pages/${slug}.md`;
  const inline = createInline();
  let busy = false;

  const reading = () => [el("[data-page-body]")];
  const close = () => inline.close(reading);

  const build = async (
    slot: HTMLElement,
    raw: string,
    minHeight: string
  ): Promise<Opened> => {
    const { createEditor } = await loadEditor();
    const parsed = parseMarkdown(raw);

    const error = h("span", { class: "text-xs text-red-600" });
    error.hidden = true;

    const editor = createEditor({
      value: parsed.body,
      minHeight,
      contentPadding: "0",
      onChange: () => syncSave(),
    });

    const save = action("保存", PRIMARY, () => void submit());
    const syncSave = () => {
      save.disabled = busy || !editor.value().trim();
    };
    syncSave();

    const submit = async () => {
      const body = editor.value();
      if (!body.trim()) return;
      busy = true;
      syncSave();
      error.hidden = true;
      try {
        await saveContent(
          key,
          buildMarkdown(
            { ...parsed.fields, title: parsed.fields.title ?? "" },
            body
          )
        );
        location.reload();
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : "保存失败";
        error.hidden = false;
        busy = false;
        syncSave();
      }
    };

    const root = shell(editor.el, [
      save,
      action("取消", "hover:text-accent", () => void close()),
      error,
    ]);

    return { mounts: [{ slot, node: root }], editor };
  };

  void isAdmin().then(ok => {
    if (!ok) return;
    addEventListener("page:edit", () => {
      const slot = el("[data-page-editor-slot]");
      if (!slot) return;
      void loadEditor();
      const height =
        el("[data-page-body]")?.getBoundingClientRect().height ?? 0;

      void inline
        .start(reading, async () => {
          const raw = await fetchContent(key);
          return build(slot, raw, `${Math.max(height, 160)}px`);
        })
        .catch(() => alert("打开失败，请重试"));
    });
  });
};

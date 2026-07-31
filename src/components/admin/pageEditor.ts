import { createEditor } from "./editor";
import { createInline, type Opened } from "./inline";
import { PRIMARY, action, h, shell } from "./dom";

/**
 * 独立页面（关于）的就地编辑。
 *
 * 和文章、随记是同一套（见 inline.ts）：页面原地变成编辑态，
 * 正文落回正文的位置。独立页面没有草稿也没有发布，保存即生效，
 * 所以按钮只有「保存 / 取消」，也不需要插图。
 *
 * 标题不在这里改：它只出现在浏览器标签上，页面里根本没有这行字，
 * 摆一个输入框出来反而比阅读态多了一样东西。保存时原样带回去。
 */

const el = (selector: string) => document.querySelector<HTMLElement>(selector);

export const mountPageEditor = (slug: string) => {
  const inline = createInline();
  let busy = false;

  const reading = () => [el("[data-page-body]")];
  const close = () => inline.close(reading);

  const build = (
    slot: HTMLElement,
    page: { title: string; body: string },
    minHeight: string
  ): Opened => {
    const error = h("span", { class: "text-xs text-red-600" });
    error.hidden = true;

    const editor = createEditor({
      value: page.body,
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
        const response = await fetch("/api/admin/pages", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug, title: page.title, body }),
        });
        if (!response.ok) throw new Error("保存失败");
        // HTML 是服务端算的，刷新一次拿回来
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

  addEventListener("page:edit", () => {
    const slot = el("[data-page-editor-slot]");
    if (!slot) return;
    const height = el("[data-page-body]")?.getBoundingClientRect().height ?? 0;

    void inline
      .start(reading, async () => {
        const response = await fetch(`/api/admin/pages?slug=${slug}`);
        if (!response.ok) throw new Error("读取失败");
        const { page } = (await response.json()) as {
          page: { title: string; body: string };
        };
        return build(slot, page, `${Math.max(height, 160)}px`);
      })
      .catch(() => alert("打开失败，请重试"));
  });
};

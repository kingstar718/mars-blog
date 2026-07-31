import { createEditor } from "./editor";
import { createInline, createUploader, type Opened } from "./inline";
import { DANGER, PLAIN, PRIMARY, action, fileLabel, h, shell } from "./dom";
import {
  fetchEntry,
  publishEntry,
  removeEntry,
  saveEntry,
  unpublishEntry,
} from "./api";

/**
 * 文章的就地编辑：文章页原地变成编辑态。
 *
 * 和随记那边是同一套（见 inline.ts），差别只在文章多一个标题，
 * 以及多了「撤回」。这里不做预览——阅读态就是预览，退出编辑就看见了。
 *
 * 正文仍由服务端渲染，编辑器挂进页面上留好的占位。标题和正文各有
 * 一个占位：整块挂在末尾的话，标题会跑到日期行下面去。
 */

const el = (selector: string) => document.querySelector<HTMLElement>(selector);

export const mountPostEditor = (id: number, initialStatus: string) => {
  const inline = createInline();
  let busy = false;

  const reading = () => [el("[data-post-title]"), el("[data-post-body]")];
  const close = () => inline.close(reading);

  const build = (
    slot: HTMLElement,
    titleSlot: HTMLElement,
    entry: { title: string; body: string; status: string },
    height: string
  ): Opened => {
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

    // 字号字重和阅读态的 h1 一样，描边聚焦时才出现；
    // 负外边距抵消内边距，文字不横移
    const title = h("input", {
      placeholder: "标题",
      class:
        "focus:border-accent/60 -mx-2 -my-1 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-bold outline-none sm:text-3xl",
    });
    title.value = entry.title;
    title.addEventListener("input", () => syncSave());

    const editor = createEditor({
      value: entry.body,
      height,
      contentPadding: "0",
      onChange: () => syncSave(),
      onFiles: files => void upload(files),
    });

    const save = action(
      entry.status === "published" ? "更新" : "发布",
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
        await saveEntry(id, {
          kind: "post",
          title: title.value,
          body: editor.value(),
        });
        const result = await publishEntry(id);
        if (!result.ok) {
          fail(Object.values(result.errors ?? {}).join("；") || "发布失败");
          return;
        }
        // 正文 HTML 是服务端渲染的，刷新一次拿回来最省事
        location.reload();
      } catch (err) {
        fail(err instanceof Error ? err.message : "保存失败");
      } finally {
        busy = false;
        syncSave();
      }
    };

    const unpublish = async () => {
      if (!confirm("撤回后这篇文章将只有你自己看得到，确定吗？")) return;
      busy = true;
      syncSave();
      try {
        await unpublishEntry(id);
        location.reload();
      } catch {
        fail("撤回失败");
        busy = false;
        syncSave();
      }
    };

    const remove = async () => {
      if (!confirm("删除这篇文章后不可恢复，确定吗？")) return;
      busy = true;
      syncSave();
      try {
        await removeEntry(id);
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
        entry.status === "published" &&
          action("撤回", PLAIN, () => void unpublish()),
        action("删除", DANGER, () => void remove()),
        uploadHint,
        error,
      ],
      { wrap: true }
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
    // 编辑器贴着原文的高度，页面不会因为进编辑态而缩掉一大截；但必须封顶。
    // 按钮行在编辑框下面，不封顶的话一篇七千像素的长文要滚到底才够得着
    // 「发布」和「取消」——这是固定高度存在的唯一理由，超出的部分由编辑区
    // 自己滚（见 editor.ts 的 height 分支）。
    //
    // 上限按「编辑器落点到视口底部还剩多少」算，不是拍一个 70vh：
    // 编辑器落在原文的位置上，那个位置越靠下，能给的高度就越少。
    // 留 96px 给按钮行和一点余量，让它稳稳落在首屏里。
    const rect = el("[data-post-body]")?.getBoundingClientRect();
    // 滚到半途才点铅笔时 top 可能是负的，夹一下
    const top = Math.min(Math.max(rect?.top ?? 0, 0), innerHeight / 2);
    const room = Math.round(innerHeight - top - 96);
    const height = Math.min(
      Math.max(rect?.height ?? 0, 240),
      Math.max(room, 240)
    );

    void inline
      .start(reading, async () => {
        const { entry } = await fetchEntry(id);
        return build(
          slot,
          titleSlot,
          {
            title: entry.title ?? "",
            body: entry.body,
            status: entry.status ?? initialStatus,
          },
          `${height}px`
        );
      })
      .catch(() => alert("打开失败，请重试"));
  };

  addEventListener("post:edit", start);
  // 新建文章后带 ?edit=1 跳回来的那次自动打开
  if (new URLSearchParams(location.search).has("edit")) {
    history.replaceState(null, "", location.pathname);
    start();
  }
};

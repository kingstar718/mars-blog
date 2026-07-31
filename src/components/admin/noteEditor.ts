import { createEditor } from "./editor";
import { createInline, createUploader, type Opened } from "./inline";
import { DANGER, PRIMARY, action, fileLabel, h, shell } from "./dom";
import {
  createEntry,
  fetchEntry,
  publishEntry,
  removeEntry,
  saveEntry,
} from "./api";

/**
 * 随记的就地编辑。
 *
 * 随记没有详情页，写一条本来就是「打开、敲两行、发出去」，
 * 为它跳一趟别的页面太重了。
 *
 * 编辑器挂进那条随记自己的位置（服务端在每条后面留了一个空占位 div），
 * 同时把渲染好的正文藏起来——所以视觉上是这条原地变成了编辑态，
 * 而不是从别处弹出来一个面板。进出的时序见 inline.ts。
 *
 * 页面上的正文不归这里管：那是服务端渲染的 HTML，保持无 JS 可读、可缓存。
 */

type Mode = { kind: "edit"; id: number } | { kind: "new" };

const bodyEl = (id: number) =>
  document.querySelector<HTMLElement>(`[data-note-body="${id}"]`);

const slotEl = (key: string) =>
  document.querySelector<HTMLElement>(`[data-note-editor-slot="${key}"]`);

export const mountNoteEditor = () => {
  const inline = createInline();
  let mode: Mode | null = null;
  let busy = false;

  const close = async () => {
    const current = mode;
    await inline.close(() => [
      current?.kind === "edit" ? bodyEl(current.id) : null,
    ]);
    mode = null;
  };

  const build = (
    next: Mode,
    slot: HTMLElement,
    initial: string,
    minHeight: string
  ): Opened => {
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
      value: initial,
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
    // 空正文不能发。React 版靠重渲染算这个 disabled，这里每次输入调一次
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
        const id =
          next.kind === "edit"
            ? next.id
            : (await createEntry({ kind: "note", body })).id;
        if (next.kind === "edit") await saveEntry(id, { kind: "note", body });
        const result = await publishEntry(id);
        if (!result.ok) {
          alert(Object.values(result.errors ?? {}).join("\n") || "发布失败");
          return;
        }
        // 直接刷新：正文 HTML 是服务端渲染的，让服务端重新给一份最省事，
        // 顺带把时间线的排序、分页、统计一起更新了
        location.reload();
      } catch (error) {
        alert(
          `保存失败：${error instanceof Error ? error.message : "未知错误"}`
        );
      } finally {
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
        await removeEntry(next.id);
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

  const edit = (id: number) => {
    const slot = slotEl(String(id));
    if (!slot) return;
    const read = bodyEl(id);
    // 编辑框跟原正文一样高，下面的内容就不会被顶动。但要封顶——图多的
    // 随记在编辑态只是几行 markdown 链接，照搬阅读态的高度会留下一大片空白；
    // 下限一行（26px）：随记本来就可能只有一行，编辑框凭空高出去也是跳
    const height = Math.min(
      Math.max(read?.getBoundingClientRect().height ?? 0, 26),
      200
    );
    void inline
      .start(
        () => [read],
        async () => {
          const { entry } = await fetchEntry(id);
          mode = { kind: "edit", id };
          return build(mode, slot, entry.body, `${height}px`);
        }
      )
      .catch(() => alert("打开失败，请重试"));
  };

  const create = () => {
    const slot = slotEl("new");
    if (!slot) return;
    // 新建没有要藏的阅读态，也没有要取的数据，走同一条路只是为了同一套动画
    void inline.start(
      () => [],
      () => {
        mode = { kind: "new" };
        return Promise.resolve(build(mode, slot, "", "6rem"));
      }
    );
  };

  // 事件委托挂在 document 上，分页换页后也不用重新绑定
  document.addEventListener("click", event => {
    const target = event.target as HTMLElement;
    const pencil = target.closest<HTMLElement>("[data-edit-note]");
    if (pencil) {
      edit(Number(pencil.dataset.editNote));
      return;
    }
    if (target.closest("#new-note")) create();
  });
};

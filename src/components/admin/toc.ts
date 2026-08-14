import type { EditorHandle } from "./editor";
import { extractOutline, type OutlineItem } from "./outline";
import { h } from "./dom";

/**
 * 编辑态接管页面上的目录。
 *
 * 阅读态的目录是构建时渲染的，锚点指向正文里的标题。进编辑态之后正文被
 * hidden 掉，那些标题没有布局盒，浏览器无从滚动；而且那份目录本身也过时。
 * 所以编辑态换一份：内容实时从编辑器里算（见 outline.ts），点击滚编辑器
 * 对应的行。退出时把原来那份原样放回去。
 */

/** 敲字到目录刷新的间隔。写一个标题的过程中不该每敲一个字就重排一次 */
const REBUILD_MS = 250;

interface Slot {
  parent: HTMLElement;
  original: Element;
  live: HTMLUListElement;
  kind: "sidebar" | "inline";
}

const sidebarItem = (item: OutlineItem, onPick: () => void) => {
  const dash = h("span", {
    class: `toc-dash h-0.5 rounded-full bg-current opacity-50 transition-opacity ${
      item.depth === 2 ? "w-4" : "w-2"
    }`,
  });
  const link = h(
    "a",
    {
      href: "#",
      class:
        "hover:text-accent flex items-center gap-2 py-0.5 text-sm leading-4 no-underline",
    },
    h("span", { class: "flex w-4 shrink-0 items-center" }, dash),
    h("span", { class: "toc-label" }, item.text)
  );
  link.addEventListener("click", event => {
    event.preventDefault();
    onPick();
  });
  return h("li", {}, link);
};

const inlineItem = (item: OutlineItem, onPick: () => void) => {
  const link = h(
    "a",
    { href: "#", class: "hover:text-accent block py-1 no-underline" },
    item.text
  );
  link.addEventListener("click", event => {
    event.preventDefault();
    onPick();
  });
  return h("li", { class: item.depth === 3 ? "ps-3" : undefined }, link);
};

export const takeoverToc = (editor: EditorHandle) => {
  const slots: Slot[] = [];
  for (const [selector, kind] of [
    ["#toc-sidebar nav > ul", "sidebar"],
    ["#post-toc-panel > ul", "inline"],
  ] as const) {
    const original = document.querySelector(selector);
    const parent = original?.parentElement;
    if (!original || !parent) continue;
    const live = h("ul");
    parent.replaceChild(live, original);
    slots.push({ parent, original, live, kind });
  }
  if (slots.length === 0) return { refresh: () => {}, restore: () => {} };

  const sidebar = document.getElementById("toc-sidebar");
  const wasEmpty = sidebar?.hasAttribute("data-toc-empty") ?? false;
  let items: OutlineItem[] = [];
  let active: HTMLElement | null = null;

  const render = () => {
    items = extractOutline(editor.value());
    for (const slot of slots) {
      slot.live.replaceChildren(
        ...items.map(item => {
          const pick = () => editor.scrollToLine(item.line);
          return slot.kind === "sidebar"
            ? sidebarItem(item, pick)
            : inlineItem(item, pick);
        })
      );
    }
    sidebar?.toggleAttribute("data-toc-empty", items.length < 2);
    active = null;
    spy();
  };

  /** 高亮编辑器视口顶部所在的那一节 */
  const spy = () => {
    if (items.length === 0) return;
    const top = editor.topLine();
    let index = -1;
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].line <= top) index = i;
      else break;
    }
    const link =
      index >= 0
        ? (slots
            .find(s => s.kind === "sidebar")
            ?.live.children[index]?.querySelector("a") ?? null)
        : null;
    if (link === active) return;
    active?.removeAttribute("aria-current");
    link?.setAttribute("aria-current", "true");
    active = link;
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRender = () => {
    clearTimeout(timer);
    timer = setTimeout(render, REBUILD_MS);
  };

  const scroller = editor.scroller();
  scroller?.addEventListener("scroll", spy, { passive: true });

  render();

  return {
    /** 编辑器内容变了就重排，由 onChange 调 */
    refresh: scheduleRender,
    /** 退出编辑态：把发布版的目录原样放回去 */
    restore: () => {
      clearTimeout(timer);
      scroller?.removeEventListener("scroll", spy);
      for (const slot of slots)
        slot.parent.replaceChild(slot.original, slot.live);
      sidebar?.toggleAttribute("data-toc-empty", wasEmpty);
    },
  };
};

export type TocTakeover = ReturnType<typeof takeoverToc>;

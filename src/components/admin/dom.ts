/**
 * 建 DOM 的最小工具，用来替掉 JSX。
 *
 * 三个编辑器的界面是静态的：一个带描边的方框套着编辑器，下面一行按钮。
 * 真正会变的只有几个按钮的 disabled 和两处状态文字——为这点动态性
 * 养一整套框架不划算，但一行行 createElement 又太吵，所以留一个 h()。
 *
 * 刻意不做的事：没有 diff、没有响应式。要改哪个按钮就拿着它自己改，
 * 这在只有五个按钮的界面里比「重新渲染一遍」更好读，也更好调。
 */

type Child = Node | string | null | undefined | false;

type Props = Record<string, unknown> & {
  class?: string;
  onclick?: (event: MouseEvent) => void;
};

export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = String(value);
    else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2), value as EventListener);
    } else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    // 用 appendChild 而不是 append：worker-configuration.d.ts 里
    // HTMLRewriter 的 Element 也叫 Element，它的 append 只收字符串和流，
    // 声明合并之后把 DOM 那个重载盖掉了
    el.appendChild(
      typeof child === "string" ? document.createTextNode(child) : child
    );
  }
  return el;
};

/** 按钮行里的一个动作。文字之外只有配色不同，所以类名直接传 */
export const action = (
  text: string,
  className: string,
  onclick: () => void
) => {
  const button = h("button", { type: "button", class: className }, text);
  button.addEventListener("click", () => onclick());
  return button;
};

/** 主动作：发布 / 更新 / 保存 */
export const PRIMARY = "text-accent font-medium disabled:opacity-40";
/** 次要动作：取消 / 撤回 */
export const PLAIN = "hover:text-accent disabled:opacity-40";
/** 删除 */
export const DANGER = "hover:text-red-600 disabled:opacity-40";

/**
 * 「插图」入口：一个 label 套着隐藏的 file input。
 * 用 label 而不是 button + click()：点 label 触发文件框是浏览器原生行为，
 * 不需要 JS，也不会被 Safari 的「必须是用户手势」拦掉。
 */
export const fileLabel = (onFiles: (files: File[]) => void) => {
  const input = h("input", {
    type: "file",
    accept: "image/*",
    multiple: true,
    class: "hidden",
  });
  input.addEventListener("change", () => {
    const files = [...(input.files ?? [])];
    input.value = "";
    if (files.length > 0) onFiles(files);
  });
  return h(
    "label",
    { class: "hover:text-accent cursor-pointer" },
    "插图",
    input
  );
};

/**
 * 编辑器外壳：一块底色 + 下面的按钮行。三个编辑器共用。
 *
 * 底色靠负外边距抵消自己的内边距：文字仍然落在阅读态那一列上，
 * 进出编辑态时一个字都不会横移，变的只是身下多了一层纸。
 *
 * 原来是一圈 1px 描边。线的边缘最抓眼，一个方框摆在正文里显得硬；
 * 换成 bg-muted 这一档极淡的底色（相对页面背景对比度 1.17 / 1.27），
 * 面比线安静，但作为一整块面积仍然一眼可见。聚焦时点亮描边的那个效果
 * 一并去掉了——编辑器打开即自动聚焦，那个状态几乎恒为真，从没起过作用。
 *
 * 按钮行是这次唯一新增的高度，交给 note-actions-enter 自己展开出来。
 */
export const shell = (
  editorEl: HTMLElement,
  actions: Child[],
  options: { class?: string; wrap?: boolean; fade?: boolean } = {}
) =>
  h(
    "div",
    { class: options.class },
    h(
      "div",
      {
        // 纵向内边距比描边版大一档：底色贴着字会像高亮标记，得留出呼吸。
        // 横向仍是 8px——12px 时手机上色块离屏幕边只剩 4px，太贴边
        class: `bg-muted -mx-2 -my-2 rounded-md px-2 py-2${
          options.fade ? " editor-fade-bottom" : ""
        }`,
      },
      editorEl
    ),
    h(
      "div",
      { class: "note-actions-enter" },
      h(
        "div",
        {},
        h(
          "div",
          {
            class: `text-muted-foreground mt-3 flex items-center gap-4 text-sm${
              options.wrap ? " flex-wrap" : ""
            }`,
          },
          ...actions
        )
      )
    )
  );

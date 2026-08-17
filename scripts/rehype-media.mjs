/**
 * 构建期图片重写（rehype 插件）。
 *
 * 正文里存的是短引用 `![](/media/<uid>)`，直接渲染会让代理每次都返回
 * 大图。这里根据 media-manifest.json（sync-content 从 R2 拉取）
 * 把短引用重写为响应式 <img>：
 *   - 主档 jpeg（canvas 的 webp 高质档实测比 jpeg 大 5–7 倍）
 *   - src 指向 800 档兜底（老浏览器无 srcset 时也有清晰度）
 *   - srcset 只列 ≤800 的档（400/800），1600 只归档不下发；
 *     没有 ≤800 档时不重写（代理同样返回 404）；
 *     sizes 按正文宽度，浏览器按视口选档
 *   - width/height 用 800 档比例，防布局跳动
 *   - loading="lazy" decoding="async"
 *   - data-thumb / data-full 供 NoteImageZoom 运行时切换大小档
 *
 * 降级：manifest 缺失（本地/CI 没有 R2 凭据）或该 uid 没有 ≤800 档时
 * 保留短引用，只补 loading="lazy"，页面仍可正常渲染。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MANIFEST_PATH = join(
  process.cwd(),
  "src",
  "content",
  "media-manifest.json"
);
const SIZES = "(min-width: 40rem) 48rem, 92vw";

export default function rehypeMedia() {
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    manifest = null;
  }

  return tree => {
    const visit = node => {
      if (node?.type === "element" && node.tagName === "img") {
        const props = node.properties ?? {};
        const src = typeof props.src === "string" ? props.src : "";
        // 短引用：/media/<uid>，不带扩展名（带尺寸的旧 URL 不动）
        const short = src.match(/^\/media\/([^/.]+)$/);
        const uid = short?.[1];
        const variants = uid ? manifest?.[uid] : null;

        if (Array.isArray(variants) && variants.length > 0) {
          // 主档 jpeg：只要有一张 jpeg，整组只用 jpeg；只有 webp 才退回 webp。
          // 与 functions/lib/media.ts 的短引用选档保持同一规则。
          const preferred = variants.filter(v => v.format === "jpeg");
          const group = preferred.length > 0 ? preferred : variants;
          const served = group
            .filter(
              v =>
                (v.format === "jpeg" || v.format === "webp") &&
                v.width > 0 &&
                v.width <= 800
            )
            .sort((a, b) => a.width - b.width);
          if (served.length > 0) {
            const largest = served[served.length - 1];
            const ext = preferred.length > 0 ? "jpg" : "webp";
            props.src = `/media/${uid}/${largest.width}.${ext}`;
            props.srcset = served
              .map(v => `/media/${uid}/${v.width}.${ext} ${v.width}w`)
              .join(", ");
            props.sizes = SIZES;
            props.width = String(largest.width);
            // height 可能是 0（历史数据缺高度）：只写 width，避免 height="0"
            // 把布局打崩，NoteImageZoom 也据此跳过高度设置
            const height =
              largest.height > 0 ? String(largest.height) : undefined;
            if (height) props.height = height;
            props.loading = "lazy";
            props.decoding = "async";
            // NoteImageZoom 展开大图时用。hast 属性名必须写 kebab-case，
            // 它不会自动把 dataThumb 转成 data-thumb。
            props["data-thumb"] = `/media/${uid}/${served[0].width}.${ext}`;
            props["data-full"] = `/media/${uid}/${largest.width}.${ext}`;
            props["data-srcset"] = props.srcset;
            props["data-sizes"] = props.sizes;
            props["data-full-width"] = String(largest.width);
            if (height) props["data-full-height"] = height;
          } else {
            // 没有 ≤800 的档：1600 只归档不下发，不重写（代理同样 404）
            props.loading = "lazy";
          }
        } else if (src.startsWith("/media/")) {
          // 没有 manifest：至少懒加载，别让整页图片一起下载
          props.loading = "lazy";
        }
      }
      for (const child of node?.children ?? []) visit(child);
    };
    visit(tree);
  };
}

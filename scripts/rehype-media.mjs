/**
 * 构建期图片重写（rehype 插件）。
 *
 * 正文里存的是短引用 `![](/media/<uid>)`，直接渲染会让代理每次都返回
 * 1600px 大图。这里根据 media-manifest.json（sync-content 从 R2 拉取）
 * 把短引用重写为响应式 <img>：
 *   - src 指向 800 档兜底（老浏览器无 srcset 时也有清晰度）
 *   - srcset 列出全部 webp 档，sizes 按正文宽度，浏览器按视口选档
 *   - width/height 用最大档比例，防布局跳动
 *   - loading="lazy" decoding="async"
 *   - data-thumb / data-full 供 NoteImageZoom 运行时切换大小档
 *
 * 降级：manifest 缺失（本地/CI 没有 R2 凭据）时保留短引用，
 * 只补 loading="lazy"，页面仍可正常渲染。
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
          const webps = variants
            .filter(v => v.format === "webp")
            .sort((a, b) => a.width - b.width);
          if (webps.length > 0) {
            const largest = webps[webps.length - 1];
            // 兜底档：不超过 800 的最大档（正文 48rem 内 800 足够）
            const fallback =
              webps.filter(v => v.width <= 800).at(-1) ?? webps[0];
            props.src = `/media/${uid}/${fallback.width}.webp`;
            props.srcset = webps
              .map(v => `/media/${uid}/${v.width}.webp ${v.width}w`)
              .join(", ");
            props.sizes = SIZES;
            props.width = String(largest.width);
            props.height = String(largest.height);
            props.loading = "lazy";
            props.decoding = "async";
            // NoteImageZoom 展开大图时用。hast 属性名必须写 kebab-case，
            // 它不会自动把 dataThumb 转成 data-thumb。
            props["data-thumb"] = `/media/${uid}/${webps[0].width}.webp`;
            props["data-full"] = `/media/${uid}/${largest.width}.webp`;
            props["data-srcset"] = props.srcset;
            props["data-sizes"] = props.sizes;
            props["data-full-width"] = String(largest.width);
            props["data-full-height"] = String(largest.height);
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

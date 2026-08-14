import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import rehypeMedia from "./scripts/rehype-media.mjs";

// 静态化（v3）：构建期生成纯 HTML，部署到 Cloudflare Pages。
// 动态能力（编辑、评论、浏览数、图片代理）全部走 Pages Functions
//（functions/ 目录），内容真相源是 R2 里的 markdown。
//
// 用 .mjs 而不是 .ts：Astro 加载 .ts 配置会走 Vite module runner，
// 在 Vite 8.1.x 上会把 @tailwindcss/vite 链上的 CJS 依赖（source-map-js）
// 原样内联导致 `require is not defined`；.mjs 走 Node 原生 import，无此问题。
// 当前已降级到 Astro 6 + Vite 7（无此缺陷），.mjs 形式继续保留，无副作用。

export default defineConfig({
  output: "static",
  markdown: {
    // 双主题语法高亮：Astro 输出 --shiki-light/--shiki-dark 变量，
    // typography.css 的 .astro-code 再按 data-theme 选边；背景统一走 --code-background。
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      // 颜色全部走 --shiki-* 变量，由 CSS 按 data-theme 选边，
      // 避免 Astro 把 light 色值内联写死、dark 下盖不回去。
      defaultColor: false,
    },
    // 短引用图片重写为响应式 <img>，见 scripts/rehype-media.mjs
    rehypePlugins: [rehypeMedia],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});

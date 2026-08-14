import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

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
  vite: {
    plugins: [tailwindcss()],
  },
});

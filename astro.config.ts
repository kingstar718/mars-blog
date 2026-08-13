import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// 静态化（v3）：构建期生成纯 HTML，部署到 Cloudflare Pages。
// 动态能力（编辑、评论、浏览数、图片代理）全部走 Pages Functions
//（functions/ 目录），内容真相源是 R2 里的 markdown。

export default defineConfig({
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
});

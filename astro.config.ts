import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // 内容在 D1 里，页面必须在请求时渲染
  output: "server",
  // 绑定不再走 Astro.locals.runtime.env，改从 cloudflare:workers 取（见 src/lib/env.ts）。
  // adapter v14 底层是 @cloudflare/vite-plugin，astro dev 里也能拿到真实绑定。
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
  },
});

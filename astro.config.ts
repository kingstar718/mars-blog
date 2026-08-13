import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";

// 自部署（v2）：Astro SSR 跑在 Node 上，不再依赖 Cloudflare。
// 绑定来源见 src/lib/env.ts（process.env + SQLite + 本地磁盘），
// 数据库层见 src/lib/sqlite.ts。

export default defineConfig({
  // 内容在 SQLite 里，页面必须在请求时渲染
  output: "server",
  adapter: node({ mode: "standalone" }),
  // 会话是自己的 HMAC 签名 cookie（src/lib/session.ts），不用 Astro 的 session API。
  // null 驱动保证不注入任何会话存储。
  session: { driver: { entrypoint: "unstorage/drivers/null" } },
  // 关掉 Astro 内置的表单 Origin 校验：单用户自部署站点，反代 TLS
  // 终止场景下它会把 https 来源误判成跨站（403），拦爆破靠强口令+限流。
  security: { checkOrigin: false },
  vite: {
    plugins: [tailwindcss()],
  },
});

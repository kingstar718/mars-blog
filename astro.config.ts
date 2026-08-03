import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // 内容在 D1 里，页面必须在请求时渲染
  output: "server",
  // 绑定不再走 Astro.locals.runtime.env，改从 cloudflare:workers 取（见 src/lib/env.ts）。
  // adapter v14 底层是 @cloudflare/vite-plugin，astro dev 里也能拿到真实绑定。
  adapter: cloudflare({
    // 图片不走 Cloudflare Images。适配器默认是 'cloudflare-binding'，会自动
    // 塞一个 IMAGES 绑定进来，而本站压根不用 astro:assets——图片在浏览器端
    // 压好存 R2，srcset 由 render.ts 自己拼（见 components/admin/resize.ts）。
    // 白挂一个没人用的绑定，只会让 wrangler 的绑定列表和真实依赖对不上。
    imageService: "passthrough",
  }),
  // 会话是自己的 HMAC 签名 cookie（src/lib/session.ts），不用 Astro 的 session API。
  // 不显式给 driver 的话，适配器会自动配一个 KV 驱动并注入 SESSION 绑定
  // （见适配器 dist/index.js 里的 `if (!session?.driver)`）。null 驱动堵住这条路。
  //
  // 写成 { entrypoint } 而不是 sessionDrivers.null()：那个辅助函数在运行时
  // 有 null 和 memory 两项，Astro 的 drivers.d.ts 却没声明，直接调用过不了
  // astro check。这里给的形状就是 SessionDriverConfigSchema 认的那个。
  session: { driver: { entrypoint: "unstorage/drivers/null" } },
  vite: {
    plugins: [tailwindcss()],
  },
});

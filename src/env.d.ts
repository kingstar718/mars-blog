/// <reference types="astro/client" />

// DB 和 MEDIA 的类型由 `wrangler types` 从 wrangler.jsonc 生成，
// 写进 worker-configuration.d.ts（未入库，pnpm install 时自动生成）。
// 这里只补上机密——它们不在 wrangler.jsonc 里，wrangler 看不到。
//
// 必须扩 Cloudflare.Env 而不是全局 Env：
// `cloudflare:workers` 导出的是 `export const env: Cloudflare.Env`，
// 扩全局 Env 能通过声明合并，但 env 的类型不受影响。
declare namespace Cloudflare {
  interface Env {
    /** 站长口令的 PBKDF2 哈希，用 scripts/hash-password.mjs 生成 */
    ADMIN_PASSWORD_HASH: string;
    /** 会话 cookie 的签名密钥 */
    SESSION_SECRET: string;
    /** 每日备份用，与后台会话无关：GitHub Actions 拿它调 /api/export */
    EXPORT_TOKEN: string;
  }
}

declare namespace App {
  interface Locals {
    /** 由 src/middleware.ts 写入：带着有效会话 cookie 的请求才有值 */
    session?: import("./lib/session").SessionPayload;
  }
}

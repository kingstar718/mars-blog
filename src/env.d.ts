/// <reference types="astro/client" />

// DB 和 MEDIA 的类型由 `wrangler types` 从 wrangler.jsonc 生成，
// 写进 worker-configuration.d.ts（未入库，pnpm install 时自动生成）。
// 这里只补上机密——它们不在 wrangler.jsonc 里，wrangler 看不到。
interface Env {
  /** GitHub OAuth 应用 */
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** 只有这个 GitHub 账号能进后台，单用户站点不建用户表 */
  ADMIN_GITHUB_LOGIN: string;
  /** 会话 cookie 的签名密钥 */
  SESSION_SECRET: string;
}

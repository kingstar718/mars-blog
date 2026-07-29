import { env } from "cloudflare:workers";

/**
 * 绑定的统一入口。
 *
 * adapter v14 起，绑定不再挂在 `Astro.locals.runtime.env` 上
 * （那里现在只有 `cfContext`），改从 `cloudflare:workers` 取。
 * 全项目只在这一处 import，以后 Cloudflare 再改 API 只用动这个文件。
 */
export const db = () => env.DB;
export const media = () => env.MEDIA;

export { env };

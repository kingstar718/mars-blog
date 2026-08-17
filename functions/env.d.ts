import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

/**
 * Pages Functions 的绑定与环境变量。
 *
 * 在 Cloudflare Pages 项目里配置：
 * - D1 数据库绑定：DB
 * - R2 绑定：MEDIA（图片桶 mars-blog-media）、CONTENT（内容桶 mars-blog-content）
 * - 加密变量：ADMIN_PASSWORD、DEPLOY_HOOK_URL
 */
export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  CONTENT: R2Bucket;
  ADMIN_PASSWORD: string;
  /** Pages Deploy Hook URL，编辑保存后触发静态构建 */
  DEPLOY_HOOK_URL?: string;
}

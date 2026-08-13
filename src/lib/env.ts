import { openDatabase } from "./sqlite";
import { ensureSessionSecret } from "./settings";
import { media as getMedia, reloadMedia } from "./media";

/**
 * 自部署（v2）的配置入口：环境变量 + SQLite + 本地磁盘，
 * 替代原来的 cloudflare:workers 绑定。全项目只在这一处 import，
 * 以后存储或配置再变只用动这个文件。
 */
const database = openDatabase();
const env = {
  DB: database,
  // 会话密钥落库：没有就生成一份。不依赖环境变量，重启不换。
  // 必须在 DB 就绪后立即求值——middleware 和限流都拿它当盐。
  SESSION_SECRET: await ensureSessionSecret(database),
};

// 图片后端：有启用的 S3 配置就用 S3，否则本地磁盘。见 src/lib/media.ts
await reloadMedia(database);

export const db = () => env.DB;
export const media = () => getMedia();

export { env };

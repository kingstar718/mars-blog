import { createHash } from "node:crypto";
import { openDatabase } from "./sqlite";
import { media as getMedia, reloadMedia } from "./media";

/**
 * 自部署（v2）的配置入口：环境变量 + SQLite + 本地磁盘，
 * 替代原来的 cloudflare:workers 绑定。全项目只在这一处 import，
 * 以后存储或配置再变只用动这个文件。
 */
const database = openDatabase();

// 登录口令是部署时注入的环境变量（docker compose 的 environment），
// 不落库：换口令 = 换 ADMIN_PASSWORD。缺了站点不可用（中间件惰性加载，
// 首次请求才报错），日志里会说清楚。
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

if (!ADMIN_PASSWORD) {
  throw new Error(
    "缺少环境变量：需要配置 ADMIN_PASSWORD（站长登录口令）"
  );
}

// 单用户站点不单独配会话密钥：从口令派生 HMAC 密钥，少一个要管理的
// 环境变量。口令没变，重启后已登录的会话仍然有效；换口令即全部下线。
const SESSION_SECRET = createHash("sha256")
  .update(`mars-blog:session-key:v1:${ADMIN_PASSWORD}`)
  .digest("hex");

const env = {
  DB: database,
  ADMIN_PASSWORD,
  SESSION_SECRET,
};

// 图片后端：有启用的 S3 配置就用 S3，否则本地磁盘。见 src/lib/media.ts
await reloadMedia(database);

export const db = () => env.DB;
export const media = () => getMedia();

export { env };

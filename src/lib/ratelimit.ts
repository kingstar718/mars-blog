import dayjs from "dayjs";
import { now, SITE_TIMEZONE, DB_DATETIME_FORMAT } from "./datetime";

/**
 * 固定窗口限流。
 *
 * 用 D1 而不是 KV：KV 最终一致、没有原子自增，并发提交会各读各的旧值，
 * 限流形同虚设——和浏览量那边是同一个理由。
 *
 * 固定窗口而不是滑动窗口：滑动窗口要留每次请求的时间戳，
 * 为了拦垃圾评论存一张明细表不划算。固定窗口在窗口交界处最多放进两倍配额，
 * 对「别让脚本灌满审核队列」这个目标足够了。
 */

/** IP 加盐哈希。限流只需要区分「是不是同一个人」，不需要知道是谁。 */
export const clientKey = async (prefix: string, ip: string, secret: string) => {
  const data = new TextEncoder().encode(`${secret}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}:${hex}`;
};

export interface RateLimitResult {
  allowed: boolean;
  count: number;
}

export const hit = async (
  db: D1Database,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> => {
  const stamp = now();
  const cutoff = dayjs()
    .tz(SITE_TIMEZONE)
    .subtract(windowSeconds, "second")
    .format(DB_DATETIME_FORMAT);

  // 一句 UPSERT 里同时做「窗口过期就重置」和「没过期就加一」，
  // 拆成读+写两步的话，两个并发请求会同时读到 limit-1 然后双双放行
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, window_start) VALUES (?1, 1, ?2)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start < ?3 THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start < ?3 THEN ?2 ELSE rate_limits.window_start END
       RETURNING count`
    )
    .bind(key, stamp, cutoff)
    .first<{ count: number }>();

  const count = row?.count ?? 1;
  return { allowed: count <= limit, count };
};

/**
 * 这张表里最长的那个窗口，也就是浏览量去重用的 24 小时（见 api/views.ts）。
 * 加一个比它更长的用途时要改这里，否则清扫会把还没到期的桶删掉。
 */
export const LONGEST_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * 顺手清掉过期的桶。
 *
 * 没有定时任务来收这张表，就在写入路径上顺带做——评论提交本来就不频繁，
 * 多一句 DELETE 不值一提，但少了它这张表只增不减。
 *
 * 清扫线由 LONGEST_WINDOW_SECONDS 定死，不让调用方自己传：
 * 评论、登录、浏览量共用这一张表，谁按自己的窗口清，谁就会顺手删掉
 * 别人还没到期的桶。评论那边原来传的是一小时，于是每收到一条评论，
 * 浏览量「24 小时只算一次」就退化成「一小时只算一次」。
 */
export const sweep = (db: D1Database) =>
  db
    .prepare(`DELETE FROM rate_limits WHERE window_start < ?1`)
    .bind(
      dayjs()
        .tz(SITE_TIMEZONE)
        .subtract(LONGEST_WINDOW_SECONDS, "second")
        .format(DB_DATETIME_FORMAT)
    )
    .run();

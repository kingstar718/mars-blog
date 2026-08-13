import dayjs from "dayjs";
import type { D1Database } from "@cloudflare/workers-types";
import { now, SITE_TIMEZONE, DB_DATETIME_FORMAT } from "./datetime";

/**
 * 固定窗口限流。D1 原子 UPSERT，窗口过期自动重置。
 */

/** IP 加盐哈希。限流只需要区分「是不是同一个人」，不需要知道是谁 */
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

/** 最长的窗口，即浏览量去重用的 24 小时 */
export const LONGEST_WINDOW_SECONDS = 24 * 60 * 60;

/** 顺带清掉过期的桶（写入路径上做，表才不会只增不减） */
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

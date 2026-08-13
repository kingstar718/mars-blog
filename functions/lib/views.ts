import type { D1Database } from "@cloudflare/workers-types";

/** 浏览量自增，按路径计数。必须是这一句 UPSERT，不能拆成读 + 写 */
export const bumpPageView = (db: D1Database, path: string) =>
  db
    .prepare(
      `INSERT INTO page_views (path, count) VALUES (?1, 1)
       ON CONFLICT (path) DO UPDATE SET count = count + 1
       RETURNING count`
    )
    .bind(path)
    .first<{ count: number }>();

/** 只读当前浏览量 */
export const getPageView = (db: D1Database, path: string) =>
  db
    .prepare(`SELECT count FROM page_views WHERE path = ?1`)
    .bind(path)
    .first<{ count: number }>();

import type { APIRoute } from "astro";
import { db } from "@/lib/env";
import { renderEntryBody } from "@/lib/entries";
import type { EntryRow } from "@/lib/db";

/**
 * 重新渲染所有已发布内容的 body_html。
 *
 * 迁移导入的行没有 body_html（渲染要用 Workers 上的 shiki，导入脚本跑不了），
 * 导完调一次这里补齐。改了渲染链之后也用它统一刷新，
 * 否则老内容会一直停在旧的 HTML 上。
 */
export const POST: APIRoute = async () => {
  const database = db();
  const { results } = await database
    .prepare(`SELECT * FROM entries WHERE status = 'published'`)
    .all<EntryRow>();

  let done = 0;
  for (const row of results) {
    const html = await renderEntryBody(database, row.body);
    await database
      .prepare(`UPDATE entries SET body_html = ?2 WHERE id = ?1`)
      .bind(row.id, html)
      .run();
    done += 1;
  }

  return Response.json({ ok: true, rendered: done });
};

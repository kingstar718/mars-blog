import type { EntryRow } from "./db";

/**
 * 站内搜索：直接 LIKE 扫表。
 *
 * 没用 SQLite 的 FTS5，试过了不划算：
 *   - 默认的 unicode61 分词器按空白切词，中文一整句会变成一个 token，搜不动；
 *   - 换成 trigram 分词器能做中文子串匹配，但它要求查询至少三个字符，
 *     「字体」「排版」「短文」这类两字词全部搜不到——而这是中文最常用的构词单位。
 *
 * 本站内容以几十到几百篇计，全表 LIKE 在 D1 上是毫秒级，而且任意长度的
 * 子串都能精确命中。等哪天真的到了几千篇再考虑上索引。
 */

/** LIKE 的通配符要转义，否则用户搜 "100%" 会变成匹配任意串 */
const escapeLike = (value: string) =>
  value.replace(/[\\%_]/g, character => `\\${character}`);

export const searchEntries = (db: D1Database, query: string, limit = 30) => {
  const pattern = `%${escapeLike(query)}%`;
  return db
    .prepare(
      `SELECT * FROM entries
       WHERE status = 'published'
         AND (title LIKE ?1 ESCAPE '\\'
           OR description LIKE ?1 ESCAPE '\\'
           OR body LIKE ?1 ESCAPE '\\')
       ORDER BY pub_datetime DESC
       LIMIT ?2`
    )
    .bind(pattern, limit)
    .all<EntryRow>();
};

/** 命中处前后各截一段，给搜索结果做上下文 */
export const excerpt = (body: string, query: string, radius = 40) => {
  const at = body.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return body.slice(0, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(body.length, at + query.length + radius);
  return `${start > 0 ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
};

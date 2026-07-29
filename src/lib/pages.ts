import { now } from "./datetime";

export interface PageRow {
  slug: string;
  title: string;
  body: string;
  body_html: string | null;
  updated_at: string;
}

export const getPage = (db: D1Database, slug: string) =>
  db.prepare(`SELECT * FROM pages WHERE slug = ?1`).bind(slug).first<PageRow>();

export const listPages = (db: D1Database) =>
  db.prepare(`SELECT * FROM pages ORDER BY slug`).all<PageRow>();

export const savePage = (
  db: D1Database,
  slug: string,
  title: string,
  body: string,
  html: string
) =>
  db
    .prepare(
      `UPDATE pages SET title = ?2, body = ?3, body_html = ?4, updated_at = ?5
       WHERE slug = ?1`
    )
    .bind(slug, title, body, html, now())
    .run();

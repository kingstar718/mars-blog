import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openDatabase, migrate } from "@/lib/sqlite";
import { DatabaseSync } from "node:sqlite";

const latestMigration = Math.max(
  ...readdirSync(fileURLToPath(new URL("../migrations", import.meta.url)))
    .filter(name => name.endsWith(".sql"))
    .map(name => Number(name.split("_")[0]))
);

/**
 * SQLite 兼容层的冒烟测试：打开 :memory: 会把 migrations/ 全量建一遍，
 * 然后按 D1 的形状（prepare/bind/all/first/run）读写。
 */
describe("sqlite 兼容层", () => {
  it("自动应用迁移，并按 D1 形状读写", async () => {
    const db = openDatabase(":memory:");

    const { results } = await db
      .prepare(`SELECT COUNT(*) AS n FROM entries`)
      .all<{ n: number }>();
    assert.equal(results[0].n, 0);

    // pages 迁移里带初始数据（0004 的 INSERT）
    const page = await db
      .prepare(`SELECT slug FROM pages`)
      .first<{ slug: string }>();
    assert.equal(page?.slug, "about");

    const inserted = await db
      .prepare(
        `INSERT INTO entries (kind, title, body, pub_datetime, status, created_at, updated_at)
         VALUES ('note', NULL, 'hi', '2026-08-12 00:00:00', 'published',
                 '2026-08-12 00:00:00', '2026-08-12 00:00:00')
         RETURNING id`
      )
      .first<{ id: number }>();
    assert.ok(inserted && inserted.id >= 1);

    const row = await db
      .prepare(`SELECT body FROM entries WHERE id = ?1`)
      .bind(inserted.id)
      .first<{ body: string }>();
    assert.equal(row?.body, "hi");

    const run = await db
      .prepare(`UPDATE entries SET body = ?1 WHERE id = ?2`)
      .bind("yo", inserted.id)
      .run();
    assert.equal(run.success, true);
    assert.equal(run.meta.changes, 1);
  });

  it("user_version 记账，重复打开不会重跑迁移", async () => {
    const sqlite = new DatabaseSync(":memory:");
    migrate(sqlite);
    migrate(sqlite); // 第二次执行不该再碰任何表

    const version = (
      sqlite.prepare("PRAGMA user_version").get() as {
        user_version: number;
      }
    ).user_version;
    assert.equal(version, latestMigration);
  });
});

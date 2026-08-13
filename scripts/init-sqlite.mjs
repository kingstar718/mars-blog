#!/usr/bin/env node
// 初始化本地 SQLite：打开数据库会按 migrations/ 自动建表（见 src/lib/sqlite.ts）。
// 默认库文件 .data/mars.db，可用环境变量 MARS_DB_FILE 改。
import { openDatabase } from "../src/lib/sqlite.ts";

const main = async () => {
  const file = process.env.MARS_DB_FILE ?? ".data/mars.db";
  const db = openDatabase(file);

  const tables = await db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
    )
    .all();
  const version = await db.prepare("PRAGMA user_version").first();

  console.log(
    `SQLite 就绪: ${file}（schema 版本 ${version?.user_version ?? 0}）`
  );
  console.log(`表: ${tables.results.map(row => row.name).join(", ")}`);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});

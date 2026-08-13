#!/usr/bin/env node
// 把 wrangler d1 export 出来的 SQL 导入本地 SQLite（一次性迁移）。
//
// 用法：
//   1. 先从 D1 导出（wrangler 认证：wrangler login，或设置
//      CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID）：
//        npx wrangler@4.115.0 d1 export mars-blog --remote --no-schema --output d1-data.sql
//   2. 导入：
//        node scripts/import-d1.mjs d1-data.sql
//       （默认库 .data/mars.db，可用 --db=<路径> 或环境变量 MARS_DB_FILE 改）
//
// 这是把 D1 当唯一真相源的一次性动作：脚本会先清空本地六个数据表再写入，
// 本地已有内容（包括迁移种子里的 about 页）会被 D1 的数据覆盖。
// 图片二进制不在 SQL 里：backup/media/ 存在则按 uid/尺寸.扩展名拷进
// .data/media/，否则需要自行从 R2 或旧站下载。
import { existsSync, mkdirSync, cpSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../src/lib/sqlite.ts";

const args = process.argv.slice(2);
const dumpFile = args.find(arg => !arg.startsWith("--"));
const dbFile =
  args.find(arg => arg.startsWith("--db="))?.slice(5) ??
  process.env.MARS_DB_FILE ??
  ".data/mars.db";
const mediaFrom =
  args.find(arg => arg.startsWith("--media-from="))?.slice(13) ??
  "backup/media";

if (!dumpFile) {
  console.error("用法: node scripts/import-d1.mjs d1-data.sql [--db=<库文件>]");
  process.exit(1);
}
if (!existsSync(dumpFile)) {
  console.error(`找不到导出文件：${dumpFile}`);
  process.exit(1);
}

mkdirSync(dirname(dbFile), { recursive: true });
const sqlite = new DatabaseSync(dbFile);
sqlite.exec("PRAGMA journal_mode = WAL");
migrate(sqlite);

// 先清后导。外键安全的顺序：先子后父
const DATA_TABLES = [
  "comments",
  "images",
  "page_views",
  "rate_limits",
  "entries",
  "pages",
];
for (const table of DATA_TABLES) {
  sqlite.exec(`DELETE FROM ${table}`);
}
console.log(
  "已清空本地数据表：comments / images / page_views / rate_limits / entries / pages"
);

sqlite.exec("PRAGMA foreign_keys = OFF");
try {
  sqlite.exec(readFileSync(dumpFile, "utf8"));
} finally {
  sqlite.exec("PRAGMA foreign_keys = ON");
}

// 显式 id 导入后把自增序列拨到最大值，避免下次插入撞 id
for (const table of ["entries", "comments", "images"]) {
  try {
    sqlite.exec(
      `UPDATE sqlite_sequence SET seq = (SELECT COALESCE(MAX(id), 0) FROM ${table}) WHERE name = '${table}'`
    );
  } catch {
    // 表从未插入过时 sqlite_sequence 没有对应行，跳过即可
  }
}

const counts = {};
for (const table of [...DATA_TABLES, "s3_config"]) {
  try {
    counts[table] = sqlite
      .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
      .get().n;
  } catch {
    counts[table] = "-";
  }
}
console.log("导入后行数：", JSON.stringify(counts, null, 2));

const mediaDir = process.env.MARS_MEDIA_DIR ?? ".data/media";
if (existsSync(mediaFrom)) {
  cpSync(mediaFrom, mediaDir, { recursive: true });
  console.log(`已把 ${mediaFrom} 拷进 ${mediaDir}（图片二进制）`);
} else {
  console.log(
    `未找到 ${mediaFrom}——图片二进制需要另行下载到 ${mediaDir}（按 <uid>/<宽度>.<扩展名>）`
  );
}

console.log(
  "完成。打开 /login 设置口令即可使用；确认无误后旧站（D1/R2/workers.dev）再下线。"
);

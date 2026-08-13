/**
 * 自部署（Node）模式下的数据库层。
 *
 * 把 node:sqlite 包成 D1 的形状（prepare / bind / all / first / run），
 * 业务代码不需要知道自己在跑哪个后端——SQL 完全一样，D1 底层本来
 * 就是 SQLite，测试里也早就这么干过（见 test/ratelimit.test.ts）。
 *
 * 打开时自动按 migrations/ 的顺序建表，用 PRAGMA user_version 记账，
 * 效果等价于 wrangler d1 migrations apply。
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * 迁移文件目录。
 *
 * 打包后 entry 在 dist/server/ 里，import.meta.url 相对路径会指错地方，
 * 所以统一按工作目录解析：开发、测试、systemd 部署都在项目根目录跑，
 * 用环境变量 MARS_MIGRATIONS_DIR 可以覆盖。
 */
const MIGRATIONS_DIR =
  process.env.MARS_MIGRATIONS_DIR ?? join(process.cwd(), "migrations");

interface D1RunResult {
  success: boolean;
  meta: {
    changes: number;
    last_row_id: number;
  };
}

const toD1RunResult = (result: {
  changes: number;
  lastInsertRowid: number | bigint;
}): D1RunResult => ({
  success: true,
  meta: {
    changes: result.changes,
    last_row_id: Number(result.lastInsertRowid),
  },
});

/**
 * 一条 D1 形状的语句。D1 的 prepare() 本身就能直接 .all()/.first()/.run()，
 * bind() 只是再带上一组参数，所以这里每次 bind 都返回同一个形状的新对象。
 */
const d1Statement = (
  sqlite: DatabaseSync,
  sql: string,
  params: unknown[] = []
) => {
  // node:sqlite 不接收 boolean，D1 接收；顺手归一化成 0/1
  const normalized = params.map(param =>
    typeof param === "boolean" ? (param ? 1 : 0) : param
  );
  return {
    bind: (...next: unknown[]) => d1Statement(sqlite, sql, next),
    all: async <T>() => ({
      results: sqlite.prepare(sql).all(...normalized) as T[],
    }),
    first: async <T>() =>
      (sqlite.prepare(sql).get(...normalized) as T | undefined) ?? null,
    run: async () => toD1RunResult(sqlite.prepare(sql).run(...normalized)),
  };
};

/** 把 migrations/ 里还没跑过的迁移按顺序执行，写进 user_version */
export const migrate = (sqlite: DatabaseSync) => {
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter(name => name.endsWith(".sql"))
    .sort();
  const current = (
    sqlite.prepare("PRAGMA user_version").get() as { user_version: number }
  ).user_version;

  sqlite.exec("BEGIN");
  try {
    for (const name of migrations) {
      const version = Number(name.split("_")[0]);
      if (version <= current) continue;
      sqlite.exec(readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
      sqlite.exec(`PRAGMA user_version = ${version}`);
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
};

/**
 * 打开一个 SQLite 库并自动建表。
 *
 * 默认落在 .data/mars.db（可用环境变量 MARS_DB_FILE 改），
 * 传 ":memory:" 给测试用。返回的形状对齐 D1Database。
 */
export const openDatabase = (
  file = process.env.MARS_DB_FILE ?? ".data/mars.db"
): D1Database => {
  if (file !== ":memory:") {
    mkdirSync(dirname(file), { recursive: true });
  }
  const sqlite = new DatabaseSync(file);
  if (file !== ":memory:") sqlite.exec("PRAGMA journal_mode = WAL");
  migrate(sqlite);
  return {
    prepare: (sql: string) => d1Statement(sqlite, sql),
  } as unknown as D1Database;
};

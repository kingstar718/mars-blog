import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { clientKey, hit, sweep } from "@/lib/ratelimit";

/**
 * D1 底层就是 SQLite，node:sqlite 是同一个引擎。
 * 把它的 prepare/get 包成 D1 那个形状，hit/sweep 里的 SQL 原样执行——
 * 测的是真 SQL，不是照着实现抄一份的 mock。
 */
const d1 = (sqlite: DatabaseSync) => {
  const prepare = (sql: string) => {
    const statement = sqlite.prepare(sql);
    return {
      bind: (...params: unknown[]) => ({
        first: async () => statement.get(...params) ?? null,
        run: async () => statement.run(...params),
      }),
    };
  };
  return { prepare } as unknown as Parameters<typeof hit>[0];
};

const newDb = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    `CREATE TABLE rate_limits (
       key          TEXT    PRIMARY KEY,
       count        INTEGER NOT NULL,
       window_start TEXT    NOT NULL
     );
     CREATE INDEX idx_rate_limits_window ON rate_limits (window_start);`
  );
  return sqlite;
};

describe("hit：固定窗口计数", () => {
  it("窗口内递增，超过配额被拦", async () => {
    const db = d1(newDb());
    for (let i = 1; i <= 5; i += 1) {
      assert.equal((await hit(db, "k", 5, 600)).allowed, true);
    }
    const sixth = await hit(db, "k", 5, 600);
    assert.equal(sixth.allowed, false);
    assert.equal(sixth.count, 6);
  });

  it("窗口过期后计数重置回 1", async () => {
    const sqlite = newDb();
    const db = d1(sqlite);
    for (let i = 0; i < 6; i += 1) await hit(db, "k", 5, 600);
    assert.equal((await hit(db, "k", 5, 600)).allowed, false);
    // 把窗口起点拨到很久以前，模拟窗口过期
    sqlite
      .prepare(
        `UPDATE rate_limits SET window_start = '2000-01-01 00:00:00' WHERE key = 'k'`
      )
      .run();
    const reset = await hit(db, "k", 5, 600);
    assert.equal(reset.allowed, true);
    assert.equal(reset.count, 1);
  });

  it("不同 key 互不影响", async () => {
    const db = d1(newDb());
    await hit(db, "a", 1, 600);
    const b = await hit(db, "b", 1, 600);
    assert.equal(b.allowed, true);
    assert.equal(b.count, 1);
  });
});

describe("clientKey", () => {
  it("同输入同 key，不同输入不同 key", async () => {
    const secret = "s";
    assert.equal(
      await clientKey("login", "1.2.3.4", secret),
      await clientKey("login", "1.2.3.4", secret)
    );
    assert.notEqual(
      await clientKey("login", "1.2.3.4", secret),
      await clientKey("comment", "1.2.3.4", secret)
    );
    assert.notEqual(
      await clientKey("login", "1.2.3.4", secret),
      await clientKey("login", "5.6.7.8", secret)
    );
  });
});

describe("sweep", () => {
  it("只删过期的桶，留下没过期的", async () => {
    const sqlite = newDb();
    const db = d1(sqlite);
    await db
      .prepare(
        `INSERT INTO rate_limits (key, count, window_start) VALUES ('stale', 3, '2000-01-01 00:00:00')`
      )
      .bind()
      .run();
    await db
      .prepare(
        `INSERT INTO rate_limits (key, count, window_start) VALUES ('fresh', 1, '2099-01-01 00:00:00')`
      )
      .bind()
      .run();
    await sweep(db);
    const rows = sqlite
      .prepare(`SELECT key FROM rate_limits ORDER BY key`)
      .all();
    assert.deepEqual(
      rows.map(row => row.key),
      ["fresh"]
    );
  });
});

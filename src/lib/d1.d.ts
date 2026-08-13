/**
 * 数据库访问类型的自部署声明。
 *
 * 原来由 Cloudflare 的 workers-types 提供（D1Database），v2 换成
 * SQLite 后不再依赖那套类型。业务代码里到处用的 D1Database 其实
 * 只有 prepare/bind/all/first/run 这几个成员（见 src/lib/sqlite.ts
 * 的实现），这里声明等价形状，业务代码一行不用改。
 */

interface D1PreparedStatement {
  bind(...params: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{
    success: boolean;
    meta: {
      changes: number;
      last_row_id: number;
    };
  }>;
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

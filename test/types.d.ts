/**
 * Node 内置测试 / 断言 / SQLite 模块的类型声明。
 *
 * 这个仓库没有 @types/node 依赖，而测试跑在 Node 的 node:test 上
 * （不用 vitest：给几个纯函数补最小单测，不值得为它拉一整套依赖）。
 * 这里只声明测试实际用到的 API，够用即可，不是 @types/node 的替代品。
 * tsc 的 include 覆盖 test/，声明缺失会让 astro check 直接报错。
 * 哪天加了 @types/node，这份声明会和它冲突，届时删掉即可。
 */

declare module "node:test" {
  type TestFn = () => void | Promise<void>;
  export function describe(name: string, fn: TestFn): void;
  export function it(name: string, fn: TestFn): void;
}

declare module "node:assert/strict" {
  interface Assert {
    equal<T>(actual: T, expected: T, message?: string): void;
    notEqual<T>(actual: T, expected: T, message?: string): void;
    deepEqual<T>(actual: T, expected: T, message?: string): void;
    ok(value: unknown, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}

declare module "node:sqlite" {
  export interface StatementSync {
    run(...params: unknown[]): {
      changes: number;
      lastInsertRowid: number | bigint;
    };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }
  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}

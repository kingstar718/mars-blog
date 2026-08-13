import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "@/lib/sqlite";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  ensureSessionSecret,
  getPasswordHash,
  setPasswordHash,
} from "@/lib/settings";

/**
 * 数据库为准的凭证管理：
 * hashPassword 生成的口令哈希能被 verifyPassword 校验，
 * 会话密钥落库后保持不变，口令哈希可读写。
 */
describe("口令哈希", () => {
  it("生成后能校验，错口令过不去", async () => {
    const hash = await hashPassword("a-very-long-dev-password");
    assert.match(hash, /^pbkdf2\$\d+\$.+\$.+$/);
    assert.equal(await verifyPassword("a-very-long-dev-password", hash), true);
    assert.equal(await verifyPassword("wrong-password", hash), false);
  });

  it("每次生成盐不同，哈希串不同", async () => {
    const a = await hashPassword("same-password-123456");
    const b = await hashPassword("same-password-123456");
    assert.notEqual(a, b);
  });
});

describe("settings 表", () => {
  it("口令哈希写入后能读回", async () => {
    const db = openDatabase(":memory:");
    assert.equal(await getPasswordHash(db), null);
    await setPasswordHash(db, "pbkdf2$100000$salt$hash");
    assert.equal(await getPasswordHash(db), "pbkdf2$100000$salt$hash");
  });

  it("会话密钥不存在时生成并落库，重复调用不变", async () => {
    const db = openDatabase(":memory:");
    const first = await ensureSessionSecret(db);
    const second = await ensureSessionSecret(db);
    assert.equal(first, second);
    assert.ok(first.length >= 32);
  });
});

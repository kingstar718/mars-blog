import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeNext, signSession, verifySession } from "@/lib/session";

const SECRET = "test-secret";

describe("safeNext", () => {
  it("没有 next 时回首页", () => {
    assert.equal(safeNext(null), "/");
    assert.equal(safeNext(undefined), "/");
    assert.equal(safeNext(""), "/");
  });

  it("放行站内路径", () => {
    assert.equal(safeNext("/posts/12"), "/posts/12");
    assert.equal(safeNext("/login?next=/posts"), "/login?next=/posts");
  });

  it("拦下 //evil.com 这类协议相对地址", () => {
    assert.equal(safeNext("//evil.com"), "/");
    assert.equal(safeNext("//evil.com/steal"), "/");
  });

  it("拦下绝对 URL 和其他花活", () => {
    assert.equal(safeNext("https://evil.com"), "/");
    assert.equal(safeNext("javascript:alert(1)"), "/");
    assert.equal(safeNext(" /posts"), "/");
  });
});

describe("会话签名", () => {
  it("签发后能验签", async () => {
    const token = await signSession(
      { exp: Math.floor(Date.now() / 1000) + 3600 },
      SECRET
    );
    assert.ok(await verifySession(token, SECRET));
  });

  it("载荷被改过就验不过", async () => {
    const token = await signSession(
      { exp: Math.floor(Date.now() / 1000) + 3600 },
      SECRET
    );
    const [body, mac] = token.split(".");
    assert.equal(
      await verifySession(`${body.slice(0, -2)}xx.${mac}`, SECRET),
      null
    );
  });

  it("签名被改过就验不过", async () => {
    const token = await signSession(
      { exp: Math.floor(Date.now() / 1000) + 3600 },
      SECRET
    );
    const [body, mac] = token.split(".");
    assert.equal(
      await verifySession(`${body}.${mac.slice(0, -1)}y`, SECRET),
      null
    );
  });

  it("过期的会话验不过", async () => {
    const token = await signSession(
      { exp: Math.floor(Date.now() / 1000) - 10 },
      SECRET
    );
    assert.equal(await verifySession(token, SECRET), null);
  });

  it("密钥不对就验不过", async () => {
    const token = await signSession(
      { exp: Math.floor(Date.now() / 1000) + 3600 },
      SECRET
    );
    assert.equal(await verifySession(token, "another-secret"), null);
  });

  it("垃圾输入返回 null", async () => {
    assert.equal(await verifySession("", SECRET), null);
    assert.equal(await verifySession("abc", SECRET), null);
    assert.equal(await verifySession("a.b.c", SECRET), null);
  });
});

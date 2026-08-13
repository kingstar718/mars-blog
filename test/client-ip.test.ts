import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientIP } from "@/lib/client-ip";

const req = (headers: Record<string, string>) =>
  new Request("http://localhost/", { headers });

describe("clientIP", () => {
  it("取 X-Forwarded-For 的第一个地址", () => {
    assert.equal(
      clientIP(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })),
      "1.2.3.4"
    );
  });

  it("没有 X-Forwarded-For 时退回 X-Real-IP", () => {
    assert.equal(clientIP(req({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
  });

  it("都没有时返回 unknown", () => {
    assert.equal(clientIP(req({})), "unknown");
  });
});

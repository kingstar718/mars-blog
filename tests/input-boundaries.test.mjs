import assert from "node:assert/strict";
import test from "node:test";

const { isSafeContentKey, utf8ByteLength } =
  await import("../functions/lib/input.ts");

test("markdown size uses UTF-8 byte length", () => {
  assert.equal(utf8ByteLength("a"), 1);
  assert.equal(utf8ByteLength("中"), 3);
});

test("content key only allows safe markdown paths", () => {
  assert.equal(isSafeContentKey("posts/hello.md"), true);
  assert.equal(isSafeContentKey("notes/中文.md"), true);
  assert.equal(isSafeContentKey("pages/about.md"), true);
  assert.equal(isSafeContentKey("uploads/hello.md"), false);
  assert.equal(isSafeContentKey("posts/../secret.md"), false);
  assert.equal(isSafeContentKey("posts/a//b.md"), false);
  assert.equal(isSafeContentKey("posts/a.txt"), false);
});

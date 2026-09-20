import assert from "node:assert/strict";
import test from "node:test";

const { triggerDeploy } = await import("../functions/lib/content.ts");

test("deploy hook reports a successful trigger", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  try {
    assert.equal(
      await triggerDeploy({ DEPLOY_HOOK_URL: "https://example.test/hook" }),
      true
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("deploy hook reports a failed trigger", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 503 });
  try {
    assert.equal(
      await triggerDeploy({ DEPLOY_HOOK_URL: "https://example.test/hook" }),
      false
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

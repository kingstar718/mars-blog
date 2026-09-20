import assert from "node:assert/strict";
import test from "node:test";

const { deriveSessionSecret, signSession, verifySession } =
  await import("../functions/lib/session-crypto.ts");

test("session token verifies with the derived secret", async () => {
  const secret = await deriveSessionSecret("correct-password");
  const exp = Math.floor(Date.now() / 1000) + 60;
  const token = await signSession({ exp }, secret);
  assert.deepEqual(await verifySession(token, secret), { exp });
});

test("session token rejects tampering and expiry", async () => {
  const secret = await deriveSessionSecret("correct-password");
  const token = await signSession(
    { exp: Math.floor(Date.now() / 1000) - 1 },
    secret
  );
  assert.equal(await verifySession(token, secret), null);

  const validToken = await signSession(
    { exp: Math.floor(Date.now() / 1000) + 60 },
    secret
  );
  const [body, mac] = validToken.split(".");
  const tampered = `${body}x.${mac}`;
  assert.equal(await verifySession(tampered, secret), null);
});

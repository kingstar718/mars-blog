/**
 * 站长口令的校验。
 *
 * 只有一个人能登录，所以不存用户表，口令的哈希放在 Workers secret 里。
 * 存哈希而不是明文：Workers 的 secret 泄露基本等于全站沦陷，这一层
 * 挡不住那种情况——它挡的是另一件事，你可能在别处复用过这个口令，
 * 明文躺在控制台里，谁看得到那个面板谁就拿到了它。
 *
 * PBKDF2-SHA256：WebCrypto 原生支持，Workers 上不用带任何依赖。
 * 迭代次数写进哈希串里，以后调高不影响已经存下来的那一份。
 *
 * 哈希串格式：pbkdf2$<迭代次数>$<盐 base64>$<派生值 base64>
 * 用 scripts/hash-password.mjs 生成。
 */

const KEY_LENGTH_BITS = 256;

// 显式给 ArrayBuffer：Uint8Array 的默认类型参数是 ArrayBufferLike，
// 而 WebCrypto 的 BufferSource 不接受可能是 SharedArrayBuffer 的那一种
const decodeBase64 = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(value), char => char.charCodeAt(0));

const derive = async (
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    KEY_LENGTH_BITS
  );
  return new Uint8Array(bits);
};

/** 逐字节比较，耗时与「前几位对不对」无关 */
const constantTimeEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
};

export const verifyPassword = async (password: string, stored: string) => {
  // secret 没配好时不要抛异常：登录页会变成 500，而 500 比「口令不对」
  // 泄露更多信息——它等于告诉对方这台机器上没设口令
  if (!stored) return false;
  const [scheme, iterations, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !expected) return false;

  const actual = await derive(password, decodeBase64(salt), Number(iterations));
  return constantTimeEqual(actual, decodeBase64(expected));
};

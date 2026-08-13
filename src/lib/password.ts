/**
 * 站长口令的校验。
 *
 * 只有一个人能登录，所以不存用户表，口令的哈希放在 Workers secret 里。
 * 存哈希而不是明文：Workers 的 secret 泄露基本等于全站沦陷，这一层
 * 挡不住那种情况——它挡的是另一件事，你可能在别处复用过这个口令，
 * 明文躺在控制台里，谁看得到那个面板谁就拿到了它。
 *
 * PBKDF2-SHA256：WebCrypto 原生支持，Workers 上不用带任何依赖。
 * 迭代次数写进哈希串里，以后调整不影响已经存下来的那一份——但注意
 * Workers 的上限是 100000，超过会抛 NotSupportedError（本地不拦，线上才炸）。
 *
 * 哈希串格式：pbkdf2$<迭代次数>$<盐 base64>$<派生值 base64>
 * 首次登录时用 hashPassword 生成（见 src/pages/api/auth/setup.ts），
 * 服务器端重置用 scripts/reset-password.mjs。
 */

const KEY_LENGTH_BITS = 256;
const ITERATIONS = 100_000;
const SALT_BYTES = 16;

// 显式给 ArrayBuffer：Uint8Array 的默认类型参数是 ArrayBufferLike，
// 而 WebCrypto 的 BufferSource 不接受可能是 SharedArrayBuffer 的那一种
const decodeBase64 = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(value), char => char.charCodeAt(0));

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/** 生成口令哈希，格式和 scripts/hash-password.mjs 一致 */
export const hashPassword = async (password: string) => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    KEY_LENGTH_BITS
  );
  return `pbkdf2$${ITERATIONS}$${encodeBase64(salt)}$${encodeBase64(
    new Uint8Array(bits)
  )}`;
};

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

  try {
    const actual = await derive(
      password,
      decodeBase64(salt),
      Number(iterations)
    );
    return constantTimeEqual(actual, decodeBase64(expected));
  } catch (error) {
    // 哈希串本身有问题（比如迭代次数超过 Workers 的上限）时，
    // 对外仍然只是「口令不对」，但日志里要说清楚——否则线上只剩一个
    // 500 或者一句"口令不对"，没人知道是 secret 配错了
    console.error("口令校验失败，检查 settings.password_hash：", error);
    return false;
  }
};

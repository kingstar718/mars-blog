#!/usr/bin/env node
/**
 * 生成 ADMIN_PASSWORD_HASH。
 *
 *   node scripts/hash-password.mjs
 *
 * 口令从标准输入读，不走命令行参数——参数会留在 shell 历史里。
 * 输出的那一串填进 `wrangler secret put ADMIN_PASSWORD_HASH`，
 * 本地开发则写进 .dev.vars（那个文件已经在 .gitignore 里）。
 *
 * 校验端在 src/lib/password.ts，两边都是 PBKDF2-SHA256，格式必须一致：
 * pbkdf2$<迭代次数>$<盐 base64>$<派生值 base64>
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

// Workers 的 WebCrypto 把 PBKDF2 的迭代次数硬限制在 100000，再高会直接
// 抛 NotSupportedError（本地 miniflare 不拦，所以只会在线上炸）。
// OWASP 建议的 600k 在这里做不到；对一个单用户站点，真正拦人的是
// 「同 IP 十分钟五次」的限流加二十位随机口令，这个上限够用。
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

const ask = question =>
  new Promise(resolve => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });

const password = (await ask("口令（输入后回车，注意别贴到别处）：")).trim();
if (password.length < 12) {
  console.error(
    "太短了。这是全站唯一的门，用密码管理器生成 20 位以上的随机串。"
  );
  process.exit(1);
}

const salt = randomBytes(SALT_BYTES);
const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_BYTES, "sha256");

console.log("\nADMIN_PASSWORD_HASH=");
console.log(
  `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`
);

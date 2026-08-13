#!/usr/bin/env node
/**
 * 生成口令哈希串。
 *
 *   node scripts/hash-password.mjs
 *
 * 口令从标准输入读，不走命令行参数——参数会留在 shell 历史里。
 * v2 起口令存数据库（settings 表，首次登录设置），正常流程用不到这个脚本。
 * 保留它两个用途：确认哈希格式、或在服务器端手工构造哈希串。
 *
 * 校验端在 src/lib/password.ts，两边都是 PBKDF2-SHA256，格式必须一致：
 * pbkdf2$<迭代次数>$<盐 base64>$<派生值 base64>
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

// 迭代次数固定 100000：哈希串自带迭代次数，改默认值不影响已有口令。
// 对一个单用户站点，真正拦人的是「同 IP 十分钟五次」的限流加
// 二十位随机口令，这个数够用。src/lib/password.ts 的 hashPassword
// 用的是同一套参数。
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

console.log("\npassword_hash =");
console.log(
  `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`
);

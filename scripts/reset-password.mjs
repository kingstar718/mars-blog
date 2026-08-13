#!/usr/bin/env node
// 服务器端重置口令：把新哈希直接写进 SQLite 的 settings 表。
//
//   node scripts/reset-password.mjs [数据库文件]
//
// 什么时候用：忘记口令，或"首次设置"窗口被抢注。这是数据库为准时代
// 唯一的后门，等价于以前"改环境变量重启"——需要在服务器上执行。
import { createInterface } from "node:readline";
import { openDatabase } from "../src/lib/sqlite.ts";
import { hashPassword } from "../src/lib/password.ts";
import { setPasswordHash } from "../src/lib/settings.ts";

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

const main = async () => {
  const file = process.argv[2] ?? process.env.MARS_DB_FILE ?? ".data/mars.db";
  const password = (await ask("新口令（至少 12 位，输入后回车）：")).trim();
  if (password.length < 12) {
    console.error(
      "太短了。这是全站唯一的门，用密码管理器生成 20 位以上的随机串。"
    );
    process.exit(1);
  }
  const confirm = (await ask("再输一遍：")).trim();
  if (password !== confirm) {
    console.error("两次输入不一致。");
    process.exit(1);
  }

  const db = openDatabase(file);
  await setPasswordHash(db, await hashPassword(password));
  console.log(`已写入 ${file} 的 settings.password_hash，用新口令登录即可。`);
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});

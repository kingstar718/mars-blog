// 让 node:test 直接跑 TS 源码的零依赖 loader 入口。
//
// Node ≥ 22.18 自带 TS 类型剥离，hooks.mjs 只解决 Node 默认不做两件事：
//   1. @/lib/... 路径别名 -> src/lib/...
//   2. 源码里的无扩展名相对导入（./datetime）-> 补上 .ts
//
// 用法见 package.json 的 test 脚本：node --import ./test/resolver.mjs --test test/
import { register } from "node:module";

register(new URL("./hooks.mjs", import.meta.url).href, import.meta.url);

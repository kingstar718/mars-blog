/**
 * 本地磁盘存储，形状与 S3 后端一致（见 src/lib/media-s3.ts）。
 *
 * 业务代码只依赖 get/put 两个方法；部署时可以让 Nginx 直接 alias
 * 这个目录出图，Node 只负责写入。
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import type { MediaBucket } from "./media-s3";

export const localBucket = (dir: string): MediaBucket => {
  const root = resolve(dir);

  // key 由服务端拼（uid/宽度.扩展名），但多一道校验不亏：
  // 路径逃逸一旦发生，坏的就是整台服务器的文件
  const target = (key: string) => {
    const path = resolve(root, key);
    if (path !== root && !path.startsWith(root + sep)) {
      throw new Error(`非法图片 key: ${key}`);
    }
    return path;
  };

  return {
    async get(key: string) {
      const path = target(key);
      try {
        const bytes = await readFile(path);
        return { body: new Blob([bytes]).stream() };
      } catch {
        return null;
      }
    },
    async put(key: string, value: ArrayBuffer, _options?: unknown) {
      const path = target(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, new Uint8Array(value));
      const { size } = await stat(path);
      return { key, size };
    },
  };
};

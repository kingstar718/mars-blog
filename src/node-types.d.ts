/**
 * 自部署（Node）模式用到的 Node 内置模块的最小类型声明。
 *
 * 仓库没有 @types/node（原因见 test/types.d.ts），这里只声明
 * src/ 里实际用到的几个 API，够用即可；哪天引入 @types/node，
 * 这份声明会和它冲突，届时删掉。
 */

declare module "node:fs" {
  export function mkdirSync(
    path: string,
    options?: { recursive?: boolean }
  ): void;
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: "utf8"): string;
}

declare module "node:fs/promises" {
  export function mkdir(
    path: string,
    options?: { recursive?: boolean }
  ): Promise<void>;
  export function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  export function writeFile(path: string, data: Uint8Array): Promise<void>;
  export function stat(path: string): Promise<{ size: number }>;
}

declare module "node:path" {
  export const sep: string;
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
  export function resolve(...parts: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: URL | string): string;
}

declare const process: {
  env: Record<string, string | undefined>;
  platform: string;
};

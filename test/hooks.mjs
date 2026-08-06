import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const projectRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const resolveFile = file => {
  for (const candidate of [file, `${file}.ts`]) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const url = resolveFile(
      resolvePath(projectRoot, "src", specifier.slice(2))
    );
    if (url) return { shortCircuit: true, url };
  } else if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const base = dirname(fileURLToPath(context.parentURL));
    const url = resolveFile(resolvePath(base, specifier));
    if (url) return { shortCircuit: true, url };
  } else if (
    !specifier.startsWith("node:") &&
    !specifier.startsWith("data:") &&
    context.parentURL?.startsWith("file:")
  ) {
    // 无扩展名的裸包子路径（如 dayjs/plugin/utc）Node ESM 默认解析不了，
    // Vite 能是因为它走 CJS 风格解析。先试默认解析，失败再退回 require.resolve；
    // ESM-only 的包（unified 等）require 会失败，正好落回默认解析。
    try {
      return await nextResolve(specifier, context);
    } catch {
      try {
        const resolved = require.resolve(specifier, {
          paths: [dirname(fileURLToPath(context.parentURL))],
        });
        return { shortCircuit: true, url: pathToFileURL(resolved).href };
      } catch {
        // 保持原始错误，不要换成 require 的报错
      }
    }
  }
  return nextResolve(specifier, context);
}

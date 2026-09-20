import type { Env } from "../env";

/** 内容桶的目录前缀 */
export const CONTENT_PREFIXES = ["posts/", "notes/", "pages/"] as const;

export const listContent = async (env: Env, prefix: string) => {
  const objects: { key: string; size: number; uploaded: Date }[] = [];
  let cursor: string | undefined;
  // R2 list 单页默认 1000 条，内容多了要翻页拿全
  do {
    const listed = await env.CONTENT.list({ prefix, cursor });
    for (const object of listed.objects) {
      objects.push({
        key: object.key,
        size: object.size,
        uploaded: object.uploaded,
      });
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return objects;
};

export const getContent = async (env: Env, key: string) => {
  const object = await env.CONTENT.get(key);
  if (!object) return null;
  return object.text();
};

export const putContent = async (env: Env, key: string, text: string) => {
  await env.CONTENT.put(key, text, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
  });
};

/** 保存后触发 Pages Deploy Hook，让静态站重新构建上线 */
export const triggerDeploy = async (env: Env): Promise<boolean> => {
  if (!env.DEPLOY_HOOK_URL) return false;
  try {
    const response = await fetch(env.DEPLOY_HOOK_URL, { method: "POST" });
    if (!response.ok) {
      console.error(`Deploy Hook failed with status ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Deploy Hook request failed", error);
    return false;
  }
};

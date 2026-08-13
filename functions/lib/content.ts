import type { Env } from "../env";

/** 内容桶的目录前缀 */
export const CONTENT_PREFIXES = ["posts/", "notes/", "pages/"] as const;

export const listContent = async (env: Env, prefix: string) => {
  const listed = await env.CONTENT.list({ prefix });
  return listed.objects.map(object => ({
    key: object.key,
    size: object.size,
    uploaded: object.uploaded,
  }));
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
export const triggerDeploy = async (env: Env) => {
  if (!env.DEPLOY_HOOK_URL) return;
  // 构建失败不该让保存接口报错：内容已在 R2，hook 可以重放
  await fetch(env.DEPLOY_HOOK_URL, { method: "POST" }).catch(() => {});
};

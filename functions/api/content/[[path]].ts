import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import {
  getContent,
  listContent,
  putContent,
  triggerDeploy,
} from "../../lib/content";
import { jsonError } from "../../lib/http";
import {
  isSafeContentKey,
  MAX_MARKDOWN_BYTES,
  utf8ByteLength,
} from "../../lib/input";
import { joinPath } from "../../lib/path";

/** GET /api/content → 列全部；GET /api/content/posts → 列某目录；GET /api/content/posts/<slug>.md → 读文件 */
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const path = joinPath(params.path);
  if (!path || ["posts", "notes", "pages"].includes(path)) {
    const prefix = path ? `${path}/` : "";
    return Response.json({ objects: await listContent(env, prefix) });
  }
  if (!isSafeContentKey(path)) return jsonError("非法路径");

  const text = await getContent(env, path);
  if (text === null) return jsonError("内容不存在", 404);
  return new Response(text, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
};

/** PUT /api/content/posts/<slug>.md → 写文件并触发构建 */
export const onRequestPut: PagesFunction<Env> = async ({
  env,
  params,
  request,
}) => {
  const path = joinPath(params.path);
  if (!path || !isSafeContentKey(path)) return jsonError("非法路径");

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MARKDOWN_BYTES) {
    return jsonError("文件太大", 413);
  }
  const text = await request.text();
  if (utf8ByteLength(text) > MAX_MARKDOWN_BYTES) {
    return jsonError("文件太大", 413);
  }

  await putContent(env, path, text);
  const deployTriggered = await triggerDeploy(env);
  return Response.json({ ok: true, deployTriggered });
};

/** DELETE /api/content/posts/<slug>.md → 删除文件并触发构建 */
export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  const path = joinPath(params.path);
  if (!path || !isSafeContentKey(path)) return jsonError("非法路径");

  await env.CONTENT.delete(path);
  const deployTriggered = await triggerDeploy(env);
  return Response.json({ ok: true, deployTriggered });
};

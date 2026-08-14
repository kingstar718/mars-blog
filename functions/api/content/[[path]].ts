import type { PagesFunction } from "@cloudflare/workers-types";
import type { Env } from "../../env";
import {
  getContent,
  listContent,
  putContent,
  triggerDeploy,
} from "../../lib/content";

const MAX_MD_BYTES = 1_000_000;

/** 只允许三个目录下的 .md，且不能有 .. 逃逸 */
const isSafeKey = (key: string) =>
  /^(posts|notes|pages)\/.+\.md$/.test(key) && !key.includes("..");

/** [[path]] 通配在 Pages 运行时是数组，例如 /posts/a.md → ["posts", "a.md"] */
const joinPath = (segments: unknown) =>
  Array.isArray(segments) ? segments.join("/") : (segments as string | undefined);

/** GET /api/content → 列全部；GET /api/content/posts → 列某目录；GET /api/content/posts/<slug>.md → 读文件 */
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const path = joinPath(params.path);
  if (!path || ["posts", "notes", "pages"].includes(path)) {
    const prefix = path ? `${path}/` : "";
    return Response.json({ objects: await listContent(env, prefix) });
  }

  const text = await getContent(env, path);
  if (text === null) return new Response("not found", { status: 404 });
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
  if (!path || !isSafeKey(path)) {
    return Response.json({ ok: false, message: "非法路径" }, { status: 400 });
  }

  const text = await request.text();
  if (text.length > MAX_MD_BYTES) {
    return Response.json({ ok: false, message: "文件太大" }, { status: 413 });
  }

  await putContent(env, path, text);
  await triggerDeploy(env);
  return Response.json({ ok: true });
};

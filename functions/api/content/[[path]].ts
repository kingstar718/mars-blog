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

/** GET /api/content → 列目录；GET /api/content/posts/<slug>.md → 读文件 */
export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const path = params.path as string | undefined;
  if (!path) {
    const prefix = (params.kind as string | undefined) ?? "";
    if (prefix && !["posts/", "notes/", "pages/"].includes(prefix)) {
      return Response.json({ ok: false, message: "未知目录" }, { status: 400 });
    }
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
  const path = params.path as string | undefined;
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

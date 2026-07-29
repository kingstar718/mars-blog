import type { APIRoute } from "astro";
import { db } from "@/lib/env";
import { deleteEntry, getEntry, updateDraft } from "@/lib/entries";
import { draftInputSchema } from "@/lib/schema";
import { purge } from "@/lib/cache";

const parseId = (raw: string | undefined) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const GET: APIRoute = async ({ params }) => {
  const id = parseId(params.id);
  if (!id) return new Response("id 无效", { status: 400 });

  const row = await getEntry(db(), id);
  if (!row) return new Response("内容不存在", { status: 404 });

  return Response.json({ entry: row });
};

/** 自动保存。草稿不做完整校验，写到一半被拦住是最恼人的事。 */
export const PATCH: APIRoute = async ({ params, request }) => {
  const id = parseId(params.id);
  if (!id) return new Response("id 无效", { status: 400 });

  const parsed = draftInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues }, { status: 400 });
  }

  const row = await updateDraft(db(), id, parsed.data);
  if (!row) return new Response("内容不存在", { status: 404 });

  return Response.json({ id: row.id, updatedAt: row.updated_at });
};

export const DELETE: APIRoute = async ({ params, url }) => {
  const id = parseId(params.id);
  if (!id) return new Response("id 无效", { status: 400 });

  const row = await getEntry(db(), id);
  if (!row) return new Response("内容不存在", { status: 404 });

  await deleteEntry(db(), id);
  if (row.status === "published") await purge(url.origin, id);
  return Response.json({ ok: true });
};

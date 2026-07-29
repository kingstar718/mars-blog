import type { APIRoute } from "astro";
import { db } from "@/lib/env";
import { listAllForAdmin } from "@/lib/db";
import { createDraft } from "@/lib/entries";
import { draftInputSchema } from "@/lib/schema";

export const GET: APIRoute = async () => {
  const { results } = await listAllForAdmin(db());
  return Response.json({ entries: results });
};

/** 新建草稿。编辑器第一次自动保存时才调这里，避免打开页面就产生空行。 */
export const POST: APIRoute = async ({ request }) => {
  const parsed = draftInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues }, { status: 400 });
  }

  const row = await createDraft(db(), parsed.data);
  return Response.json({ id: row.id, updatedAt: row.updated_at });
};

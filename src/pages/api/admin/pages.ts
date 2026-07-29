import type { APIRoute } from "astro";
import { db } from "@/lib/env";
import { getPage, listPages, savePage } from "@/lib/pages";
import { renderEntryBody } from "@/lib/entries";

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get("slug");
  if (slug) {
    const page = await getPage(db(), slug);
    if (!page) return new Response("页面不存在", { status: 404 });
    return Response.json({ page });
  }
  const { results } = await listPages(db());
  return Response.json({ pages: results });
};

export const PUT: APIRoute = async ({ request }) => {
  const body = (await request.json()) as {
    slug?: string;
    title?: string;
    body?: string;
  };
  if (!body.slug || !body.title || body.body === undefined) {
    return new Response("缺少字段", { status: 400 });
  }

  const database = db();
  // 独立页面没有草稿态，保存即生效，所以在这里就把 HTML 算好
  const html = await renderEntryBody(database, body.body);
  await savePage(database, body.slug, body.title, body.body, html);
  return Response.json({ ok: true });
};

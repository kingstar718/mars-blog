import type { APIRoute } from "astro";
import { db } from "@/lib/env";
import { renderEntryBody } from "@/lib/entries";

/**
 * 预览渲染。
 *
 * 走的是发布时那一套 unified/remark/rehype + shiki，不是浏览器里另起一份
 * markdown 解析器。之前用 marked 在客户端渲染，看到的东西和发出去的不一样：
 * 代码块没有高亮、/media/<uid> 不会展开成带 srcset 的图片。
 * 预览的全部价值就是「所见即将发布」，两套渲染器做不到这件事。
 *
 * 代价是每次预览要一个往返。编辑器那边有防抖，够用。
 */
export const POST: APIRoute = async ({ request }) => {
  const { body } = (await request.json().catch(() => ({}))) as {
    body?: string;
  };
  if (typeof body !== "string")
    return new Response("缺少正文", { status: 400 });

  return Response.json({ html: await renderEntryBody(db(), body) });
};

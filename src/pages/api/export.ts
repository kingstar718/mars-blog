import type { APIRoute } from "astro";
import { db, env } from "@/lib/env";
import type { EntryRow } from "@/lib/db";
import { now, toSiteTime } from "@/lib/datetime";

/**
 * 全量导出，给每日备份用。
 *
 * 内容离开 git 之后，「哪天想搬走就能搬走」这件事不会自己成立。
 * D1 有 Time Travel，但那是 Cloudflare 的恢复机制，不是你能读、能 grep、
 * 能带走的东西。这里吐出的是可以直接落盘的 markdown，格式和旧站一致——
 * 真要回去，把文件放进 src/content 就能跑。
 *
 * 不走后台会话：由 GitHub Actions 定时调用，用独立的 EXPORT_TOKEN。
 */

const yaml = (value: string) => `"${value.replaceAll('"', '\\"')}"`;

const toFrontmatter = (row: EntryRow) => {
  const lines: string[] = [
    // 旧站的 frontmatter 精确到分钟，库里存到秒，这里截掉秒
    `pubDatetime: ${yaml(toSiteTime(row.pub_datetime).format("YYYY-MM-DD HH:mm"))}`,
  ];
  if (row.kind === "post") {
    lines.push(`title: ${yaml(row.title ?? "")}`);
    if (row.ai_generated !== null)
      lines.push(`aiGenerated: ${row.ai_generated === 1}`);
  }
  return `---\n${lines.join("\n")}\n---\n`;
};

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get("token");
  if (!token || token !== env.EXPORT_TOKEN) {
    return new Response("未授权", { status: 401 });
  }

  const database = db();
  const { results: entries } = await database
    .prepare(
      `SELECT * FROM entries WHERE status = 'published' ORDER BY pub_datetime`
    )
    .all<EntryRow>();

  const files = entries.map(row => {
    const name =
      row.kind === "post"
        ? `posts/${toSiteTime(row.pub_datetime).format("YYYY-MM-DD-HHmmss")}.md`
        : `notes/${toSiteTime(row.pub_datetime).format("YYYY-MM-DD-HHmmss")}.md`;
    return {
      path: name,
      content: `${toFrontmatter(row)}\n${row.body}\n`,
    };
  });

  // 图片只给清单，不给二进制——真要整份带走，R2 那边 rclone 一条命令的事，
  // 把几十兆塞进这个响应里没有好处。
  const { results: images } = await database
    .prepare(`SELECT r2_key, variants FROM images`)
    .all<{ r2_key: string; variants: string }>();

  return Response.json({
    exportedAt: now(),
    files,
    images: images.map(image => ({
      uid: image.r2_key,
      variants: JSON.parse(image.variants),
    })),
  });
};

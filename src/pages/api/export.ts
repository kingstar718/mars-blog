import type { APIRoute } from "astro";
import { db, env } from "@/lib/env";
import type { EntryRow } from "@/lib/db";
import { now, toSiteTime } from "@/lib/datetime";
import { extractImageUids } from "@/lib/render";

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

  // 图片只给清单，二进制由备份流程照着清单逐个去 /media 拉——
  // 几十兆塞进这个响应里没有好处，分开拉还能只补缺的那几个。
  const { results: images } = await database
    .prepare(`SELECT r2_key, variants, created_at FROM images`)
    .all<{ r2_key: string; variants: string; created_at: string }>();

  return Response.json({
    exportedAt: now(),
    files,
    images: images.map(image => ({
      uid: image.r2_key,
      variants: JSON.parse(image.variants) as unknown,
    })),
    orphans: await findOrphans(database, images),
  });
};

/**
 * 没有任何正文引用的图片。
 *
 * images 表里没有 entry_id（0007 精简时删的），归属关系只能靠扫正文里的
 * /media/<uid> 反推。删一篇文章、或者编辑时删掉一张图，R2 里的对象不会
 * 跟着消失——这份清单就是用来发现它们的。
 *
 * 只报告不删除：草稿里、甚至还没保存的编辑器里都可能引用着某张图，
 * 而删除是不可逆的。带上入库时间，判断时看一眼年龄。
 */
const findOrphans = async (
  database: D1Database,
  images: { r2_key: string; created_at: string }[]
) => {
  // 草稿一起算：草稿里引用的图不是孤儿
  const { results: bodies } = await database
    .prepare(`SELECT body FROM entries UNION ALL SELECT body FROM pages`)
    .all<{ body: string }>();

  const referenced = new Set(bodies.flatMap(row => extractImageUids(row.body)));

  return images
    .filter(image => !referenced.has(image.r2_key))
    .map(image => ({ uid: image.r2_key, createdAt: image.created_at }));
};

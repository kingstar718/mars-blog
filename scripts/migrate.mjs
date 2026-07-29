/**
 * 把 astro-paper-blog 的 markdown 内容导进 D1 和 R2。
 *
 * 一次性脚本，跑完就没用了，留着是为了让这次迁移可复现、可回滚重来。
 *
 * 用法：
 *   node scripts/migrate.mjs --dry            只打印将要做什么
 *   node scripts/migrate.mjs --local          写本地 D1（.wrangler/state）
 *   node scripts/migrate.mjs --remote         写线上 D1 和 R2
 *
 * 做三件事：
 *   1. 图片用 sharp 压出和后台一致的多尺寸，传 R2，登记进 images 表
 *   2. 正文里的相对路径引用改写成 /media/<uid>
 *   3. frontmatter 转成 entries / entry_updates 行
 *
 * body_html 不在这里生成——渲染要用 Workers 上的 shiki，
 * 导完之后调 POST /api/admin/rerender 统一渲染。
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import matter from "gray-matter";
import sharp from "sharp";

const SOURCE = resolve(process.env.HOME, "Documents/projects/astro-paper-blog");
const TARGET_WIDTHS = [400, 800, 1600];

const args = new Set(process.argv.slice(2));
const dry = args.has("--dry");
const remote = args.has("--remote");
const scope = remote ? "--remote" : "--local";

const wrangler = (...rest) =>
  execFileSync("pnpm", ["exec", "wrangler", ...rest], {
    encoding: "utf8",
    stdio: dry ? "pipe" : ["pipe", "pipe", "inherit"],
  });

const sql = value =>
  value === null || value === undefined
    ? "NULL"
    : typeof value === "number"
      ? String(value)
      : `'${String(value).replaceAll("'", "''")}'`;

/** 旧站的 "YYYY-MM-DD HH:mm"（北京时间）-> 库里的 "YYYY-MM-DD HH:mm:ss"（同样是北京时间） */
/** 当前北京时间，格式同上。sv-SE 的 locale 恰好就是 'YYYY-MM-DD HH:mm:ss' */
const nowStored = () =>
  new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" });

const toStored = local => {
  const [date, time] = local.trim().split(" ");
  const [hh, mm] = time.split(":");
  return `${date} ${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:00`;
};

/** 和 src/components/admin/resize.ts 同一套档位与质量，保证新旧图一致 */
const buildVariants = async file => {
  const image = sharp(file).rotate(); // rotate() 无参数即按 EXIF 摆正
  const { width: originalWidth } = await image.metadata();
  const widths = [
    ...new Set(TARGET_WIDTHS.map(w => Math.min(w, originalWidth))),
  ];

  const variants = [];
  for (const width of widths) {
    for (const format of ["webp", "jpeg"]) {
      const pipeline = sharp(file).rotate().resize({ width });
      const buffer = await (
        format === "webp"
          ? pipeline.webp({ quality: 82 })
          : pipeline.jpeg({ quality: 82 })
      ).toBuffer();
      const meta = await sharp(buffer).metadata();
      variants.push({ buffer, width: meta.width, height: meta.height, format });
    }
  }
  return variants;
};

const uploadImage = async (uid, variants, tmp) => {
  const records = [];
  for (const variant of variants) {
    const extension = variant.format === "webp" ? "webp" : "jpg";
    const key = `${uid}/${variant.width}.${extension}`;
    records.push({
      key,
      width: variant.width,
      height: variant.height,
      format: variant.format,
    });
    if (dry) continue;
    const path = join(tmp, `${variant.width}.${extension}`);
    writeFileSync(path, variant.buffer);
    wrangler(
      "r2",
      "object",
      "put",
      `mars-blog-media/${key}`,
      "--file",
      path,
      "--content-type",
      variant.format === "webp" ? "image/webp" : "image/jpeg",
      remote ? "--remote" : "--local"
    );
  }
  return records;
};

const run = async () => {
  const tmp = mkdtempSync(join(tmpdir(), "mars-migrate-"));
  const statements = [];
  const imageMap = new Map(); // 旧的相对路径 -> uid

  // ---- 图片 ----
  const imageDir = join(SOURCE, "src/assets/images/notes");
  for (const name of readdirSync(imageDir).sort()) {
    const uid = randomUUID();
    const variants = await buildVariants(join(imageDir, name));
    const records = await uploadImage(uid, variants, tmp);
    imageMap.set(name, uid);
    statements.push(
      `INSERT INTO images (r2_key, variants, created_at) VALUES (${sql(uid)}, ${sql(JSON.stringify(records))}, ${sql(nowStored())});`
    );
    console.log(
      `图片 ${name} -> ${uid}  ${records.length} 个变体  ${records.map(r => r.width).join("/")}`
    );
  }

  // ---- 正文 ----
  const collect = (dir, kind) =>
    readdirSync(join(SOURCE, dir))
      .filter(name => name.endsWith(".md") && !name.startsWith("_"))
      .sort()
      .map(name => ({
        kind,
        slug: name.replace(/\.md$/, ""),
        raw: readFileSync(join(SOURCE, dir, name), "utf8"),
      }));

  for (const item of [
    ...collect("src/content/posts", "post"),
    ...collect("src/content/notes", "note"),
  ]) {
    const { data, content } = matter(item.raw);

    // 相对路径引用改写成 /media/<uid>
    const body = content
      .replace(
        /!\[([^\]]*)\]\(\.\.\/\.\.\/assets\/images\/notes\/([^)]+)\)/g,
        (whole, alt, file) => {
          const uid = imageMap.get(file);
          if (!uid) {
            console.warn(`  ⚠ 找不到图片 ${file}，原样保留`);
            return whole;
          }
          return `![${alt}](/media/${uid})`;
        }
      )
      .trim();

    const pub = toStored(data.pubDatetime);
    const isPost = item.kind === "post";
    statements.push(
      `INSERT INTO entries (kind, slug, title, description, body, pub_datetime, status, featured, ai_generated, canonical_url, created_at, updated_at)
       VALUES (${sql(item.kind)}, ${isPost ? sql(item.slug) : "NULL"}, ${isPost ? sql(data.title) : "NULL"}, ${isPost ? sql(data.description) : "NULL"}, ${sql(body)}, ${sql(pub)}, 'published', ${data.featured ? 1 : 0}, ${data.aiGenerated === undefined ? "NULL" : data.aiGenerated ? 1 : 0}, ${sql(data.canonicalURL ?? null)}, ${sql(pub)}, ${sql(pub)});`
    );

    for (const update of data.updates ?? []) {
      statements.push(
        `INSERT INTO entry_updates (entry_id, datetime, action, note, agent)
         SELECT id, ${sql(toStored(update.datetime))}, ${sql(update.action)}, ${sql(update.note)}, ${sql(update.agent)} FROM entries WHERE slug = ${sql(item.slug)};`
      );
    }

    console.log(
      `${item.kind === "post" ? "文章" : "短文"} ${item.slug}  ${pub}  ${(data.updates ?? []).length} 条更新记录`
    );
  }

  const file = join(tmp, "migrate.sql");
  writeFileSync(file, statements.join("\n"));
  console.log(`\n共 ${statements.length} 条语句 -> ${file}`);

  if (dry) {
    console.log("（--dry，未写库）");
    return;
  }
  wrangler("d1", "execute", "mars-blog", scope, "--file", file, "--yes");
  console.log(`已写入 ${remote ? "线上" : "本地"} D1。`);
  console.log("接下来调 POST /api/admin/rerender 生成 body_html。");
};

run().catch(error => {
  console.error(error);
  process.exit(1);
});

import { z } from "zod";

/**
 * 写入校验。
 *
 * 内容离开 git 之后，构建期的 frontmatter 校验就没有了——
 * 这些规则搬到这里，在 API 层、写库之前跑。规则本身沿用旧站
 * astro-paper-blog/src/content.config.ts，语义保持一致。
 *
 * 数据库那边只做最粗的 CHECK（kind、status、action 的取值），
 * 结构性约束一律在这里保证。
 */

/**
 * 时间一律是站点时间的 'YYYY-MM-DD HH:mm:ss'，见 lib/datetime.ts。
 *
 * 这个值不再由客户端提供——发布时由服务端盖戳，所以这里校验的是
 * 库里已有的值，属于「读出来的东西不该长得不对」那一档。
 */
const pubDatetime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    "时间格式应为 YYYY-MM-DD HH:mm:ss（站点时间）"
  );

/** slug 即 URL，小写英文加连字符 */
const slug = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug 只能是小写字母、数字和连字符，例如 how-i-built-this"
  );

const postSchema = z.object({
  kind: z.literal("post"),
  slug,
  title: z.string().min(1, "文章必须有标题"),
  body: z.string().min(1),
  pubDatetime,
  featured: z.boolean().default(false),
  // 不设默认值：真人写的和 AI 写的都要显式表态，避免默认值把哪一边标错
  aiGenerated: z.boolean(),
  canonicalURL: z.url().optional(),
});

/** 短文没有标题，正文一两段直接在时间线里展开 */
const noteSchema = z.object({
  kind: z.literal("note"),
  body: z.string().min(1),
  pubDatetime,
});

export const entryInputSchema = z.discriminatedUnion("kind", [
  postSchema,
  noteSchema,
]);

export type EntryInput = z.infer<typeof entryInputSchema>;
export type PostInput = z.infer<typeof postSchema>;
export type NoteInput = z.infer<typeof noteSchema>;

/** 草稿允许不完整——校验只在「发布」时跑，写草稿不该被拦住 */
export const draftInputSchema = z.object({
  kind: z.enum(["post", "note"]),
  slug: z.string().optional(),
  title: z.string().optional(),
  body: z.string(),
  // 没有 pubDatetime：发布时间由服务端在发布那一刻决定，客户端说了不算
  featured: z.boolean().optional(),
  aiGenerated: z.boolean().optional(),
  canonicalURL: z.string().optional(),
});

export type DraftInput = z.infer<typeof draftInputSchema>;

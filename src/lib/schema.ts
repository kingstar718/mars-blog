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

/** 时间一律 ISO8601 UTC，本地时间的转换在 lib/datetime.ts */
const pubDatetime = z.iso.datetime({
  message: "pubDatetime 需要是 ISO8601 UTC",
});

/** slug 即 URL，小写英文加连字符 */
const slug = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug 只能是小写字母、数字和连字符，例如 how-i-built-this"
  );

/** 文末更新记录，对应旧站 frontmatter 的 updates[] */
export const updateEntrySchema = z.object({
  datetime: pubDatetime,
  action: z.enum(["创建", "修改", "排版", "翻译"]),
  note: z.string().min(1, "note 不能为空，要写清具体改了什么"),
  agent: z.string().min(1),
});

const postSchema = z.object({
  kind: z.literal("post"),
  slug,
  title: z.string().min(1, "文章必须有标题"),
  // 时间线上每条只给一行：超过 45 字在 768px 的正文宽度里就会折行
  description: z
    .string()
    .min(1, "description 必填，它出现在时间线和 RSS 里")
    .max(45, "description 控制在 45 字以内，时间线上只占一行"),
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
export type UpdateEntry = z.infer<typeof updateEntrySchema>;

/** 草稿允许不完整——校验只在「发布」时跑，写草稿不该被拦住 */
export const draftInputSchema = z.object({
  kind: z.enum(["post", "note"]),
  slug: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  body: z.string(),
  pubDatetime: z.iso.datetime().optional(),
  featured: z.boolean().optional(),
  aiGenerated: z.boolean().optional(),
  canonicalURL: z.string().optional(),
});

export type DraftInput = z.infer<typeof draftInputSchema>;

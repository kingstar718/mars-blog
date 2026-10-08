import { unified } from "unified";
import remarkParse from "remark-parse";

const markdownParser = unified().use(remarkParse);

/** 汉字逐字计数，其余字母/数字连续片段计一词；不计代码、HTML 和图片。 */
export function countBodyWords(body: string) {
  const tree = markdownParser.parse(body);
  const count = (node: {
    type: string;
    value?: string;
    children?: unknown[];
  }): number => {
    if (
      ["code", "inlineCode", "html", "image", "imageReference"].includes(
        node.type
      )
    )
      return 0;
    if (node.type === "text")
      return (
        node.value?.match(
          /\p{Script=Han}|(?:(?!\p{Script=Han})[\p{L}\p{N}])+/gu
        ) ?? []
      ).length;
    return (node.children ?? []).reduce<number>(
      (total, child) => total + count(child as Parameters<typeof count>[0]),
      0
    );
  };
  return count(tree);
}

const siteDate = (time: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
const dayNumber = (date: string) => Date.parse(date + "T00:00:00Z") / 86400000;

interface Entry {
  id: string;
  body?: string;
  data: { pubDatetime: Date; draft?: boolean; title?: string };
}

/** 首页可编辑正文中的变量；所有日期统计以构建时间为准。 */
export function homeStats(posts: Entry[], notes: Entry[], now = Date.now()) {
  const published = (entries: Entry[]) =>
    entries.filter(
      entry => !entry.data.draft && entry.data.pubDatetime.getTime() <= now
    );
  const latest = (entries: Entry[]) =>
    [...entries].sort(
      (a, b) => b.data.pubDatetime.getTime() - a.data.pubDatetime.getTime()
    )[0];
  const publicPosts = published(posts);
  const publicNotes = published(notes);
  const post = latest(publicPosts);
  const note = latest(publicNotes);
  const all = [...publicPosts, ...publicNotes];
  const dates = all
    .map(entry => siteDate(entry.data.pubDatetime.getTime()))
    .sort();
  const firstDate = dates[0] ?? "";
  const today = siteDate(now);
  const thisYear = (entries: Entry[]) =>
    entries.filter(
      entry =>
        siteDate(entry.data.pubDatetime.getTime()).slice(0, 4) ===
        today.slice(0, 4)
    ).length;
  const totalWords = all.reduce(
    (sum, entry) => sum + countBodyWords(entry.body ?? ""),
    0
  );
  const daysAgo = (entry?: Entry) =>
    entry
      ? String(Math.floor((now - entry.data.pubDatetime.getTime()) / 86400000))
      : "";
  return {
    first_entry_date: firstDate,
    blog_days: firstDate
      ? String(dayNumber(today) - dayNumber(firstDate) + 1)
      : "0",
    total_words: String(totalWords),
    total_words_wan: (totalWords / 10000).toFixed(1),
    year_posts_count: String(thisYear(publicPosts)),
    year_notes_count: String(thisYear(publicNotes)),
    writing_days: String(new Set(dates).size),
    recent_notes_count: String(
      publicNotes.filter(
        entry => entry.data.pubDatetime.getTime() >= now - 7 * 86400000
      ).length
    ),
    posts_count: String(publicPosts.length),
    notes_count: String(publicNotes.length),
    latest_post_title: post?.data.title ?? "",
    latest_post_url: post ? `/posts/${post.id}` : "/posts",
    latest_post_days_ago: daysAgo(post),
    latest_note_days_ago: daysAgo(note),
  };
}

/** 在 Markdown 已渲染的 HTML 中替换，保留作者的格式并避免标题成为 HTML。 */
export function fillHomeStats(html: string, values: Record<string, string>) {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      char =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]!
    );
  return html.replace(
    /\{\{([a-z_]+)\}\}|%7B%7B([a-z_]+)%7D%7D/gi,
    (token, raw, encoded) => {
      const name = raw ?? encoded;
      return Object.hasOwn(values, name) ? escape(values[name]) : token;
    }
  );
}

/**
 * markdown + frontmatter 的最小读写。
 *
 * v3 的内容真相源是 R2 里的 .md 文件，标题、日期、draft 都在 frontmatter
 * 里。编辑器只需要动「标题」和「正文」，其余字段原样保留，所以这里不做
 * 完整 YAML 解析，只拆出块、按行读字段、按需改字段再拼回去。
 */

export interface ParsedMarkdown {
  /** frontmatter 里读到的字段（保留原始顺序） */
  fields: Record<string, string>;
  /** 去掉 frontmatter 后的正文 */
  body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const FIELD = /^([A-Za-z_][\w-]*):\s*(.*)$/;

export const parseMarkdown = (raw: string): ParsedMarkdown => {
  const match = FRONTMATTER.exec(raw);
  if (!match) return { fields: {}, body: raw };

  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = FIELD.exec(line);
    if (m) fields[m[1]] = m[2];
  }
  const body = raw.slice(match[0].length).replace(/^\s*\n/, "");
  return { fields, body };
};

/** 普通文本直接写，含特殊字符（: # " 等）时用 JSON 双引号转义 */
const yamlValue = (value: string) =>
  /^[\w\u4e00-\u9fff][^:#]*$/.test(value) ? value : JSON.stringify(value);

export const buildMarkdown = (fields: Record<string, string>, body: string) => {
  const block = Object.entries(fields)
    .map(([key, value]) => `${key}: ${yamlValue(value)}`)
    .join("\n");
  return `---\n${block}\n---\n\n${body.trim()}\n`;
};

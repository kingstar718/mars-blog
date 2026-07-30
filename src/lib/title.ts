/**
 * 标题末尾的标签。
 *
 * 写法就是标题后面空一格加 `#标签`，可以有多个：`一次以减法为主的改造 #ai`。
 * 不建标签表、不做标签页——标签在这个站里只是一个说明，不是一套分类系统。
 * 数据库里存的仍然是完整标题那一串，编辑器里改的也是它，
 * 拆开只发生在渲染的那一刻。
 *
 * 只认结尾处的：正文标题里出现 `C# 入门` 这种不受影响。
 */

const TRAILING_TAGS = /(?:\s+#[^\s#]+)+$/;

export interface TitleParts {
  /** 去掉末尾标签之后的标题 */
  base: string;
  /** 标签，带 # */
  tags: string[];
}

export const splitTitle = (title: string): TitleParts => {
  const match = TRAILING_TAGS.exec(title);
  if (!match) return { base: title, tags: [] };
  return {
    base: title.slice(0, match.index),
    tags: match[0].trim().split(/\s+/),
  };
};

/** 只要标题正文，用在句子里（比如首页那句「最新的文章是…」） */
export const plainTitle = (title: string) => splitTitle(title).base;

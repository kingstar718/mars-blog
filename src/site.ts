/** 站点常量。旧站散在 astro-paper.config.ts 和 i18n 里，这里只留用得上的。 */
export const site = {
  title: "陆上江南",
  description: "直道半生如汪洋，付一尾孤航。",
  author: "陆上江南",
  /** 页脚站名点开就是写邮件，站上唯一的联系方式 */
  email: "kingstar718@foxmail.com",
  lang: "zh",
} as const;

/** 列表每页条数，与旧站一致 */
export const perPage = {
  posts: 10,
  notes: 15,
} as const;

/** 站点常量。旧站散在 astro-paper.config.ts 和 i18n 里，这里只留用得上的。 */
export const site = {
  title: "陆上江南",
  description: "直道半生如汪洋，付一尾孤航。",
  author: "陆上江南",
  lang: "zh",
} as const;

/** 列表每页条数，与旧站一致 */
export const perPage = {
  posts: 10,
  notes: 15,
  /** 首页混排只出最近若干条。短文在首页只出缩略图，一条也就一两百像素，
      4 条会让首页空掉半屏，8 条正好一屏出头 */
  index: 8,
} as const;

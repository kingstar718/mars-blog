import dayjs from "dayjs";
import { SITE_TIMEZONE, DB_DATETIME_FORMAT } from "./datetime";

/**
 * 静态化（v3）的内容辅助。
 *
 * 内容集合的 pubDatetime 是 ISO Date，页面组件沿用的是旧库的
 * 站点时间字符串（'YYYY-MM-DD HH:mm:ss'），这里负责转换。
 */

export interface Heading {
  depth: number;
  slug: string;
  text: string;
}

/** Date（ISO UTC）-> 站点时间字符串，喂给 Datetime 等旧组件 */
export const toSiteString = (date: Date) =>
  dayjs(date).tz(SITE_TIMEZONE).format(DB_DATETIME_FORMAT);

/** 按年分组，列表页打小标题用 */
export const groupByYear = <T extends { data: { pubDatetime: Date } }>(
  items: T[]
): [string, T[]][] => {
  const groups: [string, T[]][] = [];
  for (const item of items) {
    const year = String(dayjs(item.data.pubDatetime).tz(SITE_TIMEZONE).year());
    const last = groups.at(-1);
    if (last?.[0] === year) last[1].push(item);
    else groups.push([year, [item]]);
  }
  return groups;
};

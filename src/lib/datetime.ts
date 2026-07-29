import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/** 站点时区。库里存的就是这个时区的墙上时间。 */
export const SITE_TIMEZONE = "Asia/Shanghai";

/**
 * 数据库里的时间格式：站点时间的 'YYYY-MM-DD HH:mm:ss'。
 *
 * 上一版存 ISO8601 UTC，理由是「后台有日期控件，存 UTC 才对」。
 * 日期控件已经去掉了——时间一律由发布动作产生——那个理由不成立了。
 * 存站点时间之后，库里写的、导出的 frontmatter、页面上显示的是同一串字符，
 * 排查问题时不用再在脑子里做时区加减。
 *
 * 单人单时区的站点才能这么做：这个格式不带偏移量，换时区就是错的。
 * 字符串排序仍然等于时间排序，索引和 ORDER BY 不受影响。
 */
export const DB_DATETIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

/** 写库用的当前时间 */
export const now = () => dayjs().tz(SITE_TIMEZONE).format(DB_DATETIME_FORMAT);

/** 库里的字符串 -> dayjs（带站点时区） */
export const toSiteTime = (stored: string) => dayjs.tz(stored, SITE_TIMEZONE);

/** 时间线上的显示格式，与旧站保持一致 */
export const formatDisplay = (stored: string) =>
  toSiteTime(stored).format("YYYY-MM-DD HH:mm");

/** <time datetime=""> 用的机器可读值，带 +08:00 偏移 */
export const formatMachine = (stored: string) => toSiteTime(stored).format();

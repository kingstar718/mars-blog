import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/** 站点时区。数据库里一律存 UTC，只有渲染和编辑器输入才用这个。 */
export const SITE_TIMEZONE = "Asia/Shanghai";

/**
 * 数据库存 ISO8601 UTC，页面显示北京时间。
 *
 * 上一版（astro-paper-blog）把本地时间字符串直接写进 frontmatter，
 * 是为了让手写 YAML 时所见即所得。现在时间由后台的日期控件产生，
 * 这个理由不成立了，存 UTC 才是对的。
 */
export const toSiteTime = (isoUtc: string) =>
  dayjs.utc(isoUtc).tz(SITE_TIMEZONE);

/** 编辑器里填的是北京时间，写库前转回 UTC */
export const fromSiteTime = (local: string) =>
  dayjs.tz(local, SITE_TIMEZONE).toISOString();

export const nowUtc = () => dayjs.utc().toISOString();

/** 时间线上的显示格式，与旧站保持一致 */
export const formatDisplay = (isoUtc: string) =>
  toSiteTime(isoUtc).format("YYYY-MM-DD HH:mm");

/** <time datetime=""> 用的机器可读值 */
export const formatMachine = (isoUtc: string) =>
  dayjs.utc(isoUtc).toISOString();

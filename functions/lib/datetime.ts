import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/** 站点时区。库里存的就是这个时区的墙上时间。 */
export const SITE_TIMEZONE = "Asia/Shanghai";

/** 数据库里的时间格式：站点时间的 'YYYY-MM-DD HH:mm:ss' */
export const DB_DATETIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

/** 写库用的当前时间 */
export const now = () => dayjs().tz(SITE_TIMEZONE).format(DB_DATETIME_FORMAT);

/**
 * 站点设置（键值表，见 migrations/0013_settings.sql）。
 *
 * 口令哈希和会话密钥都从这里取，不再走环境变量——单用户站点，
 * 这两样本质上是"这台机器上的数据"，放数据库比放进程环境更顺：
 * 首次登录设置口令、换口令都不用碰服务器配置。
 */

export const PASSWORD_KEY = "password_hash";
export const SESSION_KEY = "session_secret";

export const getSetting = async (db: D1Database, key: string) =>
  (
    await db
      .prepare(`SELECT value FROM settings WHERE key = ?1`)
      .bind(key)
      .first<{ value: string }>()
  )?.value ?? null;

export const setSetting = async (
  db: D1Database,
  key: string,
  value: string
) => {
  await db
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?1, ?2)
       ON CONFLICT (key) DO UPDATE SET value = ?2`
    )
    .bind(key, value)
    .run();
};

export const getPasswordHash = (db: D1Database) => getSetting(db, PASSWORD_KEY);
export const setPasswordHash = (db: D1Database, hash: string) =>
  setSetting(db, PASSWORD_KEY, hash);

/**
 * 会话密钥：有就用，没有就生成一份落库。
 *
 * 生成后永远不再变，除非手动删掉这一行（那样所有会话立刻失效，
 * 相当于换了一次密钥）。两段 UUID 拼成 64 位十六进制，足够长。
 */
export const ensureSessionSecret = async (db: D1Database) => {
  const existing = await getSetting(db, SESSION_KEY);
  if (existing) return existing;
  const secret =
    crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "");
  await setSetting(db, SESSION_KEY, secret);
  return secret;
};

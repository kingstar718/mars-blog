export const MAX_MARKDOWN_BYTES = 1_000_000;
export const MAX_WEBHOOK_BYTES = 256 * 1024;
export const MAX_IMAGE_REQUEST_BYTES = 32 * 1024 * 1024;

export const utf8ByteLength = (value: string) =>
  new TextEncoder().encode(value).byteLength;

/** 只允许内容桶中的 markdown 路径，拒绝路径逃逸和空路径段。 */
export const isSafeContentKey = (key: string) => {
  if (key.length === 0 || key.includes("..") || key.includes("//")) {
    return false;
  }
  if (/[[\]{}<>:"|?*\u0000-\u001f]/u.test(key)) return false;
  return /^(posts|notes|pages)\/(?:[^/]+\/)*[^/]+\.md$/u.test(key);
};

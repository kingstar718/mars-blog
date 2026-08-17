/**
 * [[path]] 通配在 Pages 运行时是数组（如 /posts/a.md → ["posts","a.md"]），
 * 段内可能仍是 percent 编码（如中文文件名），统一解码后拼成 / 路径。
 */
export const joinPath = (segments: unknown) => {
  const segs = Array.isArray(segments)
    ? segments
    : segments === undefined || segments === null
      ? []
      : [segments];
  return segs
    .map(seg => {
      try {
        return decodeURIComponent(String(seg));
      } catch {
        return String(seg);
      }
    })
    .join("/");
};

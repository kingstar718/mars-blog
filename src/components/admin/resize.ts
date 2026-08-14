/**
 * 浏览器端多尺寸压缩。
 *
 * 为什么放在客户端：浏览器端 canvas 压图对服务器零负载、零依赖，
 * 上传的同时就把变体算好了。代价是上传时手机会卡一下。
 *
 * 只出 jpeg：canvas 的 webp 编码在 quality 0.82 时对实拍照片异常膨胀，
 * 线上实测同一张图 400/800/1600 档 webp 分别是 425KB/1.5MB/5.1MB，
 * jpeg 只有 86KB/268KB/728KB（webp 大 5–7 倍）。webp 的优势在低质量段，
 * 这里直接用 jpeg 主档，上传体积和存储一起减半。
 */

/** 三档够用：400 缩略图、800 展开大图、1600 归档（服务端不下发 1600） */
const TARGET_WIDTHS = [400, 800, 1600];

/** jpeg 质量：0.82 的照片级画质降到 0.78，肉眼几乎无差，体积再省一截 */
const JPEG_QUALITY = 0.78;

export interface ResizedVariant {
  blob: Blob;
  width: number;
  height: number;
  format: "jpeg";
}

const toBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("导出失败"))),
      type,
      quality
    );
  });

export const resizeImage = async (file: File): Promise<ResizedVariant[]> => {
  // from-image 让浏览器按 EXIF 摆正方向。手机竖拍的照片没有这一步会躺倒。
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("拿不到 canvas 上下文");

  // 不放大：原图比目标还小的话，那一档就用原始宽度，且不再重复生成
  const widths = [
    ...new Set(TARGET_WIDTHS.map(w => Math.min(w, bitmap.width))),
  ];

  const variants: ResizedVariant[] = [];
  for (const width of widths) {
    const height = Math.round((bitmap.height * width) / bitmap.width);
    canvas.width = width;
    canvas.height = height;
    context.drawImage(bitmap, 0, 0, width, height);

    variants.push({
      blob: await toBlob(canvas, "image/jpeg", JPEG_QUALITY),
      width,
      height,
      format: "jpeg",
    });
  }

  bitmap.close();
  return variants;
};

/**
 * 浏览器端多尺寸压缩。
 *
 * 为什么放在客户端：Workers 上跑不了 sharp，Cloudflare Images 的变换要付费，
 * 所以这是唯一的免费路径。代价是上传时手机会卡一下。
 *
 * 旧站这些活是 astro:assets 干的（webp、srcset、宽高属性）。内容离开 git
 * 之后没人做了，只能自己补上——尤其是宽高，缺了图片加载时会有布局跳动。
 */

/** 三档够用：手机屏、普通正文宽度、高分屏满宽 */
const TARGET_WIDTHS = [400, 800, 1600];

export interface ResizedVariant {
  blob: Blob;
  width: number;
  height: number;
  format: "webp" | "jpeg";
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
      blob: await toBlob(canvas, "image/webp", 0.82),
      width,
      height,
      format: "webp",
    });
    // jpeg 兜底：webp 已经很普及，但存一份的成本远低于某天发现某个浏览器空白
    variants.push({
      blob: await toBlob(canvas, "image/jpeg", 0.82),
      width,
      height,
      format: "jpeg",
    });
  }

  bitmap.close();
  return variants;
};

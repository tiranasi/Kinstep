import { AppError } from "./domain";

export async function readImage(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new AppError("请选择10MB以内的照片。", 413);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return { buffer, mime: "image/jpeg" };
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { buffer, mime: "image/png" };
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP")
    return { buffer, mime: "image/webp" };
  throw new AppError("请选择JPEG、PNG或WebP照片。手机照片也可先截图后上传。");
}

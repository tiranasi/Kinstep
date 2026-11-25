import { NextResponse } from "next/server";
import { z } from "zod";
import { extractAppointment } from "@/lib/assistant";
import { getMode } from "@/lib/db";
import { AppError } from "@/lib/domain";
import { failure, guardOrigin, requireRole } from "@/lib/http";
import { readImage } from "@/lib/image-upload";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    guardOrigin(req);
    if ((await requireRole()) !== "child") throw new AppError("请在子女端完成这项操作。", 403);
    const { modeVersion } = getMode();
    if (Number(req.headers.get("content-length")) > 12 * 1024 * 1024) {
      throw new AppError("照片太大，请选择10MB以内的照片。", 413);
    }
    let input: string | Awaited<ReturnType<typeof readImage>>;
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const image = (await req.formData()).get("image");
      if (!(image instanceof File)) throw new AppError("请先选择一张照片。");
      input = await readImage(image);
    } else {
      input = z.object({ text: z.string().trim().min(1).max(2000) }).parse(await req.json()).text;
    }
    const appointment = await extractAppointment(input);
    if (getMode().modeVersion !== modeVersion)
      throw new AppError("案例模式已切换，请重新操作。", 409);
    return NextResponse.json({ appointment, modeVersion });
  } catch (e) {
    return failure(e);
  }
}

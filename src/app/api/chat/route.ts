import { NextResponse } from "next/server";
import { z } from "zod";
import { getMode, getState } from "@/lib/db";
import { chat } from "@/lib/assistant";
import { failure, guardOrigin, requireRole } from "@/lib/http";
import { AppError } from "@/lib/domain";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(req: Request) {
  try {
    guardOrigin(req);
    const role = await requireRole();
    const { text, locale } = z
      .object({
        text: z.string().trim().min(1).max(2000),
        locale: z.enum(["zh", "en"]).default("zh"),
      })
      .parse(await req.json());
    const { modeVersion } = getMode();
    const state = getState();
    const answer = await chat(text, state, role, locale);
    if (getMode().modeVersion !== modeVersion)
      throw new AppError("案例模式已切换，请重新操作。", 409);
    return NextResponse.json({ ...answer, revision: state.revision });
  } catch (e) {
    return failure(e);
  }
}

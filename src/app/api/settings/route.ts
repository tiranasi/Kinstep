import { networkInterfaces } from "node:os";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMode, getModelConfig, saveModel, switchMode } from "@/lib/db";
import { AppError } from "@/lib/domain";
import { failure, guardOrigin, requireRole } from "@/lib/http";
import { modelEndpoint } from "@/lib/model-config";

export const runtime = "nodejs";

async function requireChild() {
  if ((await requireRole()) !== "child") throw new AppError("请在子女端完成这项操作。", 403);
}

export async function GET(req: Request) {
  try {
    await requireChild();
    const { url, model, key } = getModelConfig();
    const origin = new URL(req.url);
    const port = req.headers.get("host")?.match(/:(\d+)$/)?.[1] || origin.port;
    const lanUrls = Object.values(networkInterfaces()).flatMap((addresses) =>
      (addresses || [])
        .filter(
          (a) =>
            a.family === "IPv4" &&
            !a.internal &&
            /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address),
        )
        .map((a) => `${origin.protocol}//${a.address}${port ? ":" + port : ""}`),
    );
    return NextResponse.json(
      { url, model, hasKey: Boolean(key), lanUrls: [...new Set(lanUrls)], ...getMode() },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return failure(e);
  }
}

const updateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mode"), caseMode: z.boolean() }),
  z.object({
    type: z.literal("model"),
    url: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .refine((value) => {
        try {
          modelEndpoint(value);
          return true;
        } catch {
          return false;
        }
      }, "请输入有效的 HTTP 或 HTTPS 模型地址。"),
    model: z.string().trim().min(1, "请输入模型名。").max(200),
    key: z
      .string()
      .trim()
      .max(4000)
      .regex(/^[\x20-\x7E]*$/, "API Key 格式有误。")
      .optional(),
    clearKey: z.boolean().optional(),
  }),
]);

export async function POST(req: Request) {
  try {
    guardOrigin(req);
    await requireChild();
    const input = updateSchema.parse(await req.json());
    if (input.type === "mode") switchMode(input.caseMode);
    else saveModel(input);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}

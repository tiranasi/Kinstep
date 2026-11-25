import { readFile } from "node:fs/promises";
import path from "node:path";
import { dataDir, getState } from "@/lib/db";
import { failure, requireRole } from "@/lib/http";
import { AppError } from "@/lib/domain";
export const runtime = "nodejs";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole();
    const { id } = await params;
    if (!/^[a-f0-9-]{36}$/.test(id) || !getState().documents.some((d) => d.id === id))
      throw new AppError("没有找到这张照片。", 404);
    const b = await readFile(path.join(dataDir, "uploads", id));
    const mime = b[0] === 0xff ? "image/jpeg" : b[0] === 137 ? "image/png" : "image/webp";
    return new Response(b, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

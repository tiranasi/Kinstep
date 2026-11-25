import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { addDocument, dataDir, getMode, getState } from "@/lib/db";
import { extractImage } from "@/lib/assistant";
import { failure, guardOrigin, requireRole } from "@/lib/http";
import { AppError } from "@/lib/domain";
import { extractionSchema } from "@/lib/schema";
import { sampleExtraction } from "@/lib/samples";
import { readImage } from "@/lib/image-upload";
import type { DocKind, DocumentRecord } from "@/lib/types";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(req: Request) {
  try {
    guardOrigin(req);
    await requireRole();
    const { caseMode, modeVersion } = getMode();
    if (Number(req.headers.get("content-length")) > 12 * 1024 * 1024)
      throw new AppError("照片太大，请选择10MB以内的照片。", 413);
    const form = await req.formData(),
      file = form.get("image"),
      sample = form.get("sample"),
      manual = form.get("extraction");
    let buffer: Buffer | undefined,
      mime: string | null = null;
    if (file instanceof File) ({ buffer, mime } = await readImage(file));
    const kinds: DocKind[] = ["test_order", "report", "prescription", "receipt", "payment"];
    if (!sample && !manual && !buffer) throw new AppError("请先选择一张照片。");
    if (sample && !kinds.includes(sample as DocKind)) throw new AppError("没有找到这张示例单据。");
    if (sample && !caseMode) throw new AppError("请先开启案例模式。", 403);
    if (getMode().modeVersion !== modeVersion)
      throw new AppError("案例模式已切换，请重新操作。", 409);
    const fingerprint = createHash("sha256")
      .update(buffer || String(sample || manual))
      .digest("hex");
    const existing = getState().documents.find((d) => d.fingerprint === fingerprint);
    if (existing)
      return NextResponse.json({ document: existing, state: getState(), duplicate: true });
    const extraction = sample
      ? sampleExtraction(sample as DocKind)
      : manual
        ? extractionSchema.parse(JSON.parse(String(manual)))
        : await extractImage(buffer!, mime!, form.get("locale") === "en" ? "en" : "zh");
    const id = randomUUID();
    let url = sample ? `/samples/${sample}.svg` : "";
    if (buffer) {
      const folder = path.join(dataDir, "uploads");
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, id), buffer);
      url = `/api/documents/${id}`;
    }
    const doc: DocumentRecord = {
      id,
      fingerprint,
      url,
      filename: file instanceof File ? file.name : extraction.title,
      createdAt: new Date().toISOString(),
      provider: sample ? "sample" : manual ? "manual" : "deepseek",
      extraction,
      confirmedAt: null,
      applied: false,
    };
    const state = addDocument(doc, modeVersion);
    return NextResponse.json({
      document: state.documents.find((d) => d.fingerprint === fingerprint),
      state,
      duplicate: false,
    });
  } catch (e) {
    return failure(e);
  }
}

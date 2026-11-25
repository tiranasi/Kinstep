import { caseKinds, sampleExtraction } from "@/lib/samples";
import { getMode } from "@/lib/db";
import { failure, requireRole } from "@/lib/http";
import { translate } from "@/lib/translations";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ filename: string }> }) {
  try {
    await requireRole();
    const { filename } = await params;
    const kind = caseKinds.find((item) => filename === `${item}.svg`);
    if (!kind || !getMode().caseMode) return new Response("Not found", { status: 404 });
    const locale = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "zh";
    const t = (value: string) => translate(locale, value);
    const e = sampleExtraction(kind);
    const lines = [
      e.title,
      e.summary,
      e.location,
      e.notes,
      ...e.medicines.flatMap((m) => [
        m.name,
        m.strength,
        m.dose,
        m.route,
        m.frequency,
        m.instructions,
      ]),
    ]
      .filter(Boolean)
      .map(t);
    const escape = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="560"><rect width="640" height="560" fill="white"/><rect x="24" y="24" width="592" height="512" rx="10" fill="none" stroke="#dce4ee"/>${lines.map((line, i) => `<text x="52" y="${85 + i * 44}" font-family="sans-serif" font-size="${i === 0 ? 28 : 15}" fill="#26364e">${escape(line)}</text>`).join("")}</svg>`;
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}

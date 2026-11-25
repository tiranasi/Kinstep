import { NextResponse } from "next/server";
import { getMode, getState, mutate } from "@/lib/db";
import { aiConfigured } from "@/lib/assistant";
import { failure, guardOrigin, requireRole } from "@/lib/http";
import { actionSchema } from "@/lib/schema";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const role = await requireRole();
    return NextResponse.json(
      { role, state: getState(), aiConfigured: aiConfigured(), ...getMode() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    guardOrigin(req);
    const role = await requireRole();
    const body = z
      .object({ revision: z.number().int(), action: actionSchema })
      .parse(await req.json());
    return NextResponse.json({
      role,
      state: mutate(body.action, role, body.revision),
      aiConfigured: aiConfigured(),
      ...getMode(),
    });
  } catch (e) {
    return failure(e);
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSession, deleteSession, sessionRole } from "@/lib/db";
import { COOKIE, failure, guardOrigin } from "@/lib/http";
export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json(
    { role: sessionRole((await cookies()).get(COOKIE)?.value || "") },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req: Request) {
  try {
    guardOrigin(req);
    const { role } = z.object({ role: z.enum(["elder", "child"]) }).parse(await req.json());
    const token = createSession(role);
    const res = NextResponse.json({ role });
    res.cookies.set(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(req.url).protocol === "https:",
      path: "/",
      maxAge: 7 * 86400,
    });
    return res;
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    guardOrigin(req);
    deleteSession((await cookies()).get(COOKIE)?.value || "");
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(COOKIE);
    return res;
  } catch (e) {
    return failure(e);
  }
}

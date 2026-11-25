import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { sessionRole } from "./db";
import { AppError } from "./domain";
export const COOKIE = "jiuyi_session";
export async function requireRole() {
  const role = sessionRole((await cookies()).get(COOKIE)?.value || "");
  if (!role) throw new AppError("请先选择您的身份。", 401);
  return role;
}
export function guardOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host") || new URL(req.url).host;
  if (origin && new URL(origin).host !== host) throw new AppError("请从当前页面重新操作。", 403);
}
export function failure(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError)
    return NextResponse.json(
      { error: e.issues[0]?.message || "请检查填写内容。" },
      { status: 400 },
    );
  if (e instanceof SyntaxError)
    return NextResponse.json({ error: "内容格式有误，请重试。" }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: "操作未完成，请稍后重试。" }, { status: 500 });
}

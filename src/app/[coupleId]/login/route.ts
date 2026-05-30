import { NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ coupleId: string }> }
): Promise<Response> {
  const { coupleId } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get("t");

  if (!token) {
    return NextResponse.redirect(new URL(`/${coupleId}/expired`, url.origin));
  }

  const session = await validateSession(token);
  if (!session || session.coupleId !== coupleId) {
    return NextResponse.redirect(new URL(`/${coupleId}/expired`, url.origin));
  }

  const res = NextResponse.redirect(new URL(`/${coupleId}`, url.origin));
  res.cookies.set("cynna_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}

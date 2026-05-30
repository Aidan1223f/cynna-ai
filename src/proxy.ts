import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";

export const config = {
  matcher: ["/c_:path*"],
};

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Don't protect the login or expired routes themselves.
  if (pathname.endsWith("/login") || pathname.endsWith("/expired")) {
    return NextResponse.next();
  }

  // Extract coupleId from the first path segment.
  const coupleId = pathname.split("/")[1];
  if (!coupleId?.startsWith("c_")) return NextResponse.next();

  const token = req.cookies.get("cynna_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL(`/${coupleId}/expired`, req.url));
  }

  const session = await validateSession(token);
  if (!session || session.coupleId !== coupleId) {
    const res = NextResponse.redirect(new URL(`/${coupleId}/expired`, req.url));
    res.cookies.delete("cynna_session");
    return res;
  }

  return NextResponse.next();
}

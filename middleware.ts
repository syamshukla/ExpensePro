import { NextRequest, NextResponse } from "next/server";

// Password lock for the whole site (browser shows a sign-in box once per device).
export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    return new NextResponse("Set APP_PASSWORD in your Vercel project settings to open this app.", { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = auth.split(" ");
  if (scheme === "Basic" && encoded) {
    const pass = atob(encoded).split(":").slice(1).join(":");
    if (pass === password) return NextResponse.next();
  }
  return new NextResponse("Sign in required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Money Tracker"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

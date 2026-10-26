import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth";

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const bad = msg => new HttpError(400, msg);
export const forbidden = (msg = "You don't have access to this.") => new HttpError(403, msg);
export const notFound = (msg = "Not found.") => new HttpError(404, msg);

export function json(data, init) { return NextResponse.json(data, init); }

// Wrap a route handler: checks the session and the allowed roles, turns thrown errors into JSON.
export function route(roles, handler) {
  return async (request, ctx) => {
    try {
      const session = await getRequestSession(request);
      if (!session) throw new HttpError(401, "Please sign in again.");
      // A temporary password must be changed before anything else can be done.
      if (session.mcp && !/^\/api\/(auth|meta)(\/|$)/.test(new URL(request.url).pathname)) throw new HttpError(403, "Change your temporary password first (Account page).");
      if (roles && roles !== "*" && !roles.includes(session.role)) throw forbidden();
      const params = ctx && ctx.params ? await ctx.params : {};
      const res = await handler({ request, session, params, url: new URL(request.url) });
      return res instanceof Response ? res : NextResponse.json(res ?? { ok: true });
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      return NextResponse.json({ error: e.message || "Something went wrong." }, { status });
    }
  };
}
export async function body(request) { try { return await request.json(); } catch { return {}; } }

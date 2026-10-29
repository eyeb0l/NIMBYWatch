import { timingSafeEqual } from "node:crypto";

export function hasAdminAccess(request: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 24) return false;
  const actual =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

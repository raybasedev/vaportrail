export function requireBearerToken(request: Request, expected: string | undefined): Response | null {
  if (!expected) {
    return new Response("VAPORTRAIL_SECRET is not configured.", { status: 500 });
  }

  const header = request.headers.get("authorization");
  if (header !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
}

/** Bound streamed bodies even when Content-Length is absent or incorrect. */
export class BodyLimitError extends Error {}
export async function readJsonBody(
  request: Request,
  limit: number,
): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > limit) throw new BodyLimitError("Document too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Request body is required.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new BodyLimitError("Document too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

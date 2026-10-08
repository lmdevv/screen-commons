import { badRequest } from "../errors";
import { bodyLimitFor, readBodyLimited } from "./limits";

/** Body bytes, counted as they stream in against the path's limit (Content-Length isn't trusted). */
const readBody = (request: Request) =>
  readBodyLimited(request, bodyLimitFor(new URL(request.url).pathname));

export async function readJson(request: Request): Promise<unknown> {
  const text = new TextDecoder().decode(await readBody(request));
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("Request body must be JSON");
  }
}

export async function readForm(request: Request): Promise<FormData> {
  const body = await readBody(request);
  try {
    return await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    throw badRequest("Expected multipart/form-data with image, thumbnail and meta");
  }
}

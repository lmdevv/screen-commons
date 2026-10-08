/**
 * Every test request gets its own connection (`connection: close`). A pooled keep-alive socket
 * can be closed by the dev server's keep-alive timeout just as the next request is written to it,
 * which fails that request with "other side closed"; without reuse, that race can't happen.
 */
const fetchWithPool = globalThis.fetch;

globalThis.fetch = (input, init = {}) => {
  const headers = new Headers(
    init.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  headers.set("connection", "close");
  return fetchWithPool(input, { ...init, headers });
};

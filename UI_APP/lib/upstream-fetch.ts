function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isUpstreamConnectivityError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    code?: string;
    cause?: unknown;
    message?: string;
    name?: string;
  };
  const code = err.code ?? "";
  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "EHOSTUNREACH"
  ) {
    return true;
  }
  if (err.name === "AbortError") return true;
  if (err.cause) return isUpstreamConnectivityError(err.cause);
  const msg = typeof err.message === "string" ? err.message : "";
  return (
    msg.includes("fetch failed") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT")
  );
}

type FetchWithRetryOptions = {
  attempts?: number;
  backoffMs?: number[];
  timeoutMs?: number;
};

/**
 * fetch with short retries on transient network errors (parallel tile loads).
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchWithRetryOptions
): Promise<Response> {
  const attempts = options?.attempts ?? 3;
  const backoffMs = options?.backoffMs ?? [80, 200];
  const timeoutMs = options?.timeoutMs ?? 12000;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: init?.signal ?? controller.signal,
      });
      clearTimeout(timeoutId);
      return res;
    } catch (e) {
      clearTimeout(timeoutId);
      lastError = e;
      const isLast = attempt >= attempts - 1;
      if (!isUpstreamConnectivityError(e) || isLast) {
        throw e;
      }
      const delay = backoffMs[attempt] ?? backoffMs[backoffMs.length - 1] ?? 200;
      await sleep(delay);
    }
  }
  throw lastError;
}

export function upstreamUnavailableResponse(errorCode: string): Response {
  return Response.json({ error: errorCode }, { status: 503 });
}

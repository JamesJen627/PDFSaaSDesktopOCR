export type FetchLike = typeof fetch;

/** GET /health — healthy when JSON body contains `"status":"UP"`. */
export async function checkOcrServiceHealth(
  baseUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, "")}/health`;

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return false;
    }

    const body = (await response.json()) as { status?: string };
    return body.status === "UP";
  } catch {
    return false;
  }
}

/** GET /api/v1/info/status — healthy when JSON body contains `"status":"UP"`. */
export async function checkBackendHealth(
  baseUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/info/status`;

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return false;
    }

    const body = (await response.json()) as { status?: string };
    return body.status === "UP";
  } catch {
    return false;
  }
}

export interface PollUntilHealthyOptions {
  baseUrl: string;
  pollMs: number;
  timeoutMs: number;
  fetchImpl?: FetchLike;
  onPoll?: (attempt: number) => void;
}

/** Poll health endpoint until UP or timeout. */
export async function pollUntilHealthy(
  options: PollUntilHealthyOptions,
): Promise<boolean> {
  const { baseUrl, pollMs, timeoutMs, fetchImpl = fetch, onPoll } = options;
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    onPoll?.(attempt);

    if (await checkBackendHealth(baseUrl, fetchImpl)) {
      return true;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }

    await sleep(Math.min(pollMs, remaining));
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

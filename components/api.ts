export type ApiResult<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
};

function messageFromBody(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const err = record.error;
    // Canonical shape from lib/api.ts: { error: { code, message, details? } }
    if (err && typeof err === "object") {
      const message = (err as Record<string, unknown>).message;
      if (typeof message === "string" && message.trim()) return message;
    }
    if (typeof err === "string" && err.trim()) return err;
    const candidate = record.message;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  if (typeof body === "string" && body.trim()) return body;
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You are not authorized to view this data.";
  return `Request failed with status ${status}.`;
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiGet<T>(url: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const body = await parse(res);
    if (!res.ok) {
      return { ok: false, status: res.status, data: body as T, error: messageFromBody(body, res.status) };
    }
    return { ok: true, status: res.status, data: body as T };
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Could not reach the server. The backend may be unavailable.",
    };
  }
}

export async function apiPostJson<T>(url: string, payload: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await parse(res);
    if (!res.ok) {
      return { ok: false, status: res.status, data: body as T, error: messageFromBody(body, res.status) };
    }
    return { ok: true, status: res.status, data: body as T };
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Could not reach the server. The backend may be unavailable.",
    };
  }
}

/** Multipart upload. The browser sets the multipart boundary automatically. */
export async function apiUpload<T>(
  url: string,
  form: FormData,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
    });
    const body = await parse(res);
    if (!res.ok) {
      return { ok: false, status: res.status, data: body as T, error: messageFromBody(body, res.status) };
    }
    return { ok: true, status: res.status, data: body as T };
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Could not reach the server. The backend may be unavailable.",
    };
  }
}

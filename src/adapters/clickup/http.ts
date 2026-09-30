import { setTimeout as delay } from "node:timers/promises";

import { MIN_REQUEST_INTERVAL_MS } from "./mapping.js";

const API_BASE = "https://api.clickup.com/api/v2";

export class ClickUpApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = "ClickUpApiError";
    this.status = status;
    this.path = path;
  }
}

export type ClickUpQuery = Record<string, string | number | boolean | string[] | undefined>;

export interface ClickUpHttpOptions {
  token: string;
  fetchImpl?: typeof fetch;
  /** Spacing between requests. Default keeps a token under 100 requests/minute. */
  minIntervalMs?: number;
  maxRetries?: number;
}

/**
 * ClickUp REST v2 client. Authorization is the raw token, not a Bearer scheme.
 * Requests are spaced, and HTTP 429 responses honor Retry-After.
 */
export class ClickUpClient {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private nextAt = 0;
  private tail: Promise<void> = Promise.resolve();

  constructor(options: ClickUpHttpOptions) {
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.minIntervalMs = options.minIntervalMs ?? MIN_REQUEST_INTERVAL_MS;
    this.maxRetries = options.maxRetries ?? 4;
  }

  get<T>(path: string, query?: ClickUpQuery): Promise<T> {
    return this.request<T>("GET", path, query);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, undefined, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, undefined, body);
  }

  private request<T>(method: string, path: string, query?: ClickUpQuery, body?: unknown): Promise<T> {
    const url = buildUrl(path, query);
    const init: RequestInit = {
      method,
      headers: {
        Authorization: this.token,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    const run = this.tail.then(() => this.send<T>(url, path, init));
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async send<T>(url: string, path: string, init: RequestInit, attempt = 0): Promise<T> {
    const wait = this.nextAt - Date.now();
    if (wait > 0) await delay(wait);
    this.nextAt = Date.now() + this.minIntervalMs;

    const response = await this.fetchImpl(url, init);
    if (response.status === 429 && attempt < this.maxRetries) {
      await discard(response);
      const retryAfter = Number(response.headers.get("retry-after"));
      const pause = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : 1_000 * (attempt + 1);
      await delay(pause);
      this.nextAt = Date.now() + this.minIntervalMs;
      return this.send(url, path, init, attempt + 1);
    }
    if (response.status >= 500 && attempt < 2) {
      await discard(response);
      await delay(400 * (attempt + 1));
      this.nextAt = Date.now() + this.minIntervalMs;
      return this.send(url, path, init, attempt + 1);
    }

    const text = await response.text();
    if (!response.ok) {
      throw new ClickUpApiError(response.status, path, errorMessage(text, response.status));
    }
    if (!text.trim()) return {} as T;
    return JSON.parse(text) as T;
  }
}

function buildUrl(path: string, query?: ClickUpQuery): string {
  const url = new URL(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  if (!query) return url.toString();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
}

function errorMessage(text: string, status: number): string {
  if (!text.trim()) return `ClickUp request failed with HTTP ${status}.`;
  try {
    const parsed = JSON.parse(text) as { err?: unknown; error?: unknown; ECODE?: unknown };
    const detail = typeof parsed.err === "string" ? parsed.err : typeof parsed.error === "string" ? parsed.error : "";
    if (detail) return detail.slice(0, 500);
  } catch {
    // Fall through to the raw body.
  }
  return text.slice(0, 500);
}

async function discard(response: Response): Promise<void> {
  if (!response.body) return;
  await response.body.cancel().catch(() => undefined);
}

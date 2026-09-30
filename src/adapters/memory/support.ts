import { randomBytes } from "node:crypto";

import { StudioError } from "../../types/errors.js";
import type { Page } from "../../types/results.js";

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayUtc(): string {
  return nowIso().slice(0, 10);
}

export function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new StudioError("invalid", `${field} is required.`);
  return trimmed;
}

export function assertEmail(value: string, field: string): string {
  const trimmed = value.trim();
  if (!EMAIL.test(trimmed)) throw new StudioError("invalid", `${field} must be an email address.`);
  return trimmed;
}

export function assertDay(value: string, field: string): string {
  const match = DAY.exec(value.trim());
  if (!match) throw new StudioError("invalid", `${field} must be a YYYY-MM-DD date.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new StudioError("invalid", `${field} must be a real calendar date.`);
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function assertDateTime(value: string, field: string): string {
  const trimmed = value.trim();
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime()) || !/[T ]\d{2}:\d{2}/.test(trimmed)) {
    throw new StudioError("invalid", `${field} must be an ISO-8601 datetime.`);
  }
  return parsed.toISOString();
}

export function paginate<T>(items: T[], limit: number | undefined): Page<T> {
  const size = clampLimit(limit);
  return { items: items.slice(0, size), total: items.length };
}

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return 50;
  if (!Number.isFinite(limit)) return 50;
  return Math.min(200, Math.max(1, Math.floor(limit)));
}

export function sortByUpdatedDesc<T extends { updatedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.updatedAt.localeCompare(b.updatedAt));
}

export function includesFold(haystack: string | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function matchesAny(needle: string, fields: Array<string | undefined>): boolean {
  return fields.some((field) => includesFold(field, needle));
}

export function countBy<T extends string>(values: readonly T[], keys: readonly T[]): Record<T, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

export function assertPatch(input: object, ignored: readonly string[]): void {
  const provided = Object.entries(input).filter(
    ([key, value]) => !ignored.includes(key) && value !== undefined,
  );
  if (provided.length === 0) {
    throw new StudioError("invalid", "Provide at least one field to update.");
  }
}

export function withUpdates<T extends { updatedAt: string }>(
  current: T,
  patch: Partial<T>,
  keys: readonly (keyof T)[],
): T {
  const next = { ...current };
  for (const key of keys) {
    if (patch[key] !== undefined) next[key] = patch[key] as T[typeof key];
  }
  next.updatedAt = nowIso();
  return next;
}

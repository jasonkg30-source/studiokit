import { blankKey, normValue } from "./data";
import type { Filter, Row } from "./types";

/**
 * Precision used when comparing a numeric range filter.
 *
 * A range can be typed as `202601` while the column holds `2026-01`, or the
 * other way round. Comparing them as raw numbers turns the cell into NaN and
 * silently drops every row, so both ends and every cell are normalised onto
 * the same scale first.
 */
type Scale = 0 | 4 | 6 | 8; // raw number | YYYY | YYYYMM | YYYYMMDD

const SEPARATED = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/;

/** Picks the scale from how the bounds were written, not from the data. */
export function scaleOf(...bounds: (string | number | undefined | null)[]): Scale {
  for (const bound of bounds) {
    const text = String(bound ?? "").trim().replace(/[$,%\s]/g, "");
    if (!text) continue;
    const separated = text.match(SEPARATED);
    if (separated) return separated[3] ? 8 : 6;
    if (/^\d{8}$/.test(text)) return 8;
    if (/^\d{6}$/.test(text)) return 6;
    // A bare 4-digit number is a year only in a plausible range; 1000 is an amount.
    if (/^\d{4}$/.test(text) && Number(text) >= 1900 && Number(text) <= 2200) return 4;
    return 0;
  }
  return 0;
}

/** Maps a cell onto the filter's scale. NaN means the cell cannot be compared. */
export function toScale(value: unknown, scale: Scale): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return NaN;
    return reduce(value, scale);
  }
  const text = String(value ?? "").trim().replace(/[$,%\s]/g, "");
  if (!text) return NaN;
  const direct = Number(text);
  if (!Number.isNaN(direct)) return reduce(direct, scale);
  if (scale === 0) return NaN;
  const separated = text.match(SEPARATED);
  if (separated) {
    return pack(Number(separated[1]), Number(separated[2]), separated[3] ? Number(separated[3]) : 1, scale);
  }
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return NaN;
  const d = new Date(parsed);
  return pack(d.getFullYear(), d.getMonth() + 1, d.getDate(), scale);
}

/** A more precise number (20260115) compared on a coarser scale becomes 202601. */
function reduce(n: number, scale: Scale): number {
  if (scale === 6 && n >= 1e7) return Math.floor(n / 100);
  if (scale === 4 && n >= 1e6) return Math.floor(n / 10000);
  return n;
}

function pack(year: number, month: number, day: number, scale: Scale): number {
  if (scale === 8) return year * 10000 + month * 100 + day;
  if (scale === 6) return year * 100 + month;
  if (scale === 4) return year;
  return NaN;
}

const isBlank = (v: string | number | undefined | null) => v === undefined || v === null || String(v).trim() === "";

/**
 * Applies value and numeric-range filters; `skip` lets the year-over-year pass
 * ignore the date fields.
 */
export function applyFilters(rows: Row[], filters: Filter[], skip?: (field: string) => boolean): Row[] {
  let out = rows;
  for (const f of filters) {
    if (skip?.(f.field)) continue;
    const hasRange = !isBlank(f.min) || !isBlank(f.max);
    if (hasRange) {
      const scale = scaleOf(isBlank(f.min) ? f.max : f.min, isBlank(f.max) ? f.min : f.max);
      const lo = isBlank(f.min) ? null : toScale(f.min, scale);
      const hi = isBlank(f.max) ? null : toScale(f.max, scale);
      out = out.filter((r) => {
        const raw = r[f.field];
        if (raw === null || raw === undefined || raw === "") return false;
        const n = toScale(raw, scale);
        if (Number.isNaN(n)) return false;
        if (lo !== null && n < lo) return false;
        if (hi !== null && n > hi) return false;
        return true;
      });
      continue;
    }
    if (!f.values?.length) continue;
    const wanted = new Set(f.values.map(blankKey));
    out = out.filter((r) => wanted.has(normValue(r[f.field])));
  }
  return out;
}

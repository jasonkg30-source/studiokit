import type { DataSource, Report } from "./types";
import { QuotaError, rawBytes, readJSON, writeJSON } from "./storage";

export interface SavedTemplate {
  id: string;
  name: string;
  createdAt: number;
  report: Report;
  source: DataSource | null;
  /** Charts-only templates drop the rows when the dataset would blow the storage quota. */
  dataOmitted?: boolean;
}

const KEY = "studiokit.templates.v1";

export function listTemplates(): SavedTemplate[] {
  const parsed = readJSON<SavedTemplate[]>(KEY);
  return Array.isArray(parsed) ? parsed : [];
}

function persist(all: SavedTemplate[]) {
  writeJSON(KEY, all);
}

/**
 * Stores the current dashboard. Falls back to a layout-only template (pruning
 * the oldest saved ones if needed) so Save never fails silently on a big import.
 */
export function saveTemplate(name: string, report: Report, source: DataSource | null): SavedTemplate {
  const all = listTemplates();
  const cleanName = name.trim() || report.title || "Untitled template";
  const base: SavedTemplate = {
    id: crypto.randomUUID(),
    name: cleanName,
    createdAt: Date.now(),
    report: { ...report, title: cleanName },
    source,
  };
  const others = all.filter((t) => t.name !== cleanName);

  try {
    persist([base, ...others]);
    return base;
  } catch (e) {
    if (!(e instanceof QuotaError)) throw e;
  }

  const layoutOnly: SavedTemplate = { ...base, source: null, dataOmitted: true };
  let pool = [layoutOnly, ...others];
  while (pool.length) {
    try {
      persist(pool);
      return layoutOnly;
    } catch (e) {
      if (!(e instanceof QuotaError)) throw e;
      if (pool.length === 1) break;
      pool = pool.slice(0, pool.length - 1);
    }
  }
  throw new QuotaError("No room left for another template");
}

export function deleteTemplate(id: string) {
  persist(listTemplates().filter((t) => t.id !== id));
}

export function templateBytes(): number {
  return rawBytes(KEY);
}

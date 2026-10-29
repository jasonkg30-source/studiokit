import type { DataSource, Report } from "./types";

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
const MAX_BYTES = 4_000_000;

export function listTemplates(): SavedTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedTemplate[]) : [];
  } catch {
    return [];
  }
}

function persist(all: SavedTemplate[]) {
  localStorage.setItem(KEY, JSON.stringify(all));
}

/** Stores the current dashboard; drops the data when it would not fit in localStorage. */
export function saveTemplate(name: string, report: Report, source: DataSource | null): SavedTemplate {
  const all = listTemplates();
  const base: SavedTemplate = {
    id: crypto.randomUUID(),
    name: name.trim() || report.title || "Untitled template",
    createdAt: Date.now(),
    report: { ...report, title: name.trim() || report.title },
    source,
  };

  let dataOmitted = false;
  if (JSON.stringify(base).length > MAX_BYTES) {
    dataOmitted = true;
  }
  const entry: SavedTemplate = dataOmitted ? { ...base, source: null, dataOmitted } : base;

  const next = [entry, ...all.filter((t) => t.name !== entry.name)];
  persist(next);
  return entry;
}

export function deleteTemplate(id: string) {
  persist(listTemplates().filter((t) => t.id !== id));
}

export function renameTemplate(id: string, name: string) {
  persist(listTemplates().map((t) => (t.id === id ? { ...t, name } : t)));
}

export function templateBytes(): number {
  try {
    return new Blob([localStorage.getItem(KEY) ?? ""]).size;
  } catch {
    return 0;
  }
}

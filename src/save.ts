import type { DataSource, Report } from "./types";

export interface SavedReport {
  v: 1;
  savedAt: string;
  report: Report;
  source: DataSource | null;
}

export function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
}

export function reportFile(report: Report, source: DataSource | null): SavedReport {
  return { v: 1, savedAt: new Date().toISOString(), report, source };
}

/** Triggers a download of the whole dashboard: layout plus its data. */
export function downloadReport(report: Report, source: DataSource | null): void {
  const blob = new Blob([JSON.stringify(reportFile(report, source), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(report.title)}.studio.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Reads a .studio.json file back, rejecting anything without a report. */
export async function readReportFile(file: File): Promise<{ report: Report; source: DataSource | null }> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const data = parsed as Partial<SavedReport> & { report?: Report };
  if (!data?.report?.pages?.length) throw new Error("No dashboard found in that file.");
  return { report: data.report, source: (data.source as DataSource | null) ?? null };
}

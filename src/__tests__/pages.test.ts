import { describe, expect, it } from "vitest";
import { emptyReport, nextPageName, reducer, type UIState } from "../store";
import type { DataSource, Report, Row } from "../types";

const source: DataSource = {
  id: "src-1",
  name: "Orders",
  fields: [
    { name: "Customer", type: "string" },
    { name: "Amt", type: "number" },
  ],
  rows: [{ Customer: "A", Amt: 10 }] as Row[],
  origin: "csv",
};

const stateWith = (report: Report): UIState => ({
  report,
  source,
  selectedChartId: null,
  showAddMenu: false,
  showShare: false,
  showData: false,
  viewMode: false,
  locked: false,
});

describe("pages", () => {
  it("appends a page and makes it active", () => {
    const start = stateWith(emptyReport(source));
    const next = reducer(start, { type: "addPage" });
    expect(next.report.pages).toHaveLength(2);
    expect(next.report.activePageId).toBe(next.report.pages[1].id);
    expect(next.report.pages[1].name).toBe("Page 2");
  });

  it("keeps adding pages without touching existing ones", () => {
    let s = stateWith(emptyReport(source));
    s = reducer(s, { type: "addPage" });
    s = reducer(s, { type: "addChart", chartType: "scorecard" });
    const pageTwoId = s.report.activePageId;
    s = reducer(s, { type: "addPage" });
    expect(s.report.pages).toHaveLength(3);
    const pageTwo = s.report.pages.find((p) => p.id === pageTwoId);
    expect(pageTwo?.charts).toHaveLength(1);
    expect(s.report.pages[2].charts).toHaveLength(0);
  });

  it("puts a new chart on the active page only", () => {
    let s = stateWith(emptyReport(source));
    const firstPageId = s.report.activePageId;
    const firstPageCharts = s.report.pages[0].charts.length;
    s = reducer(s, { type: "addPage" });
    s = reducer(s, { type: "addChart", chartType: "bar" });
    expect(s.report.pages[0].id).toBe(firstPageId);
    expect(s.report.pages[0].charts).toHaveLength(firstPageCharts);
    expect(s.report.pages[1].charts).toHaveLength(1);
  });

  it("never deletes the last page", () => {
    const s = stateWith(emptyReport(source));
    expect(reducer(s, { type: "deletePage", id: s.report.activePageId }).report.pages).toHaveLength(1);
  });

  it("renames one page without touching the others or the active tab", () => {
    let s = stateWith(emptyReport(source));
    s = reducer(s, { type: "addPage" });
    const [first, second] = s.report.pages;
    const next = reducer(s, { type: "renamePage", id: second.id, name: "Revenue by region" });
    expect(next.report.pages[1].name).toBe("Revenue by region");
    expect(next.report.pages[0].name).toBe(first.name);
    expect(next.report.activePageId).toBe(second.id);
  });

  it("ignores a rename for a page that is not there", () => {
    const s = stateWith(emptyReport(source));
    const next = reducer(s, { type: "renamePage", id: "missing", name: "Nope" });
    expect(next.report.pages.map((p) => p.name)).toEqual(s.report.pages.map((p) => p.name));
  });

  it("survives a report saved before pages existed", () => {
    const legacy = { ...emptyReport(source), pages: undefined } as unknown as Report;
    const next = reducer({ ...stateWith(emptyReport(source)), report: legacy }, { type: "addPage" });
    expect(next.report.pages).toHaveLength(1);
  });
});

describe("nextPageName", () => {
  it("numbers after the highest page and skips taken names", () => {
    const pages = [
      { id: "1", name: "Orders", charts: [] },
      { id: "2", name: "Page 3", charts: [] },
    ];
    expect(nextPageName(pages)).toBe("Page 4");
    expect(nextPageName([{ id: "1", name: "Orders", charts: [] }])).toBe("Page 2");
  });
});

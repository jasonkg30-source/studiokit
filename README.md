# StudioKit

A browser-based dashboard builder modelled on Looker Studio: connect a CSV / Google Sheet,
drag fields into a chart, rearrange pages, and share a live read-only report with one link.

Live: **https://studiokit-app.web.app**

## Features

- **Data** — CSV upload, Excel workbooks (.xlsx/.xls/.xlsm, multi-sheet picker), pasted CSV, public Google Sheets (`/gviz/tq?tqx=out:csv`), or the built-in sample dataset. Types are inferred per column (string / number / date).
- **Visualizations** — scorecard, time series, area, bar, horizontal bar, stacked bar, pie, donut, scatter, table.
- **Chart settings** — dimensions and metrics with SUM / AVG / COUNT / MIN / MAX / COUNT DISTINCT, sorting, row limits, palette, legend, gridlines, width (12-col grid) and height.
- **Report** — multi-page tabs, global date-range filter, dimension filters, editable title.
- **View mode** — hides authoring panels; charts stay interactive.
- **Sharing** — the report definition and up to 800 data rows are LZ-compressed into the URL hash, so a shared link needs no backend or account. Also: JSON export and print-to-PDF.
- **Persistence** — the working copy is saved to `localStorage` in the editor's browser.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
```

## Deploy

Hosting is Firebase Hosting on the `studiokit-app` project (Spark / no-cost plan):

```bash
npm run build
firebase deploy --only hosting --project studiokit-app
```

The app is fully static — no Cloud Functions, no Firestore, no billing account.

## Templates

- **Order tracker** — the dashboard drawn in `docs/order-tracker-sketch.jpg`: KPI row (Amt, Qty TTC, SKU count, Orders), amount split by product type, an ORDER LIST table (ST PO#, Customer PO, order month, status, Amt, Qty) and a PRODUCT LIST table (SKU, item, type, Qty). Filters: Customer, Type, Region, Port, Status, plus the date range. The sample source is deterministic (64 orders / 152 lines), so screenshots stay stable.
- **Marketing sample** — 180 days × 4 regions × 5 channels of session/order/revenue data with a starter page.

## Structure

```
src/
  App.tsx                 layout, filters, canvas, top bar
  store.ts                report reducer + chart factory
  data.ts                 CSV parsing, type inference, aggregation, date windows
  types.ts                report / chart / data-source model
  components/
    ChartRenderer.tsx     Recharts + table + scorecard renderers
    LeftPanel.tsx         data source card, field list, quick charts
    RightPanel.tsx        per-chart configuration
    DataModal.tsx         CSV / paste / Google Sheets connectors
    ShareModal.tsx        compressed share link, export
docs/REA-NOTES.md         what was observed from Looker Studio and what was inferred
```

## Notes and limits

- Sheets import requires the sheet to be shared as "Anyone with the link → Viewer", and the browser must be able to reach Google (CORS).
- Share links embed data, so treat them as public. Links above ~100 KB may be truncated by chat apps; export JSON or print to PDF instead.
- Excel workbooks are parsed locally in the browser with SheetJS — nothing is uploaded to a server. Merged cells, formulas and pivot caches are read as their displayed values; charts/images inside a workbook are ignored.
- Aggregation runs client-side; dashboards comfortably handle tens of thousands of rows, not millions.

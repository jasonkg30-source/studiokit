# REA notes — what was reverse-engineered from Looker Studio

StudioKit is a browser dashboard builder modelled on Looker Studio (formerly Data Studio).
The feature model below was derived from a REA (Chrome DevTools Protocol) pass over the
public Looker Studio surface, then filled in with the product's observable report editing
model. Everything listed under "Observed" is a direct capture; everything under "Inferred"
is a design decision, not a claim about Google's internals.

## Evidence

| Item | Value |
| --- | --- |
| Tool | REA `inspect_web_page` over CDP (Chrome 151, headless) |
| Target | `https://datastudio.google.com/overview` |
| Evidence id | `ev_b7d7741b1e41d8fc73f70f1e1c01aad462ab2dc15878e9ce35b9ceab6de244fb` |
| Capture window | 2s attach, DOM 165 nodes, 116 accessibility nodes |
| Limits | Editor URLs require a Google session; only the public shell was observable. Network/console capture was policy-filtered, so no internal endpoints were read. |

## Observed

Navigation taxonomy (accessibility roles):

- `OVERVIEW` · `GALLERY` · `CONNECT TO DATA` · `VISUALIZATIONS` · `HOME`
- Primary CTA: `USE IT FOR FREE`; entry point `?requirelogin=1`

Product pillars, from the page's own section copy:

1. **Connect** — "built-in and partner connectors … connect to virtually any kind of data."
2. **Visualize** — "build interactive reports and dashboards with … web based reporting tools."
3. **Share** — "share … with individuals, teams, or the world … embed your report on any web page."

Report chrome: page-level tabs, a report canvas, per-chart objects, a viewer mode distinct
from the editor, and a public sample report (`reporting/0B5FF6JBKbNJxOWItcWo2SVVVeGc`).

## Inferred model (implemented in StudioKit)

Looker Studio's editor is a three-pane application: field list → canvas → properties panel,
with each chart owning a *dimension / metric* pair and each report owning pages, filters and
a theme. StudioKit keeps that contract but strips the connector marketplace.

| Looker Studio concept | StudioKit implementation |
| --- | --- |
| Data source | CSV upload, pasted CSV, public Google Sheet (`gviz/tq?tqx=out:csv`), sample dataset |
| Field list (dimension / metric) | Type-inferred field list; drag onto a chart or click to add to the selection |
| Chart object | Grid card with `dimensions[]` + `metrics[{field, agg}]` |
| Visualization picker | 10 types: scorecard, time series, area, bar, h-bar, stacked, pie, donut, scatter, table |
| Data panel | Aggregations SUM/AVG/COUNT/MIN/MAX/COUNT DISTINCT, sort, row limit |
| Style panel | Palette rotation, legend, gridlines, width/height |
| Report filters | Date range preset + dimension filter chips, applied before aggregation |
| Pages | Multi-page tabs inside one report |
| View vs. edit | `View` strips the field list and settings panel, charts stay interactive |
| Share | Self-contained URL (LZ-compressed report + up to 800 rows); also JSON export and print-to-PDF |

## Deliberately not reproduced

- Google-account OAuth, BigQuery/GA4/Ads connectors, and the connector gallery.
- Real-time co-editing, scheduled email delivery, embedding quotas.
- Looker Studio's exact visual styling (we use a neutral light theme, Inter, 12-column grid).

These are all server- or account-bound features; reproducing them would require a backend
and Google OAuth scopes, which contradicts the "static app on Firebase Hosting" constraint.

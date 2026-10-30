import { useState } from "react";
import { Database, FileSpreadsheet, Link2, Loader2, Sheet, Upload, X } from "lucide-react";
import { parseCsv, parseWorkbook, type Spreadsheet } from "../data";
import type { DataSource } from "../types";
import { listTemplates } from "../templates";

interface Props {
  onClose: () => void;
  onConnect: (source: DataSource, template: TemplateChoice) => string | null;
  onTemplate: (kind: "marketing" | "order") => void;
}

export type TemplateChoice = "auto" | "order" | "none" | `saved:${string}`;

export default function DataModal({ onClose, onConnect, onTemplate }: Props) {
  const [tab, setTab] = useState<"file" | "paste" | "sheets">("file");
  const [paste, setPaste] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [template, setTemplate] = useState<TemplateChoice>("auto");
  const [book, setBook] = useState<{ spreadsheet: Spreadsheet; fileName: string } | null>(null);
  const saved = listTemplates();

  /** Applies the chosen template; keeps the modal open when it cannot be used. */
  const finish = (source: DataSource) => {
    const message = onConnect(source, template);
    if (message) {
      setError(message);
      return false;
    }
    onClose();
    return true;
  };

  const handleFile = async (file: File) => {
    setError("");
    setBusy(true);
    try {
      const base = file.name.replace(/\.[^.]+$/, "");
      if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        const spreadsheet = await parseWorkbook(file, base);
        if (spreadsheet.sheets.length > 1) {
          setBook({ spreadsheet, fileName: base });
        } else {
          finish(spreadsheet.read(spreadsheet.sheets[0]));
        }
      } else {
        const text = await file.text();
        const source = parseCsv(text, base, "csv");
        if (!source.rows.length) throw new Error("No rows found in this file.");
        finish(source);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse this file.");
    } finally {
      setBusy(false);
    }
  };

  const importSheet = (sheetName: string) => {
    if (!book) return;
    try {
      finish(book.spreadsheet.read(sheetName));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that sheet.");
    }
  };

  const connectPaste = () => {
    setError("");
    if (!paste.trim()) return setError("Paste some CSV first.");
    try {
      const source = parseCsv(paste, "Pasted data", "paste");
      if (!source.rows.length) throw new Error("No rows found.");
      finish(source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse pasted text.");
    }
  };

  const connectSheets = async () => {
    setError("");
    setBusy(true);
    try {
      const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) throw new Error("Paste a Google Sheets URL that contains /spreadsheets/d/<id>.");
      const csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error("Sheet is not public. Share it as “Anyone with the link → Viewer” and try again.");
      const text = await res.text();
      const source = parseCsv(text, "Google Sheet", "sheets");
      if (!source.rows.length) throw new Error("The sheet is empty or the first sheet has no data.");
      finish(source);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that sheet (browser CORS/visibility limits).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>Add data</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="template-pick">
          <span className="template-pick-label">Template for this data</span>
          <select
            className="select slim"
            value={template}
            onChange={(e) => setTemplate(e.target.value as TemplateChoice)}
            aria-label="Template for this data"
          >
            <option value="auto">Auto — match my columns</option>
            <option value="order">Order tracker</option>
            <option value="none">Blank canvas</option>
            {saved.length > 0 && (
              <optgroup label="Saved templates">
                {saved.map((tpl) => (
                  <option key={tpl.id} value={`saved:${tpl.id}`}>
                    {tpl.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <span className="template-pick-hint">
            {template === "none"
              ? "Columns stay as they are; you build the charts yourself."
              : template.startsWith("saved:")
                ? "Reuses your saved layout. Charts that need columns missing from this file are dropped."
                : "Order tracker reads Amt, Qty, SKU, Item, Type, Customer, Region, Order Date, Status — other columns are ignored."}
          </span>
        </div>

        <div className="tabs">
          <button className={tab === "file" ? "active" : ""} onClick={() => setTab("file")}>
            <Upload size={13} /> CSV / Excel
          </button>
          <button className={tab === "paste" ? "active" : ""} onClick={() => setTab("paste")}>
            <FileSpreadsheet size={13} /> Paste
          </button>
          <button className={tab === "sheets" ? "active" : ""} onClick={() => setTab("sheets")}>
            <Link2 size={13} /> Google Sheets
          </button>
        </div>

        {tab === "file" && !book && (
          <label
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
          >
            {busy ? <Loader2 size={22} className="spin" /> : <Upload size={22} />}
            <strong>{busy ? "Reading file…" : "Drop a CSV or Excel file here"}</strong>
            <span>.csv · .xlsx · .xls · .xlsm — or click to browse</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        )}

        {tab === "file" && book && (
          <div className="sheet-picker">
            <div className="sheet-picker-head">
              <Sheet size={14} />
              <span>
                <strong>{book.fileName}</strong> has {book.spreadsheet.sheets.length} sheets — pick one to import
              </span>
            </div>
            <div className="sheet-list">
              {book.spreadsheet.sheets.map((s) => (
                <button key={s} className="sheet-item" onClick={() => importSheet(s)}>
                  <FileSpreadsheet size={14} />
                  <span>{s}</span>
                  <span className="sheet-import">Import</span>
                </button>
              ))}
            </div>
            <button className="btn ghost" onClick={() => setBook(null)}>
              Choose a different file
            </button>
          </div>
        )}

        {tab === "paste" && (
          <>
            <textarea
              className="textarea"
              rows={9}
              placeholder={"date,channel,revenue\n2026-10-01,Organic,1240\n2026-10-02,Paid,980"}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <button className="btn primary" onClick={connectPaste}>
              Use pasted data
            </button>
          </>
        )}

        {tab === "sheets" && (
          <>
            <input
              className="text-input"
              placeholder="https://docs.google.com/spreadsheets/d/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="hint">The sheet must be shared publicly (Anyone with the link → Viewer). The first tab is imported.</p>
            <button className="btn primary" onClick={connectSheets} disabled={busy}>
              {busy ? "Loading…" : "Connect sheet"}
            </button>
          </>
        )}

        {error && <div className="error-box">{error}</div>}

        {tab === "file" && (
          <div className="template-strip">
            <span className="template-label">Or start from a template</span>
            <div className="template-buttons">
              <button className="btn ghost slim" onClick={() => onTemplate("order")}>
                <Sheet size={13} /> Order tracker
              </button>
              <button className="btn ghost slim" onClick={() => onTemplate("marketing")}>
                <Database size={13} /> Marketing sample
              </button>
            </div>
          </div>
        )}

        <div className="modal-foot">
          <span>Excel: first row becomes the header; real date cells import as dates.</span>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Database, FileSpreadsheet, Link2, Upload, X } from "lucide-react";
import { parseCsv, sampleDataSource } from "../data";
import type { DataSource } from "../types";

interface Props {
  onClose: () => void;
  onConnect: (source: DataSource) => void;
}

export default function DataModal({ onClose, onConnect }: Props) {
  const [tab, setTab] = useState<"csv" | "paste" | "sheets">("csv");
  const [paste, setPaste] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const connectSample = () => {
    onConnect(sampleDataSource());
    onClose();
  };

  const handleFile = async (file: File) => {
    setError("");
    const text = await file.text();
    try {
      const source = parseCsv(text, file.name.replace(/\.[^.]+$/, ""), "csv");
      if (!source.rows.length) throw new Error("No rows found in this file.");
      onConnect(source);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse this file.");
    }
  };

  const connectPaste = () => {
    setError("");
    if (!paste.trim()) return setError("Paste some CSV first.");
    try {
      const source = parseCsv(paste, "Pasted data", "paste");
      if (!source.rows.length) throw new Error("No rows found.");
      onConnect(source);
      onClose();
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
      onConnect(source);
      onClose();
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

        <div className="tabs">
          <button className={tab === "csv" ? "active" : ""} onClick={() => setTab("csv")}>
            <Upload size={13} /> CSV file
          </button>
          <button className={tab === "paste" ? "active" : ""} onClick={() => setTab("paste")}>
            <FileSpreadsheet size={13} /> Paste
          </button>
          <button className={tab === "sheets" ? "active" : ""} onClick={() => setTab("sheets")}>
            <Link2 size={13} /> Google Sheets
          </button>
        </div>

        {tab === "csv" && (
          <label className="dropzone">
            <Upload size={22} />
            <strong>Drop a CSV here</strong>
            <span>or click to browse · max ~20 MB</span>
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>
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
            <p className="hint">
              The sheet must be shared publicly (Anyone with the link → Viewer). The first tab is imported.
            </p>
            <button className="btn primary" onClick={connectSheets} disabled={busy}>
              {busy ? "Loading…" : "Connect sheet"}
            </button>
          </>
        )}

        {error && <div className="error-box">{error}</div>}

        <div className="modal-foot">
          <span>No data yet?</span>
          <button className="btn ghost" onClick={connectSample}>
            <Database size={14} /> Load sample dataset
          </button>
        </div>
      </div>
    </div>
  );
}

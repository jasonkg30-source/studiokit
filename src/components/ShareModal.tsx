import { useMemo, useState } from "react";
import { Copy, Download, FileUp, Link2, Printer, X } from "lucide-react";
import { compressToEncodedURIComponent } from "lz-string";
import type { DataSource, Report } from "../types";
import { downloadReport, readReportFile } from "../save";

const MAX_ROWS = 2000;

interface Props {
  report: Report;
  source: DataSource | null;
  onClose: () => void;
  readOnly: boolean;
  onImport: (data: { report: Report; source: DataSource | null }) => void;
}

function encodePayload(report: Report, source: DataSource | null): string {
  const payload = {
    r: report,
    s: source
      ? {
          ...source,
          rows: source.rows.slice(0, MAX_ROWS),
        }
      : null,
  };
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

export default function ShareModal({ report, source, onClose, readOnly, onImport }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const link = useMemo(() => {
    try {
      const token = encodePayload(report, source);
      return `${window.location.origin}${window.location.pathname}#r=${token}`;
    } catch {
      return "";
    }
  }, [report, source]);

  const truncated = (source?.rows.length ?? 0) > MAX_ROWS;
  const sizeKb = Math.round(new TextEncoder().encode(link).length / 1024);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const el = document.createElement("textarea");
      el.value = link;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const pickFile = async (file: File) => {
    setError("");
    try {
      onImport(await readReportFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>Save &amp; share</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <p className="hint">
          The link carries the dashboard and{source ? ` up to ${MAX_ROWS.toLocaleString()} rows` : " its layout"} inside the
          URL — no account needed, and anyone who opens it gets a read-only view.
        </p>

        <div className="share-row">
          <input className="text-input mono" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn primary" onClick={copy} disabled={!link}>
            <Copy size={14} /> {copied ? "Copied" : "Copy link"}
          </button>
        </div>

        <div className="share-meta">
          <span className={`pill ${sizeKb > 8 ? "warn" : ""}`}>
            <Link2 size={12} /> {sizeKb.toLocaleString()} KB link
          </span>
          {truncated && <span className="pill warn">First {MAX_ROWS.toLocaleString()} rows only</span>}
          {sizeKb > 8 && <span className="pill warn">Chat apps cut long links — send the saved file instead</span>}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={() => downloadReport(report, source)}>
            <Download size={14} /> Save dashboard file
          </button>
          <label className="btn ghost file-btn">
            <FileUp size={14} /> Open saved file
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickFile(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <button className="btn ghost" onClick={() => window.print()}>
            <Printer size={14} /> Print / PDF
          </button>
          {!readOnly && <span className="hint">Saved automatically in this browser too.</span>}
        </div>

        {error && <div className="error-box">{error}</div>}
      </div>
    </div>
  );
}

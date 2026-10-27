import { useMemo, useState } from "react";
import { Copy, Download, Link2, Printer, X } from "lucide-react";
import { compressToEncodedURIComponent } from "lz-string";
import type { DataSource, Report } from "../types";

interface Props {
  report: Report;
  source: DataSource | null;
  onClose: () => void;
  readOnly: boolean;
}

function encodePayload(report: Report, source: DataSource | null): string {
  const payload = {
    r: report,
    s: source
      ? {
          ...source,
          rows: source.rows.slice(0, 800),
        }
      : null,
  };
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

export default function ShareModal({ report, source, onClose, readOnly }: Props) {
  const [copied, setCopied] = useState(false);

  const link = useMemo(() => {
    try {
      const token = encodePayload(report, source);
      return `${window.location.origin}${window.location.pathname}#r=${token}`;
    } catch {
      return "";
    }
  }, [report, source]);

  const truncated = (source?.rows.length ?? 0) > 800;
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

  const download = () => {
    const blob = new Blob([JSON.stringify({ report, source }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${report.title.replace(/\s+/g, "-").toLowerCase() || "report"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>Share report</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <p className="hint">
          The link embeds the report definition{source ? " and up to 2,000 data rows" : ""} directly in the URL — no
          account or backend required. Anyone with the link sees a read-only view.
        </p>

        <div className="share-row">
          <input className="text-input mono" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn primary" onClick={copy} disabled={!link}>
            <Copy size={14} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="share-meta">
          <span className={`pill ${sizeKb > 100 ? "warn" : ""}`}>
            <Link2 size={12} /> {sizeKb.toLocaleString()} KB link
          </span>
          {truncated && <span className="pill warn">First 800 rows only</span>}
          {sizeKb > 100 && <span className="pill warn">May exceed URL limits — use export instead</span>}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={() => window.print()}>
            <Printer size={14} /> Print / save PDF
          </button>
          <button className="btn ghost" onClick={download}>
            <Download size={14} /> Export JSON
          </button>
          {!readOnly && <span className="hint">Editing link is private to this browser.</span>}
        </div>
      </div>
    </div>
  );
}

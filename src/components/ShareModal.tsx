import { useMemo, useState } from "react";
import { Copy, Download, FileUp, Link2, Lock, Printer, X } from "lucide-react";
import { compressToEncodedURIComponent } from "lz-string";
import type { DataSource, Report } from "../types";
import { downloadReport, readReportFile } from "../save";
import { createShare } from "../shortlink";

const PASSWORD_MIN = 4;

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
  const [shortCopied, setShortCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [short, setShort] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pwMode, setPwMode] = useState(false);
  const [shortPw, setShortPw] = useState(false);

  const link = useMemo(() => {
    try {
      const token = encodePayload(report, source);
      return `${window.location.origin}${window.location.pathname}#r=${token}`;
    } catch {
      return "";
    }
  }, [report, source]);

  const payloadJson = useMemo(() => {
    const payload = {
      r: report,
      s: source ? { ...source, rows: source.rows.slice(0, MAX_ROWS) } : null,
    };
    return JSON.stringify(payload);
  }, [report, source]);

  const makeShort = async () => {
    setError("");
    if (pwMode && pw.trim().length < PASSWORD_MIN) {
      setError(`Use at least ${PASSWORD_MIN} characters.`);
      return;
    }
    setBusy(true);
    try {
      const { id, key } = await createShare(payloadJson, pwMode ? pw : undefined);
      const base = `${window.location.origin}${window.location.pathname}#s=${id}`;
      setShort(key ? `${base}&k=${key}` : base);
      setShortPw(!key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the link.");
    } finally {
      setBusy(false);
    }
  };

  const copyShort = async () => {
    if (!short) return;
    try {
      await navigator.clipboard.writeText(short);
    } catch {
      const el = document.createElement("textarea");
      el.value = short;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setShortCopied(true);
    setTimeout(() => setShortCopied(false), 1800);
  };

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
          Short links store the dashboard encrypted, so the server only ever holds scrambled data. Without a password
          the key rides in the link itself; with a password the key is derived from it and the link stays bare.
        </p>

        <div className="share-mode">
          <label className={`mode-card ${!pwMode ? "on" : ""}`}>
            <input type="radio" checked={!pwMode} onChange={() => setPwMode(false)} />
            <span>
              <strong>Anyone with the link</strong>
              <em>Key is inside the link — 99 char URL, no typing for the team.</em>
            </span>
          </label>
          <label className={`mode-card ${pwMode ? "on" : ""}`}>
            <input type="radio" checked={pwMode} onChange={() => setPwMode(true)} />
            <span>
              <strong>Password</strong>
              <em>Shortest link — the team types a shared password to open it.</em>
            </span>
          </label>
        </div>

        {pwMode && (
          <div className="share-row">
            <input
              className="text-input"
              type="password"
              placeholder="Team password (min 4 characters)"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
            />
            <span className="hint"><Lock size={12} /> never stored</span>
          </div>
        )}

        <div className="share-row">
          <input
            className="text-input mono"
            readOnly
            value={short ?? link}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button className="btn primary" onClick={short ? copyShort : copy} disabled={!link}>
            <Copy size={14} /> {short ? (shortCopied ? "Copied" : "Copy link") : copied ? "Copied" : "Copy long link"}
          </button>
        </div>

        <div className="share-row">
          <button className="btn ghost" onClick={makeShort} disabled={busy || !link}>
            {pwMode ? <Lock size={14} /> : <Link2 size={14} />}{" "}
            {busy ? "Encrypting…" : short ? "Make another link" : pwMode ? "Create password link" : "Create short link"}
          </button>
          {short && (
            <span className="hint">
              {(short.length).toLocaleString()} chars · {shortPw ? "password required" : "key in the link"}
            </span>
          )}
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

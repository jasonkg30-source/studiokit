import { useMemo, useState } from "react";
import { Bookmark, Download, Trash2, X } from "lucide-react";
import { deleteTemplate, listTemplates, saveTemplate, templateBytes, type SavedTemplate } from "../templates";
import { downloadReport } from "../save";
import type { DataSource, Report } from "../types";

interface Props {
  report: Report;
  source: DataSource | null;
  onApply: (tpl: SavedTemplate) => void;
  onClose: () => void;
}

const when = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
  " " +
  new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export default function TemplateModal({ report, source, onApply, onClose }: Props) {
  const [name, setName] = useState(report.title);
  const [items, setItems] = useState<SavedTemplate[]>(() => listTemplates());
  const [flash, setFlash] = useState("");

  const used = useMemo(() => {
    const bytes = templateBytes();
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }, [items]);

  const save = () => {
    try {
      const entry = saveTemplate(name || report.title, report, source);
      setItems(listTemplates());
      setFlash(entry.dataOmitted ? `Saved “${entry.name}” — layout only, data was too large` : `Saved “${entry.name}” in this browser`);
    } catch {
      setFlash("Save failed — browser storage is full. Delete an old template first.");
    }
  };

  const remove = (id: string) => {
    deleteTemplate(id);
    setItems(listTemplates());
    setFlash("Template deleted");
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>Templates</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="tpl-save">
          <input
            className="text-input"
            value={name}
            placeholder="Template name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <button className="btn primary" onClick={save}>
            <Bookmark size={14} /> Save current
          </button>
        </div>
        <p className="hint">Keeps pages, chart sizes, filters and the imported rows — stored in this browser, no download.</p>

        {flash && <div className="tpl-flash">{flash}</div>}

        <div className="tpl-list">
          {items.length === 0 && <div className="tpl-empty">No saved templates yet.</div>}
          {items.map((t) => (
            <div key={t.id} className="tpl-row">
              <div className="tpl-row-main">
                <strong>{t.name}</strong>
                <span className="tpl-meta">
                  {t.report.pages.length} page{t.report.pages.length > 1 ? "s" : ""} ·{" "}
                  {t.report.pages.reduce((n, p) => n + p.charts.length, 0)} charts ·{" "}
                  {t.source ? `${t.source.rows.length.toLocaleString()} rows` : t.dataOmitted ? "layout only" : "no data"} · {when(t.createdAt)}
                </span>
              </div>
              <button className="btn ghost slim" onClick={() => onApply(t)}>
                Apply
              </button>
              <button className="icon-btn" onClick={() => remove(t.id)} title="Delete template" aria-label="Delete template">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="modal-foot tpl-foot">
          <span>{used} stored of ~5 MB</span>
          <button className="link-btn" onClick={() => downloadReport(report, source)}>
            <Download size={12} /> Export .studio.json
          </button>
        </div>
      </div>
    </div>
  );
}

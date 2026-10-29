import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

interface Props {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

/** Checkbox dropdown so one filter can hold several values at once. */
export default function MultiSelect({ options, selected, onChange, placeholder = "All" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  // Clicks that land in the same tick must not clobber each other, so toggle
  // against the newest selection we handed out rather than the render snapshot.
  const live = useRef<string[]>(selected);
  useEffect(() => {
    live.current = selected;
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return list.slice(0, 400);
  }, [options, query]);

  const toggle = (value: string) => {
    const cur = live.current;
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    live.current = next;
    onChange(next);
  };

  const label = selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <div className="ms" ref={box}>
      <button type="button" className={`ms-btn ${open ? "active" : ""}`} onClick={() => setOpen((v) => !v)} title={selected.join(", ")}>
        <span className="ms-label">{label}</span>
        {selected.length > 1 && <span className="ms-count">{selected.length}</span>}
        <ChevronDown size={12} className="muted" />
      </button>

      {open && (
        <div className="ms-pop">
          <label className="ms-search">
            <Search size={12} />
            <input
              autoFocus
              value={query}
              placeholder="Search values"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && shown.length === 1) toggle(shown[0]);
              }}
            />
          </label>

          <div className="ms-list">
            {shown.length === 0 && <div className="ms-empty">No matching values</div>}
            {shown.map((value) => {
              const on = selected.includes(value);
              return (
                <div
                  key={value}
                  className={`ms-item ${on ? "on" : ""}`}
                  onClick={() => toggle(value)}
                  role="checkbox"
                  aria-checked={on}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(value);
                    }
                  }}
                >
                  <span className="ms-check">{on && <Check size={10} />}</span>
                  <span className="ms-value">{value || "(blank)"}</span>
                </div>
              );
            })}
          </div>

          <div className="ms-foot">
            <button type="button" className="link-btn" onClick={() => onChange([])}>
              Clear
            </button>
            <button type="button" className="link-btn" onClick={() => onChange([...options])}>
              Select all
            </button>
            <span>{selected.length ? `${selected.length}/${options.length}` : `${options.length} values`}</span>
          </div>
        </div>
      )}
    </div>
  );
}

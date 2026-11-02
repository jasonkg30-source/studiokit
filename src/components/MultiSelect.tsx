import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

interface Props {
  /** Values to choose from. Prefer getOptions: large fields are only computed when opened. */
  options?: string[];
  getOptions?: () => string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

const ITEM_H = 27;
const LIST_H = 230;
const BUFFER = 6;

/** Checkbox dropdown so one filter can hold several values at once. */
export default function MultiSelect({ options: staticOptions, getOptions, selected, onChange, placeholder = "All" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
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

  // Opening the list is what triggers the (potentially expensive) distinct scan.
  const options = useMemo(
    () => (open ? (getOptions ? getOptions() : staticOptions ?? []) : staticOptions ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, getOptions],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // Only paint the rows inside the scroll viewport, so 10k values stay smooth.
  const first = Math.max(0, Math.floor(scrollTop / ITEM_H) - BUFFER);
  const last = Math.min(shown.length, Math.ceil((scrollTop + LIST_H) / ITEM_H) + BUFFER);
  const visible = shown.length > 60 ? shown.slice(first, last) : shown;
  const padTop = shown.length > 60 ? first * ITEM_H : 0;
  const padBottom = shown.length > 60 ? Math.max(0, (shown.length - last) * ITEM_H) : 0;

  const toggle = (value: string) => {
    const cur = live.current;
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    live.current = next;
    onChange(next);
  };

  // "Select all" respects the search box: it only touches what is on screen.
  const allShownSelected = shown.length > 0 && shown.every((v) => selected.includes(v));
  const toggleAll = () => {
    if (allShownSelected) {
      onChange(selected.filter((v) => !shown.includes(v)));
      return;
    }
    onChange(Array.from(new Set([...selected, ...shown])));
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
              onChange={(e) => {
                setQuery(e.target.value);
                setScrollTop(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && shown.length === 1) toggle(shown[0]);
              }}
            />
          </label>

          <div
            className="ms-list"
            style={{ maxHeight: LIST_H }}
            onScroll={(e) => setScrollTop((e.target as HTMLElement).scrollTop)}
          >
            {shown.length === 0 && <div className="ms-empty">No matching values</div>}
            {padTop > 0 && <div style={{ height: padTop }} />}
            {visible.map((value) => {
              const on = selected.includes(value);
              return (
                <div
                  key={value}
                  className={`ms-item ${on ? "on" : ""}`}
                  style={{ height: ITEM_H }}
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
            {padBottom > 0 && <div style={{ height: padBottom }} />}
          </div>

          <div className="ms-foot">
            <button type="button" className="link-btn" onClick={() => onChange([])}>
              Clear
            </button>
            <button type="button" className="link-btn" onClick={toggleAll}>
              {allShownSelected ? "Deselect" : "Select all"}
              {query.trim() ? " matches" : ""}
            </button>
            <span>
              {selected.length ? `${selected.length}/${options.length}` : `${options.length} values`}
              {query.trim() && shown.length !== options.length ? ` · ${shown.length} match` : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

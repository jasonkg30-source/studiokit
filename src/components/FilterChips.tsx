import { Calendar, Hash, List, Plus, X } from "lucide-react";
import { defaultFilterMode } from "../filters";
import type { FieldType, Filter } from "../types";
import MultiSelect from "./MultiSelect";

/** Month/period columns are often imported as plain text, so the calendar is
 *  offered on the name too, not only on a `date` type. */
const DATEISH_NAME = /(^|[^a-z])(month|date|year|period|day)([^a-z]|$)/i;

export interface FilterField {
  name: string;
  type: FieldType;
  kind: "text" | "number" | "date";
}

interface Props {
  filters: Filter[];
  fields: FilterField[];
  /** Values offered by a picker, already narrowed by the sibling filters. */
  optionsFor: (field: string, picked: string[]) => string[];
  /** Whether the column has empty cells, so the range chip offers "(blank)". */
  hasBlanks: (field: string) => boolean;
  onChange: (next: Filter[]) => void;
  disabled?: boolean;
  /** Render the trailing "+ Filter" button. Off on read-only shares. */
  allowAdd?: boolean;
}

/**
 * The filter chips themselves, with no bar around them: the page filter bar and
 * a card's own filter editor render the same control, so a card can never drift
 * into a second, subtly different filter UI.
 */
export function FilterChips({ filters, fields, optionsFor, hasBlanks, onChange, disabled, allowAdd }: Props) {
  return (
    <>
      {filters.map((f, i) => {
        const field = fields.find((d) => d.name === f.field);
        const kind = field?.kind ?? "text";
        // Identifier numbers (SKU, PO#) open as a list; any number can be
        // switched either way, and the choice rides along with the report.
        const mode = f.mode ?? (field ? defaultFilterMode(field) : "values");
        const dateInput = kind === "date" || (kind === "text" && DATEISH_NAME.test(f.field));
        const blanks = hasBlanks(f.field);

        return (
          <div className="filter-group" key={i}>
            {/* The picker is sized to the name it shows, not to the longest
                option in the list: every filter can name a different field. */}
            <span className="filter-name">
              <span className="filter-name-text" aria-hidden="true">
                {f.field}
              </span>
              <select
                className="select slim"
                value={f.field}
                disabled={disabled}
                title={disabled ? "Filters are fixed here" : f.field}
                onChange={(e) => {
                  const next = [...filters];
                  next[i] = { field: e.target.value, values: [] };
                  onChange(next);
                }}
              >
                {fields.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </span>
            {(kind === "number" || dateInput) && (
              <button
                className="filter-mode"
                disabled={disabled}
                aria-label={
                  mode === "range"
                    ? "Filter by values instead"
                    : dateInput
                      ? "Filter by date range instead"
                      : "Filter by number range instead"
                }
                title={
                  mode === "range"
                    ? `${dateInput ? "Date" : "Number"} range — switch to picking values`
                    : dateInput
                      ? "Picking values — switch to a date range"
                      : "Picking values — switch to a number range"
                }
                onClick={() => {
                  const next = [...filters];
                  next[i] =
                    mode === "range"
                      ? { field: f.field, values: [], mode: "values" }
                      : { field: f.field, values: [], min: "", max: "", mode: "range", blank: false };
                  onChange(next);
                }}
              >
                {mode === "range" ? <List size={12} /> : dateInput ? <Calendar size={12} /> : <Hash size={12} />}
              </button>
            )}
            {mode === "range" ? (
              <div className="filter-range">
                <input
                  className={`text-input slim ${dateInput ? "date" : "num"}`}
                  type={dateInput ? "date" : "number"}
                  inputMode={dateInput ? undefined : "decimal"}
                  placeholder={dateInput ? undefined : "min"}
                  aria-label={dateInput ? "From date" : "Minimum"}
                  value={f.min ?? ""}
                  onChange={(e) => {
                    const next = [...filters];
                    next[i] = { ...f, min: e.target.value };
                    onChange(next);
                  }}
                />
                <span className="range-dash">–</span>
                <input
                  className={`text-input slim ${dateInput ? "date" : "num"}`}
                  type={dateInput ? "date" : "number"}
                  inputMode={dateInput ? undefined : "decimal"}
                  placeholder={dateInput ? undefined : "max"}
                  aria-label={dateInput ? "To date" : "Maximum"}
                  value={f.max ?? ""}
                  onChange={(e) => {
                    const next = [...filters];
                    next[i] = { ...f, max: e.target.value };
                    onChange(next);
                  }}
                />
                {/* Blank belongs to this one column: it is part of the range
                    control, never a global switch. */}
                {blanks && (
                  <label className="range-blank" title={`Include rows where ${f.field} is empty`}>
                    <input
                      type="checkbox"
                      checked={!!f.blank}
                      onChange={(e) => {
                        const next = [...filters];
                        next[i] = { ...f, blank: e.target.checked };
                        onChange(next);
                      }}
                    />
                    incl. blank
                  </label>
                )}
              </div>
            ) : (
              <MultiSelect
                getOptions={() => optionsFor(f.field, f.values)}
                selected={f.values}
                placeholder="All"
                onChange={(nextValues) => {
                  const next = [...filters];
                  next[i] = { ...f, values: nextValues };
                  onChange(next);
                }}
              />
            )}
            {!disabled && (
              <button
                className="icon-btn"
                title="Remove filter"
                onClick={() => onChange(filters.filter((_, idx) => idx !== i))}
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}

      {allowAdd && fields.length > 0 && (
        <button
          className="btn ghost slim"
          onClick={() => onChange([...filters, { field: fields[0].name, values: [], mode: defaultFilterMode(fields[0]) }])}
        >
          <Plus size={12} /> Filter
        </button>
      )}
    </>
  );
}

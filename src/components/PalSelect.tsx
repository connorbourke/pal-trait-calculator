import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchPals } from "../lib/breeding";
import type { Pal } from "../lib/types";
import { PalPortrait } from "./PalPortrait";

interface Props {
  label: string;
  pals: Pal[];
  value: Pal | null;
  onChange: (pal: Pal | null) => void;
  placeholder: string;
}

export function PalSelect({
  label,
  pals,
  value,
  onChange,
  placeholder,
}: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const matches = searchPals(pals, open ? query : (value?.name ?? query));
    return matches.slice(0, 12);
  }, [pals, open, query, value]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        if (value) setQuery(value.name);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [value]);

  useEffect(() => {
    if (value) setQuery(value.name);
  }, [value]);

  return (
    <div className="pal-select" ref={rootRef}>
      <label htmlFor={id}>{label}</label>
      <div className={`pal-select-input${value ? " has-value" : ""}`}>
        {value ? (
          <div className="pal-select-value" aria-hidden="true">
            <PalPortrait pal={value} size="sm" layout="row" />
          </div>
        ) : null}
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value && e.target.value !== value.name) onChange(null);
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        {value ? (
          <button
            type="button"
            className="clear"
            aria-label={`Clear ${label}`}
            onClick={() => {
              onChange(null);
              setQuery("");
              setOpen(true);
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {open ? (
        <ul id={listId} className="pal-menu" role="listbox">
          {results.length === 0 ? (
            <li className="empty">No Pals match.</li>
          ) : (
            results.map((pal) => (
              <li key={pal.index}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value?.index === pal.index}
                  onClick={() => {
                    onChange(pal);
                    setQuery(pal.name);
                    setOpen(false);
                  }}
                >
                  <PalPortrait pal={pal} size="sm" layout="row" />
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

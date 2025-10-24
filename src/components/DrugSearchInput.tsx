import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";

export type DrugSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSelected?: (value: string) => void;
  label?: string;
  placeholder?: string;
  minChars?: number; // default 3
  debounceMs?: number; // default 300
  disabled?: boolean;
  className?: string;
};

const PUBCHEM_AUTOCOMPLETE_BASE =
  "https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/Compound/query/";

export function DrugSearchInput({
  value,
  onChange,
  onSelected,
  label = "Medicine Name",
  placeholder = "Search a medicine (e.g., Aspirin, Ibuprofen)",
  minChars = 3,
  debounceMs = 300,
  disabled,
  className,
}: DrugSearchInputProps) {
  const [inputValue, setInputValue] = useState<string>(value ?? "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Keep local input in sync if parent value changes externally
  useEffect(() => {
    setInputValue(value ?? "");
  }, [value]);

  const debounced = useDebounce(inputValue, debounceMs);

  const fetchDrugSuggestions = useCallback(async (term: string) => {
    if (!term || term.trim().length < minChars) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      setIsSearching(true);
      // PubChem autocomplete: .../query/[QUERY]/json
      const url = `${PUBCHEM_AUTOCOMPLETE_BASE}${encodeURIComponent(term)}/json`;
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const list: string[] =
        data?.dictionary_terms?.compound && Array.isArray(data.dictionary_terms.compound)
          ? data.dictionary_terms.compound
          : [];
      setSuggestions(list.slice(0, 10));
      setOpen(list.length > 0);
    } catch (e) {
      if ((e as any)?.name !== "AbortError") {
        // Swallow network errors; just close list
        setSuggestions([]);
        setOpen(false);
      }
    } finally {
      setIsSearching(false);
    }
  }, [minChars]);

  // Trigger suggestion fetch when debounced term changes
  useEffect(() => {
    fetchDrugSuggestions(debounced);
    // Cleanup inflight request on unmount
    return () => controllerRef.current?.abort();
  }, [debounced, fetchDrugSuggestions]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setInputValue(next);
      onChange(next);
    },
    [onChange]
  );

  const handleDrugSelection = useCallback(
    (name: string) => {
      setInputValue(name);
      onChange(name);
      onSelected?.(name);
      setSuggestions([]);
      setOpen(false);
    },
    [onChange, onSelected]
  );

  const showList = open && suggestions.length > 0;

  return (
    <div className={"relative " + (className ?? "") }>
      {label ? (
        <label className="block mb-1 font-medium" htmlFor="drug-search-input">
          {label}
        </label>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          id="drug-search-input"
          type="text"
          className="w-full border rounded px-3 py-2"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setOpen(suggestions.length > 0)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls="drug-suggestions-list"
          role="combobox"
        />
        {isSearching ? (
          <span className="text-sm text-gray-500">Searching…</span>
        ) : null}
      </div>

      {showList && (
        <ul
          ref={listRef}
          id="drug-suggestions-list"
          role="listbox"
          className="absolute z-10 mt-1 w-full max-h-64 overflow-auto bg-white border rounded shadow"
        >
          {suggestions.map((s, idx) => (
            <li
              key={`${s}-${idx}`}
              role="option"
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleDrugSelection(s)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

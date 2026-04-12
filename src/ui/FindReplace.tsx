import { Component, createSignal, createEffect, on } from "solid-js";
import type { SearchMatch } from "../lib/ipc";
import type { EditorEngine } from "../editor/engine";
import { createFocusTrap } from "../lib/a11y";

interface FindReplaceProps {
  visible: boolean;
  engine: EditorEngine | null;
  onClose: () => void;
  onMatchesChange: (matches: SearchMatch[]) => void;
  onJumpTo: (line: number, col: number) => void;
}

function findInLines(lines: string[], query: string, caseSensitive: boolean, useRegex: boolean): SearchMatch[] {
  if (!query) return [];
  const matches: SearchMatch[] = [];

  if (useRegex) {
    let re: RegExp;
    try {
      re = new RegExp(query, caseSensitive ? "g" : "gi");
    } catch {
      return []; // Invalid regex — return no matches
    }
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(lines[i])) !== null) {
        if (m[0].length === 0) { re.lastIndex++; continue; } // skip zero-length matches
        matches.push({ line: i, start_col: m.index, end_col: m.index + m[0].length });
      }
    }
  } else {
    const q = caseSensitive ? query : query.toLowerCase();
    for (let i = 0; i < lines.length; i++) {
      const line = caseSensitive ? lines[i] : lines[i].toLowerCase();
      let start = 0;
      while (true) {
        const pos = line.indexOf(q, start);
        if (pos === -1) break;
        matches.push({ line: i, start_col: pos, end_col: pos + query.length });
        start = pos + 1;
      }
    }
  }
  return matches;
}

const FindReplace: Component<FindReplaceProps> = (props) => {
  let findInputRef: HTMLInputElement | undefined;
  let panelRef: HTMLDivElement | undefined;

  const [query, setQuery] = createSignal("");
  const [replacement, setReplacement] = createSignal("");
  const [matches, setMatches] = createSignal<SearchMatch[]>([]);
  const [currentIdx, setCurrentIdx] = createSignal(-1);
  const [showReplace, setShowReplace] = createSignal(false);
  const [caseSensitive, setCaseSensitive] = createSignal(false);
  const [useRegex, setUseRegex] = createSignal(false);

  const trap = createFocusTrap(() => panelRef, () => props.onClose());

  // Focus input when opened
  createEffect(
    on(
      () => props.visible,
      (visible) => {
        if (visible) {
          trap.activate();
          requestAnimationFrame(() => findInputRef?.focus());
        } else {
          trap.deactivate();
        }
      }
    )
  );

  function runSearch() {
    const eng = props.engine;
    if (!eng || !query()) {
      setMatches([]);
      setCurrentIdx(-1);
      props.onMatchesChange([]);
      return;
    }
    const results = findInLines(eng.lines(), query(), caseSensitive(), useRegex());
    setMatches(results);
    setCurrentIdx(results.length > 0 ? 0 : -1);
    props.onMatchesChange(results);
    if (results.length > 0) {
      props.onJumpTo(results[0].line, results[0].start_col);
    }
  }

  // Search when query, case-sensitivity, or regex mode changes
  createEffect(on([query, caseSensitive, useRegex], runSearch));

  function jumpNext() {
    const m = matches();
    if (m.length === 0) return;
    const next = (currentIdx() + 1) % m.length;
    setCurrentIdx(next);
    props.onJumpTo(m[next].line, m[next].start_col);
  }

  function jumpPrev() {
    const m = matches();
    if (m.length === 0) return;
    const prev = (currentIdx() - 1 + m.length) % m.length;
    setCurrentIdx(prev);
    props.onJumpTo(m[prev].line, m[prev].start_col);
  }

  /** Compute replacement text, handling regex capture groups ($1, $2, etc.) */
  function computeReplacement(matchLine: string, matchStart: number, matchEnd: number): string {
    const repl = replacement();
    if (!repl) return "";
    if (!useRegex()) return repl;
    // Re-run the regex on the matched text to get capture groups
    try {
      const re = new RegExp(query(), caseSensitive() ? "" : "i");
      const matched = matchLine.substring(matchStart, matchEnd);
      return matched.replace(re, repl);
    } catch {
      return repl;
    }
  }

  function replaceCurrent() {
    const eng = props.engine;
    if (!eng || currentIdx() < 0) return;
    const m = matches()[currentIdx()];
    if (!m) return;

    const line = eng.getLine(m.line);
    const replText = computeReplacement(line, m.start_col, m.end_col);

    eng.deleteRange(
      { line: m.line, col: m.start_col },
      { line: m.line, col: m.end_col }
    );
    if (replText) {
      eng.setCursor({ line: m.line, col: m.start_col });
      eng.insert(replText);
    }

    runSearch();
  }

  function replaceAllMatches() {
    const eng = props.engine;
    if (!eng || !query()) return;

    // Replace from bottom to top so positions stay valid
    const m = [...matches()].reverse();
    for (const match of m) {
      const line = eng.getLine(match.line);
      const replText = computeReplacement(line, match.start_col, match.end_col);

      eng.deleteRange(
        { line: match.line, col: match.start_col },
        { line: match.line, col: match.end_col }
      );
      if (replText) {
        eng.setCursor({ line: match.line, col: match.start_col });
        eng.insert(replText);
      }
    }

    setMatches([]);
    setCurrentIdx(-1);
    props.onMatchesChange([]);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      props.onClose();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      jumpNext();
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      jumpPrev();
    }
  }

  return (
    <div
      ref={panelRef}
      class="find-replace"
      style={{ display: props.visible ? "flex" : "none" }}
      onKeyDown={handleKeyDown}
    >
      <div class="find-row">
        <input
          ref={findInputRef}
          class="find-input"
          type="text"
          placeholder="Find"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        <span class="find-count">
          {matches().length > 0
            ? `${currentIdx() + 1}/${matches().length}`
            : query()
            ? "No results"
            : ""}
        </span>
        <button class="find-btn" onClick={() => setCaseSensitive(!caseSensitive())} title="Case sensitive">
          <span style={{ opacity: caseSensitive() ? 1 : 0.4 }}>Aa</span>
        </button>
        <button class="find-btn" onClick={() => setUseRegex(!useRegex())} title="Use regular expression">
          <span style={{ opacity: useRegex() ? 1 : 0.4 }}>.*</span>
        </button>
        <button class="find-btn" onClick={jumpPrev} title="Previous (Shift+Enter)">^</button>
        <button class="find-btn" onClick={jumpNext} title="Next (Enter)">v</button>
        <button
          class="find-btn"
          onClick={() => setShowReplace(!showReplace())}
          title="Toggle replace"
        >
          {showReplace() ? "-" : "+"}
        </button>
        <button class="find-btn find-close" onClick={props.onClose}>x</button>
      </div>
      {showReplace() && (
        <div class="find-row">
          <input
            class="find-input"
            type="text"
            placeholder="Replace"
            value={replacement()}
            onInput={(e) => setReplacement(e.currentTarget.value)}
          />
          <button class="find-btn" onClick={replaceCurrent} title="Replace">1</button>
          <button class="find-btn" onClick={replaceAllMatches} title="Replace all">*</button>
        </div>
      )}
    </div>
  );
};

export default FindReplace;

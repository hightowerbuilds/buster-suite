import { Component, createSignal, createEffect, on } from "solid-js";
import type { SearchMatch } from "../lib/ipc";
import type { EditorEngine } from "../editor/engine";
import { createFocusTrap } from "../lib/a11y";

interface FindReplaceProps {
  visible: boolean;
  engine: EditorEngine | null;
  onClose: () => void;
  onMatchesChange: (matches: SearchMatch[]) => void;
  onCurrentIdxChange?: (idx: number) => void;
  onJumpTo: (line: number, col: number) => void;
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
  const [regexError, setRegexError] = createSignal<string | null>(null);

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

  // Broadcast currentIdx changes
  createEffect(on(currentIdx, (idx) => {
    props.onCurrentIdxChange?.(idx);
  }));

  function runSearch() {
    const eng = props.engine;
    if (!eng || !query()) {
      setMatches([]);
      setCurrentIdx(-1);
      setRegexError(null);
      props.onMatchesChange([]);
      return;
    }

    // Validate regex before searching
    if (useRegex()) {
      try {
        new RegExp(query());
        setRegexError(null);
      } catch (e) {
        setRegexError((e as Error).message);
        setMatches([]);
        setCurrentIdx(-1);
        props.onMatchesChange([]);
        return;
      }
    } else {
      setRegexError(null);
    }

    const results = eng.findAll(query(), { caseSensitive: caseSensitive(), regex: useRegex() });
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

    // Wrap in undo group so all replacements are a single undo step
    eng.beginUndoGroup();
    try {
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
    } finally {
      eng.endUndoGroup();
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
    } else if ((e.altKey || e.metaKey) && e.key === "c") {
      // Alt+C or Cmd+Alt+C — toggle case sensitivity
      e.preventDefault();
      setCaseSensitive(!caseSensitive());
    } else if ((e.altKey || e.metaKey) && e.key === "r") {
      // Alt+R or Cmd+Alt+R — toggle regex
      e.preventDefault();
      setUseRegex(!useRegex());
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
          classList={{ "find-input-error": !!regexError() }}
          type="text"
          placeholder="Find"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        <span class="find-count">
          {regexError()
            ? "Bad regex"
            : matches().length > 0
            ? `${currentIdx() + 1}/${matches().length}`
            : query()
            ? "No results"
            : ""}
        </span>
        <button
          class="find-btn"
          classList={{ "find-btn-active": caseSensitive() }}
          onClick={() => setCaseSensitive(!caseSensitive())}
          title="Case sensitive (Alt+C)"
        >
          Aa
        </button>
        <button
          class="find-btn"
          classList={{ "find-btn-active": useRegex() }}
          onClick={() => setUseRegex(!useRegex())}
          title="Regular expression (Alt+R)"
        >
          .*
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

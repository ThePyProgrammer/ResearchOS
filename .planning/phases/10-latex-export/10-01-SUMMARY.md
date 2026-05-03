---
phase: 10-latex-export
plan: 01
subsystem: ui
tags: [latex, tiptap, dom-walker, citation-keys, bibtex, vitest]

# Dependency graph
requires: []
provides:
  - htmlToLatex(html) DOM walker converts tiptap HTML to LaTeX with usedKeys tracking
  - escapeLatex(text) single-pass regex escapes all 10 LaTeX special characters
  - makeCitationKey(item) mirrors Python _make_citation_key() exactly
  - deduplicateKeys(items) assigns smith2024/smith2024b collision-safe resolved keys
  - makeCitationLabel(item) generates (Author et al., Year) display labels for citation chips
affects: [10-02, 10-03, 10-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DOM walker for HTML-to-LaTeX: follows _nodeToMd() pattern from ProjectNotesIDE.jsx using DOMParser + recursive _nodeToLatex(node, ctx)"
    - "Single-pass regex escaping: escapeLatex uses .replace(/[\\{}&%#$^_~]/g, cb) to avoid double-escaping when backslash is processed"
    - "Citation key dedup: seen map starts at 1 for first occurrence, chr(96+count) gives 'b' for second — matches Python export_bibtex logic"

key-files:
  created:
    - frontend/src/utils/latexSerializer.js
    - frontend/src/utils/latexSerializer.test.js
    - frontend/src/utils/citationKeys.js
    - frontend/src/utils/citationKeys.test.js
  modified: []

key-decisions:
  - "Single-pass regex used for escapeLatex to prevent double-escaping when backslash replacement produces {} which would otherwise be re-escaped by later { and } handlers"
  - "htmlToLatex strips only leading whitespace (not trailing) so paragraph double-newlines are preserved in output"
  - "deduplicateKeys: second collision gets 'b' suffix (chr(96+2)), matching Python chr(96 + seen_keys[key]) where count starts at 1"
  - "makeCitationKey returns 'entry' when all of authors/year/title are empty — JS-side edge case beyond Python _make_citation_key scope"
  - "makeCitationLabel omits year entirely when null/undefined (no 'n.d.' fallback) to match plan spec"

patterns-established:
  - "ctx object pattern: _nodeToLatex(node, ctx) threads { usedKeys: Set } through DOM walk without globals"
  - "data-cite-key span attribute: citation spans recognized by dataset.citeKey in span handler"

requirements-completed:
  - TEX-01
  - TEX-06

# Metrics
duration: 7min
completed: 2026-03-20
---

# Phase 10 Plan 01: LaTeX Serializer and Citation Key Utilities Summary

**HTML-to-LaTeX DOM walker with single-pass escaping and Python-mirroring citation key generation — 67 tests all green**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-20T07:19:13Z
- **Completed:** 2026-03-20T07:26:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `htmlToLatex()` DOM walker converts all tiptap HTML constructs (headings, lists, tables, math spans, citation spans, formatting) to valid LaTeX
- `escapeLatex()` safely handles all 10 LaTeX special characters in a single pass to prevent double-escaping
- `makeCitationKey()` exactly mirrors Python `_make_citation_key()` ensuring export .bib keys match displayed citation chips
- `deduplicateKeys()` implements the smith2024/smith2024b/smith2024c collision-safe suffix pattern from Python `export_bibtex()`
- `makeCitationLabel()` generates human-readable (Author et al., Year) labels for citation chip display

## Task Commits

Each task was committed atomically:

1. **Task 1: LaTeX serializer utility with tests** - `678d531` (feat)
2. **Task 2: Citation key generation utility with tests** - `89a63fa` (feat)

## Files Created/Modified

- `frontend/src/utils/latexSerializer.js` - htmlToLatex DOM walker and escapeLatex utility (41 tests)
- `frontend/src/utils/latexSerializer.test.js` - Test suite for LaTeX serializer
- `frontend/src/utils/citationKeys.js` - makeCitationKey, deduplicateKeys, makeCitationLabel (26 tests)
- `frontend/src/utils/citationKeys.test.js` - Test suite for citation key utilities

## Decisions Made

- Used single-pass regex `.replace(/[\\{}&%#$^_~]/g, cb)` for `escapeLatex` so backslash is not double-processed
- `htmlToLatex` strips only leading whitespace (not trailing) to preserve paragraph double-newlines in output
- Dedup suffix starts at `'b'` for second collision (chr(96+2)), matching Python's `chr(96 + seen_keys[key])` where count starts at 1
- `makeCitationKey` returns `'entry'` for fully empty items — minor JS-side extension of Python behavior for robustness

## Deviations from Plan

None — plan executed exactly as written. TDD RED/GREEN cycle worked cleanly with only minor bug fixes between RED and GREEN phases (single-pass escaping approach was discovered during GREEN).

## Issues Encountered

- **Initial escapeLatex implementation used sequential `.split().join()` passes**: replacing `{` after `\textbackslash{}` caused the braces in the replacement to be escaped again, producing `\textbackslash\{\}` instead of `\textbackslash{}`. Switched to single-pass regex solution.
- **`htmlToLatex` was calling `.trim()` on the output**: this stripped trailing `\n\n` making the paragraph double-newline test fail. Changed to only strip leading whitespace.
- **Existing `citationKeys.js` had dedup bug**: used `chr(96 + count)` before incrementing, producing `'a'` suffix instead of `'b'` for second collision. Also `makeCitationLabel` used `'n.d.'` for missing year and didn't handle two-author format. All fixed in GREEN phase.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Both utility modules are pure functions with no side effects or external dependencies
- `htmlToLatex` is ready for Plan 02 to integrate as the serializer for the LaTeX preview panel
- `makeCitationKey` / `deduplicateKeys` are ready for Plan 02's citation chip tiptap extension
- `makeCitationLabel` is ready for Plan 02's citation chip display rendering
- 67 tests provide a solid regression baseline for all downstream plans

---
*Phase: 10-latex-export*
*Completed: 2026-03-20*

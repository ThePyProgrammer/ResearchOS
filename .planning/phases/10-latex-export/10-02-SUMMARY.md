---
phase: 10-latex-export
plan: "02"
subsystem: frontend/citation-extension
tags: [tiptap, citations, suggestion, mark, css]
dependency_graph:
  requires: [frontend/src/utils/citationKeys.js]
  provides: [frontend/src/components/CitationExtension.js, frontend/src/components/CitationExtension.test.js]
  affects: [frontend/src/index.css]
tech_stack:
  added: []
  patterns: [Mark.create + Suggestion (same as WikiLinkExtension), regex-on-HTML for extractCitations]
key_files:
  created:
    - frontend/src/components/CitationExtension.js
    - frontend/src/components/CitationExtension.test.js
    - frontend/src/utils/citationKeys.js
  modified:
    - frontend/src/index.css
decisions:
  - Left-click on citation chip opens context menu (not navigation) — distinct from WikiLink which navigates on click
  - Email collision avoidance via custom allow() function in Suggestion checking char before @
  - Browser native title attribute used for hover tooltip — lightweight, no extra DOM
  - citationKeys.js created here (Rule 3 auto-fix) since Plan 01 hasn't run yet
metrics:
  duration: "5 min"
  completed_date: "2026-03-20"
  tasks_completed: 3
  files_changed: 4
---

# Phase 10 Plan 02: CitationExtension Summary

**One-liner:** Mark-based @-trigger citation extension with popup, context menu, extractCitations regex parser, and blue inline chip CSS.

## What Was Built

A tiptap mark extension (`CitationExtension.js`) that lets users insert paper/website citations in project notes via @-mention. The extension follows the exact `Mark.create + Suggestion` architecture of `WikiLinkExtension.js`.

The citation chip stores four data attributes on the HTML span (`data-cite-key`, `data-cite-paper-id`, `data-cite-website-id`, `data-cite-label`) which the LaTeX serializer (Plan 01) will read to produce `\cite{key}`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | CitationExtension mark with @-trigger popup | 70e4a61 | CitationExtension.js, citationKeys.js |
| 2 | Unit tests for extractCitations | 868f72e | CitationExtension.test.js |
| 3 | Citation chip CSS styles | ef9992a | index.css |

## Key Features

- **Mark definition:** `citation` mark, `inclusive: false`, 4 attributes (paperId, websiteId, citationKey, displayLabel)
- **@-trigger popup:** shows `getLinkedItems()` first, then a "Search full library..." section when query given and fewer than 5 linked results; keyboard navigation (arrow keys, Enter, Escape)
- **Context menu** (left-click or right-click on chip): Open paper, Copy citation key, Copy BibTeX entry, Remove citation
- **Email collision avoidance:** custom `allow()` function checks that the char before `@` is not a word character
- **extractCitations:** regex-based HTML parser (parallel to extractWikiLinks), returns `[{ citationKey, paperId, websiteId }]`, deduplicates by key
- **CSS:** `.citation-chip` as blue inline pill — background `#eff6ff`, border `#bfdbfe`, hover transition

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created citationKeys.js as prerequisite**
- **Found during:** Task 1
- **Issue:** `CitationExtension.js` imports `makeCitationKey` and `makeCitationLabel` from `../utils/citationKeys.js`, but Plan 01 (which was supposed to create it) has not been executed yet
- **Fix:** Created `frontend/src/utils/citationKeys.js` with `makeCitationKey`, `makeCitationLabel`, and `deduplicateKeys` exports, mirroring the Python `_make_citation_key()` algorithm from `bibtex_service.py`
- **Files modified:** `frontend/src/utils/citationKeys.js`
- **Commit:** 70e4a61 (included in Task 1 commit)

## Self-Check: PASSED

- frontend/src/components/CitationExtension.js: FOUND
- frontend/src/components/CitationExtension.test.js: FOUND
- frontend/src/utils/citationKeys.js: FOUND
- commit 70e4a61: FOUND
- commit 868f72e: FOUND
- commit ef9992a: FOUND

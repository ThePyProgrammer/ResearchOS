---
phase: quick-5
plan: 1
subsystem: frontend/import
tags: [import, csv, json, jsonl, xlsx, sheetjs, file-parsing]
dependency_graph:
  requires: []
  provides: [multi-format-experiment-import]
  affects: [CSVImportModal, ProjectDetail]
tech_stack:
  added: [xlsx (SheetJS 0.18+)]
  patterns: [file-extension-dispatch, shared-finalize-hook, sub-state-sheet-selector]
key_files:
  created: []
  modified:
    - frontend/src/pages/CSVImportModal.jsx
    - frontend/package.json
    - frontend/package-lock.json
decisions:
  - finalizeParsed() shared hook centralizes all post-parse logic so CSV/JSON/JSONL/XLSX all feed into the same column-mapping step
  - XLSX sheet selector is sub-state within Step 1 (not a new wizard step) to keep STEPS array at 4 and avoid changing step numbering
  - Back from Step 2 resets xlsx state + file + parsed so user can re-upload a different file cleanly
metrics:
  duration: ~10 min
  completed: 2026-03-18
  tasks_completed: 1
  files_changed: 3
---

# Quick Task 5: Add JSON, JSONL, and XLSX Import Support

**One-liner:** Multi-format experiment import (JSON array-of-objects, JSON columnar, JSONL, XLSX/XLS with sheet selector) via file-extension dispatch in CSVImportModal, backed by SheetJS.

## What Was Built

Extended the 4-step import wizard (CSVImportModal) to accept five file formats instead of only CSV. All formats produce the same `{ headers, rows }` shape and feed into the existing column mapping, preview, and confirm steps without any changes to those steps.

### Format Support

| Format | Extension | Parsing Strategy |
|--------|-----------|-----------------|
| CSV | .csv | Papa.parse (unchanged) |
| JSON array | .json | JSON.parse, flatMap keys for headers |
| JSON columnar | .json | JSON.parse, Object.keys + transpose |
| JSONL | .jsonl | Split by newline, JSON.parse each line |
| Excel | .xlsx, .xls | XLSX.read + sheet_to_json with header:1 |

### XLSX Sheet Selector

When an Excel file has multiple sheets, a sheet selector appears inline within Step 1 (not a separate wizard step). The selector shows radio buttons for each sheet name and a "Continue" button that parses the selected sheet and advances to Step 2.

Single-sheet Excel files auto-parse immediately with no user interaction.

### Helper Functions Added

- `parseJsonData(text)` — handles both array-of-objects and columnar `{key: [val, ...]}` formats
- `parseSheetData(workbook, sheetName)` — converts XLSX sheet to `{ headers, rows }`
- `finalizeParsed({ headers, rows, fileName })` — shared post-parse hook: validates rows, sets parsed state, runs autoDetectColumnRoles, and advances to Step 2

### UI Label Updates

- Modal title: "Import CSV" → "Import Experiments"
- Drop zone headline: "Drop your CSV file here" → "Drop your file here"
- Drop zone helper: "CSV files only, max 5 MB" → "CSV, JSON, JSONL, or Excel files, max 5 MB"
- Description: "Upload a CSV file to import experiments" → "Upload a file to import experiments"
- Parsed confirmation: now includes filename ("Parsed N rows, M columns from filename.json")
- File input accept: ".csv" → ".csv,.json,.jsonl,.xlsx,.xls"
- ProjectDetail button: "Import CSV" → "Import Data" (was already updated in HEAD)

### State Management

Added three new state variables for XLSX sheet handling:
- `xlsxWorkbook` — holds the parsed XLSX workbook object
- `xlsxSheets` — list of sheet names from the workbook
- `selectedSheet` — currently selected sheet name

These are reset to null/[] when: processFile is called (new file), or user clicks Back from Step 2 to Step 1.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install xlsx + multi-format parsing | c04253f | frontend/package.json, frontend/src/pages/CSVImportModal.jsx |

## Deviations from Plan

None — plan executed exactly as written.

Note: "Import Data" button in ProjectDetail.jsx was already present in HEAD (from a prior commit). No change was needed there.

## Self-Check

- [x] `frontend/src/pages/CSVImportModal.jsx` — updated with XLSX import, parseJsonData, parseSheetData, finalizeParsed
- [x] `frontend/package.json` — xlsx dependency added
- [x] Build succeeded: `✓ built in 15.73s` (1120 modules, no code errors)
- [x] Commit c04253f exists

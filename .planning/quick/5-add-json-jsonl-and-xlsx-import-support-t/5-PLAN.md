---
phase: quick-5
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/pages/CSVImportModal.jsx
  - frontend/src/pages/ProjectDetail.jsx
  - frontend/package.json
autonomous: true
requirements: [QUICK-5]
must_haves:
  truths:
    - "User can import .json files (array-of-objects and columnar formats)"
    - "User can import .jsonl files (one JSON object per line)"
    - "User can import .xlsx/.xls files with sheet selection"
    - "All formats produce identical { headers, rows } for column mapping step"
    - "Modal title says Import Experiments, button says Import Data"
  artifacts:
    - path: "frontend/src/pages/CSVImportModal.jsx"
      provides: "Multi-format import wizard with JSON/JSONL/XLSX support"
    - path: "frontend/package.json"
      provides: "xlsx (SheetJS) dependency"
  key_links:
    - from: "CSVImportModal.jsx processFile"
      to: "Papa.parse / xlsx.read / JSON.parse"
      via: "file extension dispatch"
      pattern: "extension.*csv|json|jsonl|xlsx"
---

<objective>
Extend the experiment import wizard (CSVImportModal) to accept JSON, JSONL, and XLSX files in addition to CSV.

Purpose: Researchers store experiment results in various formats. Supporting JSON/JSONL/XLSX removes the friction of manual conversion to CSV before importing.

Output: Updated CSVImportModal with multi-format parsing, XLSX sheet selector, and updated UI labels.
</objective>

<execution_context>
@C:/Users/prann/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/prann/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/pages/CSVImportModal.jsx
@frontend/src/pages/csvImportUtils.js
@frontend/src/pages/ProjectDetail.jsx (line ~3792 for "Import CSV" button text)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install xlsx and add multi-format parsing to CSVImportModal</name>
  <files>frontend/package.json, frontend/src/pages/CSVImportModal.jsx, frontend/src/pages/ProjectDetail.jsx</files>
  <action>
1. Install the xlsx (SheetJS) library:
   ```
   cd frontend && npm install xlsx
   ```

2. In CSVImportModal.jsx, add `import * as XLSX from 'xlsx'` at the top.

3. Update the file accept filter on the hidden input (line ~394) from `.csv` to `.csv,.json,.jsonl,.xlsx,.xls`.

4. Update the drop zone helper text (line ~389) from "CSV files only, max 5 MB" to "CSV, JSON, JSONL, or Excel files, max 5 MB".

5. Update the drop zone text (line ~388) from "Drop your CSV file here" to "Drop your file here".

6. Refactor `processFile` to dispatch by file extension instead of only handling CSV:

   a. Extract the file extension: `const ext = f.name.split('.').pop().toLowerCase()`

   b. Replace the `.csv`-only check with a supported extensions check:
      ```js
      const SUPPORTED_EXTS = ['csv', 'json', 'jsonl', 'xlsx', 'xls']
      if (!SUPPORTED_EXTS.includes(ext)) {
        setParseError('Unsupported file type. Please upload a CSV, JSON, JSONL, or Excel file.')
        return
      }
      ```

   c. For CSV (ext === 'csv'): Keep existing Papa.parse logic as-is.

   d. For JSON (ext === 'json'): Read file as text via FileReader, then:
      - Parse with JSON.parse
      - If result is an array of objects: headers = union of all keys across objects, rows = the array
      - If result is an object of arrays (columnar): headers = Object.keys, rows = transpose by iterating the max array length and building row objects
      - Otherwise: setParseError('JSON must be an array of objects or an object of arrays.')
      - After producing { headers, rows }, proceed to auto-detect roles and setStep(2) (same as CSV path)

   e. For JSONL (ext === 'jsonl'): Read file as text, split by newlines, filter empty lines, JSON.parse each line into an object. Collect into an array, then treat identically to the array-of-objects JSON path above.

   f. For XLSX/XLS (ext === 'xlsx' or ext === 'xls'): Read file as ArrayBuffer via FileReader, then:
      - `const workbook = XLSX.read(buffer, { type: 'array' })`
      - Store workbook and sheet names in new state: `const [xlsxWorkbook, setXlsxWorkbook] = useState(null)` and `const [xlsxSheets, setXlsxSheets] = useState([])` and `const [selectedSheet, setSelectedSheet] = useState(null)`
      - If only one sheet: auto-select it and parse immediately
      - If multiple sheets: set sheets state, set step to 1.5 (use a sub-step — see sheet selector below)
      - Sheet parsing: `XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 })` gives array-of-arrays. First row = headers, remaining rows = data. Convert to array-of-objects format.

7. Add a sheet selector UI that appears within Step 1 when xlsxSheets has multiple entries and selectedSheet is null. Show after file upload succeeds:
   - Radio buttons or a simple select listing sheet names
   - A "Continue" button that parses the selected sheet and proceeds to step 2
   - This is NOT a separate wizard step (STEPS array stays 4 items) — it's a sub-state within Step 1

8. Add helper function `parseSheetData(workbook, sheetName)` that converts a sheet to { headers, rows }:
   ```js
   function parseSheetData(workbook, sheetName) {
     const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 })
     if (raw.length < 2) return null // need header + at least 1 data row
     const headers = raw[0].map(h => String(h ?? '').trim())
     const rows = raw.slice(1)
       .filter(r => r.some(v => v != null && String(v).trim() !== ''))
       .map(r => {
         const obj = {}
         headers.forEach((h, i) => { obj[h] = r[i] != null ? String(r[i]) : '' })
         return obj
       })
     return { headers, rows }
   }
   ```

9. Add helper function `parseJsonData(text)` for JSON format:
   ```js
   function parseJsonData(text) {
     const data = JSON.parse(text)
     if (Array.isArray(data)) {
       // array of objects
       if (data.length === 0) return null
       const headers = [...new Set(data.flatMap(obj => Object.keys(obj)))]
       const rows = data.map(obj => {
         const row = {}
         headers.forEach(h => { row[h] = obj[h] != null ? String(obj[h]) : '' })
         return row
       })
       return { headers, rows }
     } else if (typeof data === 'object' && data !== null) {
       // columnar: { key: [val, ...], ... }
       const headers = Object.keys(data)
       const maxLen = Math.max(...headers.map(h => Array.isArray(data[h]) ? data[h].length : 0))
       if (maxLen === 0) return null
       const rows = []
       for (let i = 0; i < maxLen; i++) {
         const row = {}
         headers.forEach(h => { row[h] = Array.isArray(data[h]) && data[h][i] != null ? String(data[h][i]) : '' })
         rows.push(row)
       }
       return { headers, rows }
     }
     return null
   }
   ```

10. After producing { headers, rows } from any format, funnel into the SAME post-parse logic that currently lives in Papa.parse's `complete` callback: filter empty rows, check rows.length > 0, setParsed, autoDetectColumnRoles, setColumnRoles, setStep(2).

11. Update modal title (line ~853) from "Import CSV" to "Import Experiments".

12. Update the description text in Step 1 (line ~372) from "Upload a CSV file to import experiments" to "Upload a file to import experiments".

13. In ProjectDetail.jsx, update the button text (around line ~3792) from "Import CSV" to "Import Data".

14. Update the parsed confirmation message (line ~412) to include file type:
    "Parsed {rows.length} rows, {headers.length} columns from {file.name}"

15. When user clicks Back from step 2 to step 1, also reset xlsx-related state (xlsxWorkbook, xlsxSheets, selectedSheet).
  </action>
  <verify>
    <automated>cd frontend && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>
    - File input accepts .csv, .json, .jsonl, .xlsx, .xls
    - JSON array-of-objects and columnar formats both parse to { headers, rows }
    - JSONL files parse one-object-per-line to { headers, rows }
    - XLSX files with one sheet auto-parse; multiple sheets show sheet selector within Step 1
    - All formats feed into the same column mapping / preview / confirm steps
    - Modal title reads "Import Experiments", button reads "Import Data"
    - Build succeeds with no errors
  </done>
</task>

</tasks>

<verification>
- Open the app, navigate to a project, click "Import Data" button
- Test CSV import still works as before
- Test JSON import with array-of-objects format
- Test JSON import with columnar format
- Test JSONL import
- Test XLSX import with single sheet (auto-selects)
- Test XLSX import with multiple sheets (shows sheet selector)
- All formats reach column mapping step with correct headers and rows
</verification>

<success_criteria>
- All five file formats (.csv, .json, .jsonl, .xlsx, .xls) parse successfully and produce { headers, rows }
- XLSX multi-sheet selector appears inline within Step 1 when needed
- Existing CSV import workflow is completely unchanged
- Frontend builds without errors
- UI labels updated: "Import Experiments" title, "Import Data" button
</success_criteria>

<output>
After completion, create `.planning/quick/5-add-json-jsonl-and-xlsx-import-support-t/5-SUMMARY.md`
</output>

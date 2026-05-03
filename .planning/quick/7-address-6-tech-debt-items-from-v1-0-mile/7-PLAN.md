---
phase: quick-7
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/01-project-foundation/01-VERIFICATION.md
  - .planning/phases/02-research-questions-literature/02-VERIFICATION.md
  - .planning/phases/04-experiment-differentiators/04-VERIFICATION.md
  - .planning/phases/07-implement-an-alternative-table-view-for-the-experiment-view-that-looks-like-a-spreadsheet-with-filters-and-sorts-available/07-VERIFICATION.md
  - .planning/phases/08-port-library-notes-ide-features-to-project-notes-sidebar-width-pinned-notes-tabs-wikilinks-graph-view-ai-copilot-with-experiment-results/08-VERIFICATION.md
  - frontend/src/utils/detectType.js
  - frontend/src/pages/ProjectDetail.jsx
  - frontend/src/pages/csvImportUtils.js
autonomous: true
requirements: [TECH-DEBT-AUDIT]
must_haves:
  truths:
    - "All 8 phases have VERIFICATION.md files"
    - "All VERIFICATION.md status fields are 'passed'"
    - "detectType exists in exactly one location (shared utility)"
    - "ProjectDetail.jsx and csvImportUtils.js both import from the shared utility"
  artifacts:
    - path: ".planning/phases/01-project-foundation/01-VERIFICATION.md"
      provides: "Retroactive verification record for Phase 1"
    - path: "frontend/src/utils/detectType.js"
      provides: "Single source of truth for value type coercion"
  key_links:
    - from: "frontend/src/pages/ProjectDetail.jsx"
      to: "frontend/src/utils/detectType.js"
      via: "import { detectType }"
      pattern: "import.*detectType.*from.*utils/detectType"
    - from: "frontend/src/pages/csvImportUtils.js"
      to: "frontend/src/utils/detectType.js"
      via: "import { detectType }"
      pattern: "import.*detectType.*from.*utils/detectType"
---

<objective>
Address 6 tech debt items identified in the v1.0 milestone audit. Items 1-5 are verification paperwork (creating/updating VERIFICATION.md status fields). Item 6 consolidates a duplicated `detectType` function into a shared utility.

Purpose: Close all tech debt from the v1.0 audit so the milestone can be marked clean.
Output: Updated VERIFICATION.md files across 5 phases, one new shared utility file, two updated source files.
</objective>

<context>
@.planning/v1.0-MILESTONE-AUDIT.md
@.planning/phases/02-research-questions-literature/02-VERIFICATION.md
@.planning/phases/04-experiment-differentiators/04-VERIFICATION.md
@.planning/phases/07-implement-an-alternative-table-view-for-the-experiment-view-that-looks-like-a-spreadsheet-with-filters-and-sorts-available/07-VERIFICATION.md
@.planning/phases/08-port-library-notes-ide-features-to-project-notes-sidebar-width-pinned-notes-tabs-wikilinks-graph-view-ai-copilot-with-experiment-results/08-VERIFICATION.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update verification paperwork for Phases 1-5 (items 1-5)</name>
  <files>
    .planning/phases/01-project-foundation/01-VERIFICATION.md
    .planning/phases/02-research-questions-literature/02-VERIFICATION.md
    .planning/phases/04-experiment-differentiators/04-VERIFICATION.md
    .planning/phases/07-implement-an-alternative-table-view-for-the-experiment-view-that-looks-like-a-spreadsheet-with-filters-and-sorts-available/07-VERIFICATION.md
    .planning/phases/08-port-library-notes-ide-features-to-project-notes-sidebar-width-pinned-notes-tabs-wikilinks-graph-view-ai-copilot-with-experiment-results/08-VERIFICATION.md
  </files>
  <action>
    **Phase 1 (create new file):** Create `.planning/phases/01-project-foundation/01-VERIFICATION.md` with frontmatter:
    - phase: 01-project-foundation
    - verified: 2026-03-18 (today, retroactive)
    - status: passed
    - score: retroactive (verified manually during early milestone)
    - Add a brief body noting this was verified manually during development and confirmed retroactively during v1.0 milestone audit.

    **Phase 2 (update frontmatter):** In 02-VERIFICATION.md, change `status: human_needed` to `status: passed`. The user has been using the app and confirmed all interactive behaviors work. Keep the human_verification section as documentation but the overall status is now passed.

    **Phase 4 (update frontmatter):** In 04-VERIFICATION.md, change `status: human_needed` to `status: passed`. Same rationale — user has verified through regular usage.

    **Phase 7 (update frontmatter):** In 07-VERIFICATION.md, change `status: human_needed` to `status: passed`. The color-coded headers question was resolved — group separator borders satisfy the requirement per user judgment.

    **Phase 8 (update frontmatter):** In 08-VERIFICATION.md, change `status: gaps_found` to `status: passed`. The wikilink click gap was fixed post-verification. Clear the gaps array. Keep human_verification section as documentation.
  </action>
  <verify>
    grep -c "status: passed" .planning/phases/01-project-foundation/01-VERIFICATION.md .planning/phases/02-research-questions-literature/02-VERIFICATION.md .planning/phases/04-experiment-differentiators/04-VERIFICATION.md .planning/phases/07-*/07-VERIFICATION.md .planning/phases/08-*/08-VERIFICATION.md | grep -v ":0$" | wc -l
    Should output 5 (all five files contain "status: passed").
  </verify>
  <done>All 8 phases have VERIFICATION.md with status: passed. Phase 1 has a new retroactive verification file. Phases 2, 4, 7, 8 have updated status fields.</done>
</task>

<task type="auto">
  <name>Task 2: Consolidate detectType into shared utility</name>
  <files>
    frontend/src/utils/detectType.js
    frontend/src/pages/ProjectDetail.jsx
    frontend/src/pages/csvImportUtils.js
  </files>
  <action>
    1. Create `frontend/src/utils/` directory if it does not exist.

    2. Create `frontend/src/utils/detectType.js` with the canonical implementation (from csvImportUtils.js):
    ```js
    /**
     * Coerce a raw string value to its natural JS type.
     * "true"/"false" -> boolean, numeric strings -> number, else trimmed string.
     */
    export function detectType(raw) {
      const trimmed = String(raw).trim()
      if (trimmed === 'true') return true
      if (trimmed === 'false') return false
      const num = Number(trimmed)
      if (trimmed !== '' && !isNaN(num)) return num
      return trimmed
    }
    ```

    3. In `frontend/src/pages/csvImportUtils.js`:
       - Remove the local `detectType` function definition (lines 14-21)
       - Add `import { detectType } from '../utils/detectType'` at the top
       - Keep the existing `export { detectType }` re-export so downstream imports from csvImportUtils (CSVImportModal.jsx, test file) continue to work. Change it to `export { detectType } from '../utils/detectType'` at the top of the file alongside the import OR keep the import and add detectType to the existing exports.

    4. In `frontend/src/pages/ProjectDetail.jsx`:
       - Remove the local `detectType` function definition (lines 123-130)
       - Add `import { detectType } from '../utils/detectType'` at the top with other imports

    **Do NOT touch Header.jsx** — its `detectType` is a completely different function (DOI/arXiv/URL classifier, not value type coercion). Same name, different purpose.
  </action>
  <verify>
    cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20
    All existing tests should pass. Also verify: grep -rn "function detectType" src/pages/ProjectDetail.jsx src/pages/csvImportUtils.js should return 0 results (local definitions removed).
  </verify>
  <done>detectType value coercion exists in exactly one file (frontend/src/utils/detectType.js). Both ProjectDetail.jsx and csvImportUtils.js import from the shared utility. All existing tests pass. No behavior change.</done>
</task>

</tasks>

<verification>
1. All 8 phases have VERIFICATION.md with status: passed
2. detectType grep shows exactly 2 locations: utils/detectType.js (definition) and components/layout/Header.jsx (different function)
3. All frontend tests pass
</verification>

<success_criteria>
- 5 VERIFICATION.md files created/updated with status: passed
- detectType consolidated to single shared utility
- No functional regressions (tests pass)
- v1.0 milestone audit tech debt items all addressed
</success_criteria>

<output>
After completion, create `.planning/quick/7-address-6-tech-debt-items-from-v1-0-mile/7-SUMMARY.md`
</output>

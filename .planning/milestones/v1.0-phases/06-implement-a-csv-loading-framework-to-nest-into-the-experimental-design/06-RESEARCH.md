# Phase 6: CSV Loading Framework for Experiments - Research

**Researched:** 2026-03-16
**Domain:** CSV parsing, multi-step wizard UI, bulk experiment creation, tree hierarchy construction
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**CSV-to-Experiment Column Mapping**
- Manual column assignment in a mapping step — user assigns each column as: Experiment Name, Config, Metric, Group, or Skip
- Auto-detect initial assignments based on value types (all-numeric columns default to Metric, mixed/string columns default to Config), but user can override any assignment
- One CSV row = one experiment — no row merging or grouping by name
- If no column is assigned as Experiment Name, auto-generate names by concatenating config values (e.g., `lr=0.01_bs=32_model=resnet`)
- Values auto-detect types (number, boolean, string) — consistent with existing KVEditor behavior

**Import Target & Tree Nesting**
- User picks parent group in the mapping step via a dropdown showing existing experiment groups + "Root level (no parent)"
- Multi-level grouping supported — columns assigned as 'Group' get a numbered priority (Group 1, Group 2, etc.) that determines nesting hierarchy
- Group 1 is top-level parent, Group 2 nests inside Group 1, leaf experiments nest at the bottom
- Group nodes are named by their column's distinct values (e.g., model_type=resnet → group named "resnet")
- Group values stored on both parent group nodes AND leaf experiments as config keys — ensures comparison modal shows all config across leaves without tree traversal

**Import UX & Entry Point**
- "Import CSV" button in the Experiments tab header, next to "New Experiment"
- Multi-step wizard modal: Step 1 (Upload file) → Step 2 (Map Columns + role assignment) → Step 3 (Interactive tree preview) → Step 4 (Confirm & Import)
- Step indicators at top with Back/Next navigation
- Interactive preview step with full editing capabilities:
  - Rename groups (double-click to edit)
  - Exclude rows (checkboxes to skip specific experiments)
  - Rename experiments (double-click leaf names)
  - Rearrange hierarchy (drag to reparent/reorder)

**Update vs Create Behavior**
- Warn on name collisions — preview step highlights experiments that match existing names under the target parent
- Per-match user choice: "Update metrics", "Create new", or "Skip"
- When updating metrics: user chooses per-import between "Overwrite all metrics" (replace entire dict) and "Merge metrics" (CSV wins conflicts, keeps existing non-overlapping keys) via a toggle
- No automatic status changes on import — status stays as-is regardless of whether metrics are added
- No batch undo — experiments created normally; user can multi-select and delete if needed

### Claude's Discretion
- Exact wizard modal styling and responsive behavior
- CSV parsing library choice (Papa Parse or similar)
- Error handling for malformed CSV files (encoding, missing headers, inconsistent columns)
- Loading states during import processing
- Maximum file size and row count limits
- Tree preview rendering approach (reuse ExperimentNode or simplified tree view)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope

</user_constraints>

## Summary

Phase 6 introduces a CSV import wizard that lets researchers load experiment result files (e.g., hyperparameter sweeps) directly into the experiment tree. The core challenge is the column-mapping-to-hierarchy construction: raw CSV rows must be transformed into a parent-group tree before any experiments are written to the database.

The two-phase API pattern from BibTeX import (parse → confirm) maps cleanly onto this phase. The backend parse endpoint converts the uploaded CSV into a structured preview payload; the confirm endpoint performs bulk creation in dependency order (groups before leaves). The frontend wizard hosts four steps inside the existing `WindowModal` component: upload, column mapping, interactive tree preview, and final confirmation.

The biggest technical risks are (1) the ordering of bulk inserts — parent group nodes must be created before their children, requiring a topological traversal — and (2) collision handling, which requires cross-referencing the incoming experiment names against the existing flat experiment list before writing anything.

**Primary recommendation:** Use Papa Parse (browser-side CSV parsing) so the entire parse and column-mapping step is client-only, then POST only the structured experiment tree payload to the backend confirm endpoint. This avoids sending the raw CSV to the server and keeps the backend simple.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| papaparse | ^5.4.1 | CSV parsing in-browser | De-facto standard browser CSV parser; handles encoding, quoting, type coercion, streaming; MIT licensed |
| @dnd-kit/core + @dnd-kit/sortable | ^6.3.1 / ^10.0.0 | Drag-to-reparent in preview step | Already installed and used for experiment tree DnD |
| WindowModal | (internal) | Wizard host | Already used project-wide; supports fullscreen, minimize, backdrop |
| FastAPI + Pydantic | (existing) | Bulk import confirm endpoint | Existing pattern from BibTeX confirm endpoint |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest + @testing-library/react | (existing) | Unit tests for pure transform functions | CSV-to-tree logic, collision detection, auto-name generation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| papaparse (browser) | Backend CSV parsing (Python csv module) | Backend approach requires uploading raw bytes; complicates step 2 round-trip; browser approach is faster and keeps steps 1-3 entirely client-side |
| papaparse | d3-dsv | d3-dsv already installed but has no streaming, limited encoding support; papaparse is purpose-built for CSV |
| WindowModal wizard | Custom modal | WindowModal handles minimize/fullscreen/escape already; reuse saves 100+ lines |

**Installation:**
```bash
npm install papaparse
```
(Backend: no new Python dependencies — Python's stdlib `csv` module is not used since parsing is client-side.)

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── pages/
│   └── ProjectDetail.jsx        # Add CSVImportModal + "Import CSV" button in ExperimentSection
├── components/
│   └── (no new files needed — CSVImportModal lives in ProjectDetail.jsx)
backend/
├── routers/
│   └── experiments.py           # Add POST /api/projects/{project_id}/experiments/import-csv
├── models/
│   └── experiment.py            # Add ExperimentImportItem, ExperimentImportRequest, ExperimentImportResult
├── services/
│   └── experiment_service.py    # Add bulk_create_experiment_tree()
```

### Pattern 1: Two-Phase Parse → Confirm (client-side parse)
**What:** All CSV parsing and column mapping happens in the browser (Papa Parse). Step 1-3 of the wizard are entirely client-side state. Only step 4 (confirm) makes a network call.
**When to use:** When the parse result feeds an interactive preview before committing — sending raw CSV to the server for parsing would require a round-trip before the user can adjust mappings.
**Example:**
```javascript
// Step 2: parse with Papa Parse after file drop
import Papa from 'papaparse'

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,          // first row = column names
      skipEmptyLines: true,
      dynamicTyping: false,  // we do our own type detection (detectType())
      complete: (result) => resolve(result),
      error: (err) => reject(err),
    })
  })
}
```

### Pattern 2: CSV → Experiment Tree Construction
**What:** Pure client-side function that converts the column-mapped CSV rows into a nested tree structure ready for the preview step. Groups are created lazily by distinct value.
**When to use:** In the wizard's mapping confirmation step (Step 2 → Step 3 transition).
**Example:**
```javascript
// buildImportTree(rows, mapping) → { nodes: [...], collisions: [...] }
// mapping = { nameCol, groupCols: [{col, priority}], configCols: [], metricCols: [] }
// Returns array of tree nodes with temporary IDs for preview rendering.

function buildImportTree(rows, mapping, existingExps) {
  // groupCols sorted by priority (Group 1 first)
  const groups = {}   // key = group path string → node
  const result = []

  for (const row of rows) {
    // Build group path (Group 1 value, Group 2 value, ...)
    const groupPath = mapping.groupCols.map(g => row[g.col])
    let parentNode = null

    // Create group nodes lazily
    for (let i = 0; i < groupPath.length; i++) {
      const pathKey = groupPath.slice(0, i + 1).join('|')
      if (!groups[pathKey]) {
        const groupNode = {
          _tmpId: `grp_${pathKey}`,
          _type: 'group',
          name: groupPath[i],
          config: buildGroupConfig(mapping.groupCols.slice(0, i + 1), groupPath),
          metrics: {},
          children: [],
          parentTmpId: parentNode?._tmpId ?? null,
        }
        groups[pathKey] = groupNode
        if (parentNode) parentNode.children.push(groupNode)
        else result.push(groupNode)
      }
      parentNode = groups[pathKey]
    }

    // Leaf experiment
    const name = mapping.nameCol
      ? row[mapping.nameCol]
      : autoGenerateName(row, mapping.configCols)
    const leaf = {
      _tmpId: `leaf_${uniqueCounter++}`,
      _type: 'leaf',
      name,
      config: buildConfig(row, mapping.configCols, mapping.groupCols, groupPath),
      metrics: buildMetrics(row, mapping.metricCols),
      children: [],
      parentTmpId: parentNode?._tmpId ?? null,
      _collision: detectCollision(name, parentNode, existingExps),
    }
    parentNode ? parentNode.children.push(leaf) : result.push(leaf)
  }

  return result
}
```

### Pattern 3: Backend Bulk Create with Topological Order
**What:** The confirm endpoint receives the tree payload (parent-ordered) and creates experiments in BFS order so parents always exist before children.
**When to use:** In `POST /api/projects/{project_id}/experiments/import-csv`.
**Example:**
```python
# experiment_service.py
def bulk_create_experiment_tree(
    project_id: str,
    items: list[ExperimentImportItem],
    parent_id: Optional[str],
    merge_metrics: bool,
) -> list[ExperimentImportResult]:
    """
    Create a batch of experiments from an import payload.
    items must be BFS-ordered (parents before children).
    tmp_id → real_id mapping built as we go.
    """
    id_map: dict[str, str] = {}  # tmp_id → real experiment id
    results = []

    for item in items:
        real_parent_id = id_map.get(item.parent_tmp_id) if item.parent_tmp_id else parent_id

        if item.collision_action == "skip":
            results.append(ExperimentImportResult(tmp_id=item.tmp_id, status="skipped"))
            continue

        if item.collision_action == "update" and item.existing_id:
            # Merge or overwrite metrics on existing experiment
            existing = get_experiment(item.existing_id)
            if existing:
                new_metrics = (
                    {**existing.metrics, **item.metrics}  # merge: CSV wins conflicts
                    if merge_metrics
                    else item.metrics                      # overwrite
                )
                update_experiment(item.existing_id, ExperimentUpdate(metrics=new_metrics))
                id_map[item.tmp_id] = item.existing_id
                results.append(ExperimentImportResult(tmp_id=item.tmp_id, status="updated", id=item.existing_id))
                continue

        # Create new
        created = create_experiment(ExperimentCreate(
            project_id=project_id,
            parent_id=real_parent_id,
            name=item.name,
            status="planned",
            config=item.config,
            metrics=item.metrics,
        ))
        id_map[item.tmp_id] = created.id
        results.append(ExperimentImportResult(tmp_id=item.tmp_id, status="created", id=created.id))

    return results
```

### Anti-Patterns to Avoid
- **Child-before-parent insertion:** Inserting leaf experiments before their group parents fails FK constraints (parent_id references). Always BFS-flatten the preview tree before sending to the backend so parents come first.
- **Re-parsing CSV on every wizard step:** Parse once in Step 1 and store rows in component state. Re-rendering columns or the preview tree should use the already-parsed rows.
- **Using `dynamicTyping: true` in Papa Parse:** The project uses `detectType()` from `ProjectDetail.jsx` (handles booleans, numbers, strings consistently with KVEditor). Use `dynamicTyping: false` and run `detectType()` manually on each value.
- **Storing group values only on group nodes (not leaves):** The CONTEXT decision requires group column values stored on BOTH group nodes AND leaf experiments as config keys so the CompareModal can show all config without tree traversal. Easy to forget this on the leaf construction step.
- **Optimistic collision detection by name only:** Name collision must consider the resolved parent context. Two experiments named "resnet" under different parents are not collisions. Check `name` within the same `parent_id` scope only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing | Custom split-on-comma parser | `papaparse` | Quoted fields, escaped commas, multi-line values, BOM, encoding — CSV edge cases are infinite |
| Drag-to-reparent in preview tree | Custom DnD | `@dnd-kit/core` (already installed) | Accessibility, pointer/touch sensors, collision detection already configured in ExperimentSection |
| Wizard step management | Custom router-within-modal | Inline `step` state integer in CSVImportModal | Wizard has exactly 4 linear steps; a simple `const [step, setStep] = useState(1)` is sufficient |
| Type coercion from CSV strings | Custom type parser | Reuse `detectType()` from ProjectDetail.jsx | Ensures consistency with KVEditor behavior; already handles edge cases |

**Key insight:** The hardest part is not parsing CSV — it is the tree construction and collision detection, both of which are pure functions that should be tested independently before wiring into the wizard.

## Common Pitfalls

### Pitfall 1: BFS vs DFS order in bulk payload
**What goes wrong:** Preview tree is built depth-first (natural recursive structure) but the confirm payload needs parent-before-child order. If sent DFS, a leaf arrives before its parent group is created, so `parent_id` points to a non-existent experiment.
**Why it happens:** Preview tree is naturally a recursive structure; flattening recursively gives DFS order by default.
**How to avoid:** Flatten the preview tree with a BFS traversal (queue-based) before submitting to the confirm endpoint. Alternatively, accept DFS on the backend and sort by "depth" field (attach depth during tree construction).
**Warning signs:** `422` errors on confirm endpoint mentioning FK constraint violation, or groups not appearing in the tree after import.

### Pitfall 2: Temporary ID collisions across wizard steps
**What goes wrong:** The preview tree uses client-generated tmp IDs for rendering and parent references. If the user goes Back to Step 2 and changes column assignments, the tree is rebuilt with new tmp IDs. If any state (e.g., collision actions, renames) is keyed on the old tmp IDs, it becomes stale.
**Why it happens:** Wizard allows Back navigation — preview state can be rebuilt multiple times.
**How to avoid:** When transitioning Back from Step 3 to Step 2, fully reset all preview state (collision overrides, rename edits, excluded rows). Do not attempt to merge old preview state with a re-built tree.
**Warning signs:** User sees collision warnings on experiments they already marked as "Create new", or renames disappear after going Back and Next again.

### Pitfall 3: Group node deduplication across rows
**What goes wrong:** Multiple CSV rows share the same Group 1 value (e.g., "resnet"). Each row must map to the SAME group node, not create a new "resnet" group per row.
**Why it happens:** Building the tree row-by-row without tracking already-created groups.
**How to avoid:** Use a path-keyed lookup (e.g., `groups["resnet"]` or `groups["resnet|adam"]` for nested groups) so the same group is reused across rows. The code example in Architecture Patterns above shows this pattern.
**Warning signs:** The preview shows duplicate group nodes with the same name at the same level.

### Pitfall 4: Auto-generated name truncation
**What goes wrong:** Config-concatenated names like `lr=0.001_batch_size=128_model=transformer_variant=large_with_dropout=0.5_epochs=200` can be 80+ chars.
**Why it happens:** All config columns are concatenated without length check.
**How to avoid:** Cap auto-generated names at ~60 chars. Strategy: include all config keys but truncate individual values (e.g., `lr=0.001_bs=128_model=transfor...`). The CONTEXT specifies "truncate if excessively long" — implement a `autoGenerateName(row, configCols, maxLength=60)` utility.
**Warning signs:** Experiment names overflow their row in the preview tree.

### Pitfall 5: Empty header rows in uploaded CSVs
**What goes wrong:** Some CSV exports (Excel, Google Sheets) include blank rows at the top, or have trailing empty rows. Papa Parse with `skipEmptyLines: true` handles trailing empty rows, but not leading blank rows or rows with all-empty values.
**Why it happens:** CSV formatting varies by source tool.
**How to avoid:** After Papa Parse, filter `result.data` to remove rows where all values are empty strings. Show a warning if headers appear to be missing (first column header is empty).
**Warning signs:** Step 2 shows an empty or single-column mapping table.

### Pitfall 6: Collision detection scope
**What goes wrong:** Collision check compares incoming experiment names against ALL experiments in the project, not just experiments under the target parent.
**Why it happens:** It's simpler to check the full flat list.
**How to avoid:** Filter the existing experiments list to only those with `parentId === targetParentId` (or `parentId === null` for root-level). Group-level collisions (same group name under same parent) should also be checked — if a group named "resnet" already exists, the import should offer to add experiments under the existing group rather than creating a duplicate.
**Warning signs:** False collision warnings for experiments with the same name but different parents.

## Code Examples

Verified patterns from existing codebase:

### Auto-detect column type (reuse existing detectType)
```javascript
// Source: ProjectDetail.jsx line 118 — reuse this exact function
function detectType(raw) {
  const trimmed = String(raw).trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  const num = Number(trimmed)
  if (trimmed !== '' && !isNaN(num)) return num
  return trimmed
}
```

### Existing experiment flat list (for collision check)
```javascript
// Source: ExperimentSection in ProjectDetail.jsx line 2117
// flatExperiments is already available as state; pass it to CSVImportModal
const [flatExperiments, setFlatExperiments] = useState([])
// ...
<CSVImportModal
  projectId={projectId}
  existingExperiments={flatExperiments}  // pass for collision detection
  onImported={fetchExperiments}
  onClose={() => setShowCsvModal(false)}
/>
```

### Existing BFS flatten pattern (adapt for import payload)
```javascript
// Source: flattenExperimentTree in ProjectDetail.jsx line 79 — DFS version
// For confirm payload, use BFS instead:
function bfsFlattenImportTree(roots) {
  const queue = [...roots]
  const flat = []
  while (queue.length > 0) {
    const node = queue.shift()
    flat.push(node)
    if (node.children?.length > 0) queue.push(...node.children)
  }
  return flat
}
```

### Backend Pydantic models for confirm endpoint
```python
# backend/models/experiment.py — extend with:
from typing import Literal

class ExperimentImportItem(CamelModel):
    tmp_id: str
    parent_tmp_id: Optional[str] = None
    name: str
    config: dict[str, Any] = {}
    metrics: dict[str, Any] = {}
    collision_action: Literal["create", "update", "skip"] = "create"
    existing_id: Optional[str] = None  # populated when collision_action="update"

class ExperimentImportRequest(CamelModel):
    items: list[ExperimentImportItem]  # BFS-ordered, parents first
    parent_id: Optional[str] = None    # root target group
    merge_metrics: bool = False        # True = merge, False = overwrite

class ExperimentImportResult(CamelModel):
    tmp_id: str
    status: Literal["created", "updated", "skipped"]
    id: Optional[str] = None
```

### Frontend API client extension
```javascript
// frontend/src/services/api.js — add to experimentsApi:
export const experimentsApi = {
  // ... existing methods ...
  importCsv: (projectId, data) =>
    apiFetch(`/projects/${projectId}/experiments/import-csv`, { method: 'POST', body: data }),
}
```

### Step indicator pattern (consistent with existing wizard style)
```jsx
// Step indicator — consistent with BibtexExportModal / QuickAdd modal patterns
function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
            i + 1 === current
              ? 'bg-blue-600 text-white'
              : i + 1 < current
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-100 text-slate-400'
          }`}>
            {i + 1 < current ? '✓' : i + 1}
          </div>
          <span className={`text-xs ${i + 1 === current ? 'font-medium text-slate-700' : 'text-slate-400'}`}>
            {label}
          </span>
          {i < steps.length - 1 && <div className="w-6 h-px bg-slate-200" />}
        </div>
      ))}
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server-side CSV parsing (multipart upload) | Client-side CSV parsing (Papa Parse, no server needed) | Standard as of Papa Parse v4+ | Eliminates server round-trip for parse step; preview is instant |
| Sequential single-record creation | Bulk creation with tmp→real ID map | Established pattern | Required for tree hierarchy where parent IDs must resolve before children exist |
| Manual file input only | Drag-and-drop + click (HTML5 File API) | Browser standard for years | Better UX; same API (`event.dataTransfer.files[0]`) |

**Deprecated/outdated:**
- `csv-parse` (Node.js): server-side only; not applicable here since we parse client-side.
- Rolling your own CSV parser: never appropriate — Papa Parse covers all edge cases.

## Open Questions

1. **Group node collision: reuse or warn?**
   - What we know: Leaf collision is decided per-row (Update / Create / Skip). CONTEXT says "warn on name collisions" but doesn't specify what happens when an import group name matches an existing group.
   - What's unclear: Should importing under an existing group named "resnet" automatically merge into that group (add children to it), or warn and let the user decide?
   - Recommendation: Silently merge — if an import group name matches an existing experiment group under the same parent, add the new children under the existing group. This is the natural behavior and avoids blocking the import on every group name. Add a note in the preview tree "(merged with existing)" to make it visible.

2. **File size and row count limits**
   - What we know: Left to Claude's discretion (CONTEXT).
   - What's unclear: Exact limits. A 10,000-row CSV is ~500 KB; Papa Parse handles this fine in <50ms.
   - Recommendation: Enforce a 5 MB file size limit (client-side, before parsing) and 2,000 row soft-warning (no hard block). Display the row count after parsing so users can see what they're importing.

3. **Backend endpoint: project-scoped or experiment-scoped?**
   - What we know: CONTEXT says `POST /api/projects/{project_id}/experiments/import-csv`.
   - What's unclear: Whether to use a single confirm endpoint (as specified) or a two-phase parse+confirm (backend parses too).
   - Recommendation: Single confirm endpoint only. Parsing is client-side (Papa Parse). The backend receives the structured payload and performs bulk creation. This matches the CONTEXT code_context section which references `importCsvParse()` and `importCsvConfirm()` — but since parsing is fully client-side, `importCsvParse()` can be a local function rather than an API call.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 |
| Config file | `frontend/vite.config.js` (vitest config inline) |
| Quick run command | `cd frontend && npm run test:run -- --reporter=verbose ProjectDetail` |
| Full suite command | `cd frontend && npm run test:run` |

### Phase Requirements → Test Map

This phase introduces new requirements (CSV import) that extend EXP-01 through EXP-03.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CSV-01 | `buildImportTree()` constructs correct group hierarchy from rows + mapping | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 |
| CSV-02 | `buildImportTree()` stores group column values on both group nodes and leaf experiments | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 |
| CSV-03 | `autoGenerateName()` concatenates config values and truncates at 60 chars | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 |
| CSV-04 | `detectCollision()` matches only within the same parent scope | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 |
| CSV-05 | `bfsFlattenImportTree()` returns parents before children | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 |
| CSV-06 | `autoDetectColumnRoles()` assigns numeric columns as Metric, others as Config | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 |
| CSV-07 | Merge metrics: existing non-overlapping keys preserved; CSV wins conflicts | unit | `npm run test:run -- ProjectDetail.csvimport.test` | Wave 0 |
| EXP-01/02/03 | New experiments appear in tree after confirm import | smoke (manual) | manual — requires live backend | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npm run test:run -- ProjectDetail.csvimport.test`
- **Per wave merge:** `cd frontend && npm run test:run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/pages/ProjectDetail.csvimport.test.jsx` — covers CSV-01 through CSV-07
- [ ] `npm install papaparse` — CSV parsing library not yet in package.json

*(Existing test infrastructure: vitest configured, @testing-library/react installed, existing test files pass)*

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `frontend/src/pages/ProjectDetail.jsx` — buildExperimentTree, flattenExperimentTree, detectType, ExperimentSection, ExperimentNode, ExperimentCreateModal, DnD patterns
- Direct code inspection: `backend/services/experiment_service.py` — create_experiment, Experiment model, ID format, JSONB config/metrics
- Direct code inspection: `backend/routers/experiments.py` — existing endpoint patterns, project-scoped routes
- Direct code inspection: `backend/routers/papers.py` — BibTeX parse/confirm two-phase pattern (lines 285-430)
- Direct code inspection: `frontend/src/components/WindowModal.jsx` — wizard host API
- Direct code inspection: `frontend/src/services/api.js` — experimentsApi, apiFetch pattern
- Direct code inspection: `frontend/package.json` — @dnd-kit/* already installed; papaparse NOT installed

### Secondary (MEDIUM confidence)
- Papa Parse documentation: https://www.papaparse.com/ — header:true, skipEmptyLines, dynamicTyping options; browser-side parsing confirmed
- Papa Parse npm: papaparse@5.4.1 — current stable version as of 2025

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — papaparse is well-known; all other stack items directly verified in codebase
- Architecture: HIGH — two-phase pattern and tree construction directly modeled on existing BibTeX and experiment tree code
- Pitfalls: HIGH — BFS-vs-DFS ordering, tmp ID invalidation on Back navigation, and group deduplication are concrete bugs that arise from the specific decision constraints in CONTEXT.md

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable domain; papaparse API has been stable since v5)

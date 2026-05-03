# Phase 6: CSV Loading Framework for Experiments - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Researchers can import CSV files containing experiment results into the experiment tree. A CSV file maps to a set of experiments with config and metrics, optionally nested into a multi-level group hierarchy. The import includes a multi-step wizard with column mapping, tree preview, and conflict resolution. This phase does NOT add CSV export, scheduled imports, or external tool integrations (W&B, MLflow).

</domain>

<decisions>
## Implementation Decisions

### CSV-to-Experiment Column Mapping
- **Manual column assignment** in a mapping step — user assigns each column as: Experiment Name, Config, Metric, Group, or Skip
- **Auto-detect initial assignments** based on value types (all-numeric columns default to Metric, mixed/string columns default to Config), but user can override any assignment
- **One CSV row = one experiment** — no row merging or grouping by name
- If no column is assigned as Experiment Name, **auto-generate names by concatenating config values** (e.g., `lr=0.01_bs=32_model=resnet`)
- Values auto-detect types (number, boolean, string) — consistent with existing KVEditor behavior

### Import Target & Tree Nesting
- **User picks parent group** in the mapping step via a dropdown showing existing experiment groups + "Root level (no parent)"
- **Multi-level grouping** supported — columns assigned as 'Group' get a numbered priority (Group 1, Group 2, etc.) that determines nesting hierarchy
- Group 1 is top-level parent, Group 2 nests inside Group 1, leaf experiments nest at the bottom
- Group nodes are named by their column's distinct values (e.g., model_type=resnet → group named "resnet")
- **Group values stored on both parent group nodes AND leaf experiments** as config keys — ensures comparison modal shows all config across leaves without tree traversal

### Import UX & Entry Point
- **"Import CSV" button** in the Experiments tab header, next to "New Experiment"
- **Multi-step wizard modal**: Step 1 (Upload file) → Step 2 (Map Columns + role assignment) → Step 3 (Interactive tree preview) → Step 4 (Confirm & Import)
- Step indicators at top with Back/Next navigation
- **Interactive preview step** with full editing capabilities:
  - Rename groups (double-click to edit)
  - Exclude rows (checkboxes to skip specific experiments)
  - Rename experiments (double-click leaf names)
  - Rearrange hierarchy (drag to reparent/reorder)

### Update vs Create Behavior
- **Warn on name collisions** — preview step highlights experiments that match existing names under the target parent
- Per-match user choice: "Update metrics", "Create new", or "Skip"
- When updating metrics: **user chooses per-import** between "Overwrite all metrics" (replace entire dict) and "Merge metrics" (CSV wins conflicts, keeps existing non-overlapping keys) via a toggle
- **No automatic status changes** on import — status stays as-is regardless of whether metrics are added
- **No batch undo** — experiments created normally; user can multi-select and delete if needed

### Claude's Discretion
- Exact wizard modal styling and responsive behavior
- CSV parsing library choice (Papa Parse or similar)
- Error handling for malformed CSV files (encoding, missing headers, inconsistent columns)
- Loading states during import processing
- Maximum file size and row count limits
- Tree preview rendering approach (reuse ExperimentNode or simplified tree view)

</decisions>

<specifics>
## Specific Ideas

- Column mapping step should show a data preview (first 3-5 rows) so user can verify assignments make sense
- Tree preview should feel like a mini version of the real experiment tree — not a flat table
- The concatenated config name format (e.g., `lr=0.01_bs=32`) should use short key names and truncate if the name would be excessively long
- Group priority ordering (Group 1, Group 2) should be reorderable via drag or up/down arrows in the mapping step
- Conflict highlighting in preview should use amber for name collisions (consistent with config diff highlighting from Phase 4)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ExperimentSection` / `ExperimentNode` in `ProjectDetail.jsx`: Existing tree UI — reference for preview tree rendering
- `ExperimentCreateModal`: Modal for creating experiments — import could reuse the parent-selection dropdown pattern
- `KVEditor`: Inline key-value editor — reference for how config/metrics are displayed
- `WindowModal`: Generic modal component — host for the wizard
- `buildExperimentTree()`: Flat-to-nested tree builder — reuse for preview tree from mapped CSV data
- `experimentsApi` in `api.js`: API client for experiments — extend with bulk create/update endpoints
- `@dnd-kit/core` + `@dnd-kit/sortable`: Already installed for DnD in preview step

### Established Patterns
- CamelModel inheritance for all Pydantic models (auto camelCase serialization)
- Service layer owns all DB access; routers are thin
- `exclude_unset=True` for partial updates
- ID format: `exp_{uuid4.hex[:8]}` for experiments
- JSONB for config/metrics dicts with native type storage
- Config inheritance uses child-wins semantics (Phase 4's `getEffectiveConfig()`)
- BibTeX import uses two-phase parse/preview/confirm pattern — similar wizard flow reference

### Integration Points
- `ExperimentSection` in `ProjectDetail.jsx`: Add "Import CSV" button to header
- Backend: New `POST /api/projects/{project_id}/experiments/import-csv` endpoint (or two-phase: parse then confirm)
- Backend: Bulk experiment creation in `experiment_service.py`
- Frontend: New `CSVImportModal` component with wizard steps
- `experimentsApi`: Add `importCsvParse()` and `importCsvConfirm()` methods (mirroring BibTeX import pattern)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-implement-a-csv-loading-framework-to-nest-into-the-experimental-design*
*Context gathered: 2026-03-16*

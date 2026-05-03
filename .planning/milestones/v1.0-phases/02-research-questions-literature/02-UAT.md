---
status: complete
phase: 02-research-questions-literature
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md, 02-06-SUMMARY.md
started: 2026-03-15T13:00:00Z
updated: 2026-03-15T13:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running backend. Run: cd backend && uv run uvicorn app:app --reload --port 8000. Server boots without errors. Open the app — projects list loads, no crash.
result: pass

### 2. Create a Primary Research Question
expected: Open a project. On the Overview tab, find the Research Questions section. Type a question in the "Add a research question…" input and press Enter. The new RQ appears in the list with status "open" and a warning_amber gap indicator (no papers linked yet).
result: pass

### 3. Add a Sub-question
expected: Click the chevron/expand on a root RQ to expand it. In the expanded section, find the sub-question input ("Add a sub-question…"), type a question, press Enter. It appears indented below the parent RQ.
result: pass

### 4. Inline Edit a Question
expected: Click on any question text — it becomes an editable input. Change the text. Press Enter (or click away) — the updated text is saved. Press Escape instead — the change is discarded and original text restored.
result: pass

### 5. RQ Status Badge
expected: Click the status pill on any RQ (shows "open" by default). A dropdown appears with options: open, investigating, answered, discarded. Select one — the badge updates immediately with the correct color and label.
result: pass

### 6. Add a Hypothesis
expected: Expand an RQ. Click "Add hypothesis…" — it becomes an editable input. Type a hypothesis and press Enter. The text is saved and shows in the expanded area. Click it again to edit, clear it entirely and save — it returns to "Add hypothesis…" placeholder.
result: pass

### 7. Delete RQ (with cascade confirmation)
expected: Three-dot menu on a root RQ that has sub-questions → Delete. A confirm dialog appears saying it will also delete the N sub-questions. Confirm → both the parent and sub-questions disappear. For a leaf RQ (no children), deletion happens without a confirm dialog.
result: pass

### 8. Literature Tab — Linked Papers Table
expected: Click the Literature tab (book icon) on a project. Papers/websites linked to the project show in a table with Title, Type badge (blue=Paper, purple=Website), and an unlink button. Empty state shows a dashed border with a book icon if nothing is linked.
result: pass

### 9. Search and Link a Paper to the Project
expected: On the Literature tab, click the search picker. Type a few letters of a paper title from your library. Dropdown shows matching papers and websites. Click one → it appears in the literature table immediately. Searching again shows the linked item with a checkmark (non-clickable).
result: pass

### 10. RQ Gap Indicator
expected: A root RQ with no linked papers shows a warning_amber (orange triangle) icon. Link a paper to that RQ via the "Link paper" button in the expanded RQ area. After linking, the warning_amber icon disappears from that RQ.
result: pass

### 11. Drag to Reorder Siblings
expected: In the Overview tab with 2+ root RQs, grab the drag_indicator (⠿) handle on one RQ and drag it above or below another root RQ. Release — the order changes and persists on refresh.
result: pass

### 12. Nest Under (Context Menu)
expected: Three-dot menu on a root RQ → "Nest under…". A picker panel appears inside the dropdown listing other root RQ names. Click one → the RQ disappears from the root level and appears as a sub-question under the chosen target. The option only shows when other root RQs exist.
result: pass

### 13. Promote to Root (Context Menu)
expected: Three-dot menu on a sub-question → "Promote to root". The sub-question moves up to the root level. The tree refreshes and the item appears as a new root RQ.
result: pass

### 14. Move Under (Context Menu)
expected: Three-dot menu on a sub-question → "Move under…". Picker panel shows all root RQs. Click a different parent → the sub-question moves to that new parent. It no longer appears under the old parent.
result: pass

### 15. Link to Project from Paper Page
expected: Open any paper from the Library. In the header, find a link icon button. Click it — a dropdown lists your projects with their status badge. Click a project → the paper is linked. If already linked, a checkmark shows next to that project name.
result: pass

## Summary

total: 15
passed: 15
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]

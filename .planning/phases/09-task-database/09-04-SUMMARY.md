---
phase: 09-task-database
plan: 04
status: complete
started: 2026-03-20
completed: 2026-03-20
---

## What was built

CalendarView component — a month grid showing tasks on their due dates with an unscheduled sidebar, drag-to-date assignment, and drag-to-reschedule. Uses the existing `getMonthGrid` pure function for the 42-cell layout.

## Key files

### Modified
- `frontend/src/pages/ProjectTasks.jsx` — Added CalendarView (~378 lines), total file now ~2290 lines

## Features
- Month grid (42-cell, 6-week layout) with day-of-week headers (Sun-Sat)
- Colored task chips on due dates (column color, red border if overdue)
- "+N more" overflow popover for cells with >3 tasks
- Today cell highlighted with blue tint
- Prev/Next month navigation + Today reset button
- Unscheduled sidebar (right) listing tasks without due dates as draggable cards
- DndContext with useDroppable per date cell, useDraggable on task chips
- DragOverlay with floating card during drag

## Deviations

None.

## Self-Check: PASSED

- [x] User can view tasks on a month calendar where tasks appear on their due date
- [x] Tasks without a due date appear in the unscheduled sidebar
- [x] User can drag a task from the unscheduled sidebar onto a calendar date
- [x] User can drag a task chip from one date to another to reschedule
- [x] User can navigate between months
- [x] User can click a task chip to open the TaskDetailPanel

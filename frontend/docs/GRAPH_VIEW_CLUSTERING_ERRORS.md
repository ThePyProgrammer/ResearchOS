# Graph View Hull Exclusion — Work Log

## Context

File: `frontend/src/components/NoteGraphView.jsx`

The graph view renders notes as nodes in a D3 force simulation. Notes belonging to the same paper/source are visually grouped by a convex hull (a smooth padded polygon drawn behind the nodes). The request was to ensure no note from one paper could enter the convex hull of a different paper — either via simulation drift or user dragging.

---

## Round 1 — Implement the feature

### What was attempted

Four changes to enforce the invariant:

**1. `pushOutOfHull(px, py, hull)` helper (module-level)**
A function that iterates every edge of a convex hull polygon and returns the nearest point on the boundary. Given a point known to be inside the hull, this finds where to eject it to.

**2. `hullPolygons` closure map + `key` in `hullEntries`**
A plain object `{}` declared inside the D3 `useEffect`, keyed by `sourceKey` (e.g. `'paper:abc123'`). Each `hullEntries` entry was given a `key` field. Every tick, after computing each group's hull polygon with `d3.polygonHull`, the result was stored in `hullPolygons[key]`. This kept a live snapshot of every group's current boundary polygon, accessible to both the exclusion force and the drag handler.

**3. `hullExclusionForce(alpha)` registered as a D3 simulation force**
On every simulation tick, for each node, iterated over all hull polygons belonging to foreign groups (where `key !== d.sourceKey`). Used `d3.polygonContains(hull, [d.x, d.y])` to check containment. If inside, called `pushOutOfHull` to find the nearest boundary point, then applied a velocity impulse: `d.vx += (ex - d.x) * 3 * alpha`. Registered this on the simulation as `.force('hullExclusion', hullExclusionForce)`.

**4. Drag handler clamping**
Modified the `'drag'` event handler. Before committing `d.fx = event.x; d.fy = event.y`, iterated `hullPolygons` and used `d3.polygonContains` to check if the cursor position was inside a foreign hull. If so, called `pushOutOfHull` to clamp the position to the hull boundary instead.

### What went wrong

Two problems caused the graph to crash (zoom stopped working, interaction froze):

- **`d3.polygonContains` does not exist in this project's D3 build.** The existing code only uses `d3.polygonHull` and `d3.polygonCentroid`. Every call to `d3.polygonContains` threw `TypeError: d3.polygonContains is not a function` — once per simulation tick (inside the registered force) and once per drag event. This crashed D3's internal timer loop and corrupted the drag event pipeline.

- **`hullExclusionForce` fought directly against `clusterForce`.** Both ran as registered forces every tick. `clusterForce` applied velocity pulling each note toward its group centroid. `hullExclusionForce` applied opposing velocity pushing notes away from foreign hull boundaries. When these forces were balanced, they created perpetual oscillation that kept the simulation from ever settling, starving the browser event loop and making zoom and all other interaction appear broken.

---

## Round 2 — Attempt to fix the crash

### What was attempted

**1. Replaced `d3.polygonContains` with a self-contained `pointInPolygon(px, py, polygon)` helper**
Standard ray-casting point-in-polygon algorithm. Works for any simple polygon. No D3 dependency. Used in both the tick correction and the drag handler.

**2. Removed `hullExclusionForce` as a registered simulation force**
Deleted the `.force('hullExclusion', hullExclusionForce)` registration to eliminate the force vs. force oscillation.

**3. Added `applyHullExclusion()` called at the end of the tick handler**
Instead of a velocity-based force, this function directly corrected `d.x` and `d.y` after D3 had already advanced positions for the tick. For each node inside a foreign hull, it called `pushOutOfHull` to find the boundary point, snapped `d.x/d.y` to that point, and attempted to zero out the inward velocity component.

**4. Updated drag handler**
Replaced `d3.polygonContains` calls with `pointInPolygon`.

### What went wrong

The graph still crashed. Two bugs remained in `applyHullExclusion`:

- **Outward normal was always `(0, 0)`.** The velocity correction code computed the normal as `ndx = d.x - ex`, `ndy = d.y - ey` — but this was done *after* `d.x` had already been set to `ex` and `d.y` to `ey`. So `ndx` and `ndy` were always exactly `0`. `len` resolved to `1` (via `|| 1`), `dot` was always `0`, and the `if (dot < 0)` branch never fired. The velocity was never corrected. On the very next tick, D3 applied the unchanged (inward-pointing) velocity and moved the node back inside the foreign hull. `applyHullExclusion` then snapped it back to the boundary. This created 60fps oscillation — visually indistinguishable from a frozen/crashed graph.

- **Render order bug.** The tick handler called `nodeEls.attr('transform', ...)` *before* calling `applyHullExclusion()`. This meant the corrected position was only reflected in the DOM on the *next* tick, so every frame rendered the pre-correction (interior) position. The flickering between the interior position and the boundary position was visible on every frame.

---

## Round 3 — Attempt to fix the remaining bugs

### What was attempted

**1. Fixed the outward normal bug**
Moved the normal computation to *before* the position snap:
```js
const [ex, ey] = pushOutOfHull(d.x, d.y, hull)
const ndx = ex - d.x   // computed while d.x is still the interior position
const ndy = ey - d.y
const len = Math.sqrt(ndx * ndx + ndy * ndy) || 1
const dot = (d.vx * ndx + d.vy * ndy) / len
if (dot < 0) { d.vx -= dot * ndx / len; d.vy -= dot * ndy / len }
d.x = ex   // snap AFTER computing normal
d.y = ey
```
This correctly cancels the inward velocity component before position is corrected.

**2. Fixed the render order**
Restructured the tick handler into four explicit steps:
1. Compute hull polygons from D3-advanced positions → populate `hullPolygons`
2. Call `applyHullExclusion()` to correct positions
3. Render links and nodes at corrected positions
4. Redraw hull paths and labels from corrected positions (updating `hullPolygons` again)

This ensured the corrected position is what gets drawn in the same frame, eliminating the flicker.

### Outcome

All three rounds of changes were subsequently reverted at the user's request, restoring `NoteGraphView.jsx` to its original state.

---

## Summary of root causes

| Round | Bug | Effect |
|---|---|---|
| 1 | `d3.polygonContains` missing from D3 build | TypeError thrown on every tick and drag event, crashing simulation and interaction |
| 1 | Velocity force fought cluster force | Perpetual oscillation, simulation never settled, event loop starved |
| 2 | `ndx/ndy` computed after `d.x = ex` | Normal always `(0,0)`, velocity never corrected, node bounced back into hull every tick at 60fps |
| 2 | Nodes rendered before exclusion ran | Corrected position 1 frame late, visible per-frame flicker |

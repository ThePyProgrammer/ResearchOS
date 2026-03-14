# Feature Landscape

**Domain:** Research project management + experiment tracking (integrated into reference manager)
**Researched:** 2026-03-14
**Confidence:** MEDIUM — web search unavailable; analysis based on training knowledge of MLflow, W&B, Neptune, Comet, DVC, Notion, and academic workflow patterns. Core experiment tracking features are stable and well-understood; edge features may have evolved.

---

## Table Stakes

Features users expect. Missing = product feels incomplete or unusable.

### Project Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Project entity with name, description, status | Every PM tool has this; researchers need a container for related work | Low | Status: active/paused/completed/archived |
| Project list view | Orientation — where are my projects? | Low | Card or table; show status, last-updated, experiment count |
| Project detail view | Central hub for a project's entire context | Medium | Must show RQs, experiments, linked papers in one place |
| Research question (RQ) definition | The "why" of a project — without it, experiments lack framing | Low | Primary RQ + sub-questions; plain text with optional hypothesis field |
| Link papers/websites to a project | Projects reference existing library items | Medium | Many-to-many join; show papers relevant to this project without duplicating them |
| Project-level notes/documents | Free-form space for thinking, plans, meeting notes | Low | Reuse existing tiptap notes system; project_id FK on notes table |

### Experiment Tracking

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Experiment entity with name and status | Core unit of experiment tracking | Low | Status: planned/running/completed/failed |
| Configuration parameters per experiment | Can't reproduce an experiment without knowing what was run | Medium | Key-value pairs (JSONB); supports strings, numbers, booleans |
| Key metrics per experiment | The "what happened" — without metrics, tracking is useless | Medium | Key-value pairs; distinguish primary metric from secondary |
| Experiment tree (hierarchical grouping) | Mirrors paper experimental sections; groups ablations, sweeps, variants | High | Parent nodes aggregate; leaf nodes are concrete runs |
| Parent experiment nodes | Summarize a family of experiments (e.g., "ResNet ablations") | Medium | No config/metrics of their own; derive summary from children |
| Planned status | Researchers plan before they run; need a future-state slot | Low | Planned experiments show as "to do" in the tree |
| Experiment timestamps | When was this run? Needed for reproducibility and timeline | Low | created_at + completed_at on each experiment node |
| Notes per experiment | Log observations, ideas, next steps inline | Medium | Reuse notes system with experiment_id FK |

### Navigation & Discoverability

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Project sidebar entry | If projects aren't in the nav, users forget they exist | Low | Add "Projects" section to existing Sidebar.jsx |
| Breadcrumb navigation in tree | Experiment trees get deep; users need to know where they are | Low | Project > Experiment group > Leaf |
| Status indicators / badges | At a glance: is this experiment done, running, failed? | Low | Color-coded chips; consistent with existing UI patterns |

---

## Differentiators

Features that set the product apart. Not universally expected, but high-value for the target user.

### Integration with Literature Library (unique to ResearchOS)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Motivating papers" on research questions | Links RQ sub-questions to specific papers that motivated them — closes the literature-to-hypothesis loop | Medium | Paper chips on RQ; shows which papers informed this question |
| "Supporting literature" on experiments | Link specific papers to an experiment as the source of a design choice | Medium | Many-to-many experiment-paper join; "why did you use this architecture?" answered by citing the paper |
| RQ-to-paper gap detection (future agent hook) | Highlights RQs that have no linked literature — surface for literature search agent | Low (data only) | Just a computed flag; agent behavior is future work |
| Experiment notes auto-populated with cited papers | When creating an experiment, suggest relevant papers from linked literature | High | Needs semantic matching; defer to agent milestone |

### Experiment Tree UX

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Drag-and-drop experiment reparenting | Reorganize an experiment tree without re-creating nodes | High | Similar to sidebar collection drag-drop; complex tree mutation |
| Tree-level metric comparison table | Select multiple leaf experiments → side-by-side metric comparison | Medium | Table view; sortable by any metric key. Like W&B Table but simpler |
| Best experiment highlight | Auto-identifies the leaf with the best primary metric value within a parent group | Low | Computed client-side; "best" = highest or lowest depending on metric type |
| Experiment duplication ("branch from here") | Duplicate a completed experiment as a new planned one with same config as baseline | Low | One-click create new sibling with copied config fields |
| Config diff between experiments | Show which config fields differ between two experiments in the same group | Medium | Useful for ablation analysis; highlights what changed |

### Research Question Structure

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Sub-questions with parent RQ | Research questions decompose; tracking sub-questions maps to specific experiments | Medium | Hierarchical RQ structure; RQ tree mirrors experiment tree |
| Hypothesis field per RQ | "What do I expect?" is valuable even before experiments — tracks scientific rigor | Low | Optional text field on RQ; can compare predicted vs actual after experiments |
| RQ status (open/investigating/answered/discarded) | Shows research progression at a glance | Low | Status field on RQ; "answered" can link to experiment result |

### Project Dashboard

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Metrics summary card per project | How many experiments planned/running/completed/failed? | Low | Computed counts from experiment tree |
| Literature coverage indicator | How many papers are linked to this project? Shows research depth | Low | Count of linked papers; links to library |
| Progress bar toward RQ answer | Visual representation of how far along the project is | Medium | Subjective, but: X of Y sub-questions have completed experiments |

---

## Anti-Features

Features to deliberately NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Live experiment runner / code execution | ResearchOS is a tracking tool, not a compute platform. Running code in-app adds massive security surface and infra complexity. | Let researchers run locally and record results manually or via API. External integration (W&B import) is a future milestone. |
| Real-time metric streaming | Requires websocket infrastructure, agent execution environment, SDK integration — none of which exist yet. | Record metrics as static values after the experiment completes. |
| Artifact/file storage for experiment outputs | Model weights, plots, and data files balloon storage costs and complicate the data model. | Store artifact references (paths/URLs) as text fields. Actual files stay on researcher's local disk or cloud storage. |
| Automatic hyperparameter search (sweep UI) | Requires experiment runner integration or agent infra. Out of scope for this milestone. | Represent a sweep as a parent node with many planned leaf children — the researcher runs them manually. |
| Gantt chart / timeline planning | Project management tools with Gantt are different products (Asana, Jira). Researchers don't think in timelines. | Status tracking (planned/running/completed/failed) captures enough progress signal without the overhead. |
| Team collaboration features | Single-user system. Adding collaboration requires auth, presence, conflict resolution. | Keep all sharing as export (BibTeX, notes). |
| Git integration for experiment versioning | Git integration with commit-level experiment tracking (like DVC, Comet) is complex and adds a dependency on git internals. | Manual config recording covers the core need. Git integration is a future hook point. |
| Notifications and reminders | Adds infra (email/push), adds complexity, not core to the research workflow. | Status is visible on the project dashboard — the researcher checks in deliberately. |
| Citation generation from experiments | Experiments don't become citable until written up as papers. Writing tool is a future milestone. | Notes on experiments can hold draft citations; no automated reference generation. |

---

## Feature Dependencies

```
Project entity
  └─ Research Questions (require project)
       └─ Sub-questions (require parent RQ)
            └─ Motivating paper links (require papers + RQs)

Project entity
  └─ Experiment tree root (requires project)
       └─ Parent experiment nodes (require project; may nest)
            └─ Leaf experiments (require parent node or project root)
                 └─ Config parameters (require experiment)
                 └─ Metrics (require experiment)
                 └─ Notes (reuse existing notes; require experiment_id FK)
                 └─ Supporting paper links (require papers + experiment)

Project entity
  └─ Project notes (require project; reuse existing notes system)
  └─ Linked papers/websites (require library items + project)

Metric comparison table → requires multiple leaf experiments with overlapping config keys
Config diff view → requires two leaf experiments
Best experiment highlight → requires primary metric designation on parent node
Experiment duplication → requires completed or planned leaf experiment
```

---

## MVP Recommendation

The minimum viable feature set that delivers the core value proposition (literature → question → experiment → result):

Prioritize in order:

1. **Project CRUD** — name, description, status, linked library. Project list + detail views. Sidebar navigation entry.
2. **Research questions** — primary RQ + sub-questions per project. Simple text fields. No hypothesis or status needed at MVP.
3. **Link papers to project** — many-to-many join; show linked papers on project detail.
4. **Experiment tree** — parent nodes + leaf nodes. Hierarchical. Create/edit/delete.
5. **Leaf experiment fields** — name, status, config (JSONB key-value), metrics (JSONB key-value), notes.
6. **Project dashboard** — experiment status counts, linked paper count, RQ list.

Defer from MVP:

- **Config diff between experiments** — valuable but adds UI complexity; defer to phase 2 of this milestone.
- **Metric comparison table** — useful but not blocking; can do manually in notes until implemented.
- **Hypothesis field on RQ** — nice to have; add after basic RQ structure works.
- **Motivating paper links on RQs** — secondary link (papers already linked at project level); defer.
- **Drag-and-drop tree reparenting** — high complexity, low urgency; reorganize via edit instead.
- **Best experiment highlight** — low effort but low priority vs getting the tree working first.

---

## Competitive Context (MEDIUM confidence — training knowledge)

**MLflow:** Strong experiment run tracking (params, metrics, artifacts, tags). Weak on project organization and research question management — it's a run log, not a research OS.

**Weights & Biases:** Best-in-class metric dashboards, parallel coordinate plots, sweep management. Requires W&B SDK in training code. Designed for ML teams, not solo academic researchers. No concept of research questions or literature integration.

**Neptune.ai:** Similar to W&B. Good run comparison UI. No project-level narrative or literature linking.

**Notion for research:** Strong free-form notes and project organization. Zero experiment tracking — researchers hack it with tables. No literature integration.

**Obsidian + plugins:** Strong knowledge management and paper notes. No experiment tracking. Literature linking via backlinks is manual.

**ResearchOS gap:** No existing tool combines literature management + research question framing + experiment tracking in a single system. The literature-to-experiment linkage is the unique differentiator.

---

## Sources

- Project requirements: `.planning/PROJECT.md`
- Domain knowledge from training: MLflow docs, W&B docs, Neptune docs, Comet docs (training cutoff August 2025)
- Web search unavailable in this environment — findings marked MEDIUM confidence where web verification would strengthen claims
- Note: Experiment tracking tool core features (params, metrics, runs, grouping) are stable and well-established; confidence is HIGH for table stakes, MEDIUM for differentiator prioritization

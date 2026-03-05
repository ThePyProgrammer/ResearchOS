# Integrated Research Planning, Agent Orchestration, and Reference Management System

## Problem framing and product thesis

You’re effectively building an opinionated “research operating system” that merges two historically separate products:

A “workflow OS” for AI-mediated research planning and execution: multi-step, tool-using, stateful processes that convert ambiguous goals (“explore X”) into structured artifacts (plans, experiment designs, curated paper sets, reports). The entity["organization","AERO","ml research workflow toolkit"] example you referenced is instructive because it already decomposes research work into modular, LLM-driven workflows (e.g., model recommendation, research planning, experiment design, experimental follow-ups, report writing), and it explicitly frames those workflows as composable units that can be run independently or chained. citeturn4view0turn4view1turn4view2

A “collaborative research library” like entity["organization","Zotero","reference manager software"]: papers and metadata storage, hierarchical collectioning, tagging, notes/annotations, and collaboration. Zotero’s design also illustrates a subtle but important model: “collections are playlists,” i.e., an item can be in multiple collections without duplication, and collections can have subcollections. citeturn11search17turn13search2

The integrated thesis that makes the combination compelling is:

Your paper repository is not just storage. It’s the *knowledge substrate* that your agents read from and write to (with provenance) while executing research workflows.
Your agents are not just chatbots. They are *controlled workflow executors* whose outputs (paper lists, literature review drafts, experiments, reports) are first-class artifacts inside the repository.

That “closed loop” is how you get compounding value: each workflow run improves the underlying library (curated collections, tags, notes, paper-to-topic mappings), and the improved library makes later workflows faster and higher quality.

## Reference architecture for an integrated research OS

A scalable architecture that stays integrated (rather than devolving into many disconnected features) is easiest to maintain if you separate concerns into two planes while keeping a single source of truth for domain objects.

**Knowledge plane (system of record):**
- Relational database for canonical domain objects: Works/Papers, Collections, Tags, Comments, Prompts, Workflow Runs, Permissions, Audit entries.
- Object storage for PDFs and large attachments (and optionally extracted full-text / intermediate parse outputs).
- Search indexes for retrieval: lexical full-text and semantic/vector (see ingestion section for options and tradeoffs).

**Execution plane (agent + workflow runtime):**
- A workflow runtime that can run long-lived, stateful jobs with retries, timeouts, and human approvals, and that can emit structured events back into the knowledge plane.
- Agent tool adapters (connectors) that expose your domain actions in a controlled way (e.g., “add paper to collection,” “create literature review snapshot,” “request user approval to attach PDF”).

A durable workflow engine is worth considering early because the entire “autonomous orchestration” part of your system depends on reliable long-running execution. entity["company","Temporal","durable workflow engine"] describes Workflow Executions as durable/reliable/scalable function executions, with persisted state and recovery semantics that let work continue across failures. citeturn6search7turn6search22

**Eventing and observability (cross-cutting):**
- Treat every workflow run as an event producer. Persist:
  - inputs (prompts, constraints, library context snapshot IDs),
  - tool calls and tool results (structured),
  - intermediate artifacts (drafts, candidate paper sets, filters applied),
  - final artifacts and user approvals.
- This is important not just for debugging—your UX can surface “how did this end up in my library?” as a first-class explanation using run provenance, without exposing any private model chain-of-thought.

**Security and tenancy:**
- Workspace/lab tenants with RBAC on objects (paper visibility, collection edit rights, agent run permissions).
- “Capability-based” tool permissions: agent identities should only be able to call tools according to scopes granted by the workspace and/or by a user session.

This architecture is intentionally compatible with the design patterns used by orchestration frameworks: graph/state-machine style execution plus tools; durable execution for long jobs; and clean boundaries between storage, indexing, and execution.

## Core domain model and essential specs

To keep the build “integrated and deep,” choose a domain model that (a) supports Zotero-like library management and (b) supports workflow runs as first-class citizens that can create/modify library objects with provenance.

A practical minimal model (expandable later) looks like this.

**Work (canonical paper record):**
- Identifiers: DOI, arXiv ID, Semantic Scholar paper IDs, OpenAlex IDs, ISBN/ISSN where relevant.
- Bibliographic: title, abstract, authors (normalized), venue, year/date, links, license fields, full-text availability pointers.
- Integrity + dedupe: unique constraints on DOI/arXiv; plus “fuzzy duplicate candidate” system (title normalization + author/year).
- Evidence fields: where each metadata field came from (source + timestamp + confidence).

This model aligns with what external providers actually give you. For example, OpenAlex’s work objects explicitly include fields like lists of referenced works and “related works” computed algorithmically. citeturn0search10

**Collections and nested lists (Zotero-like):**
- Collection nodes (tree): id, parent_id, name, description, sort order.
- Many-to-many membership between Work and Collection (to support “playlists”): Zotero explicitly emphasizes that items can live in multiple collections and subcollections without duplication. citeturn11search17turn13search2
- Tags: many-to-many Work↔Tag, plus optional Collection↔Tag.

For hierarchical trees in Postgres, you have three mainstream choices: adjacency lists with recursive queries, closure tables, or materialized paths. If you want strong DB-level support for “path-like” queries (descendants, ancestors, subtree filtering), Postgres’s `ltree` extension provides a hierarchical “label tree” datatype and operators for searching through label trees. citeturn13search0

**Notes, annotations, and threaded comments:**
- Notes as rich-text documents linked to (Work) or linked to (Work, location span) if you do PDF anchoring.
- Threaded comments as a general-purpose entity, targetable to Work, Collection, or Note:
  - comment_id, parent_comment_id (threading), target_type, target_id, author_id, body, created_at.
- For real-time collaborative editing in notes/literature reviews, a CRDT-based approach reduces merge pain. Yjs positions itself as a high-performance CRDT with shared types intended for collaborative applications. citeturn5search3turn5search7

**Literature review prompts as first-class objects:**
- Prompt: the textual topic prompt + constraints (“last 3 years,” “focus on X dataset,” “exclude surveys”).
- Prompt-to-papers: a “curation set” that includes candidate works with scores, and a separate “approved set” that becomes a stable snapshot.
- Scheduling (optional): allow “refresh” runs on demand or scheduled; each run creates a new proposed delta.

**Workflow definitions and runs (the bridge between planes):**
- WorkflowDefinition: name, description, version, graph/DSL spec, tool permissions required.
- WorkflowRun: inputs, owning user/workspace, current status, event log pointer, artifacts produced.
- Artifacts: typed outputs such as “paper list,” “literature review draft,” “experiment plan,” “report,” plus links to Works/Collections created or updated.

This is the heart of integration: every agent workflow should read the knowledge plane and write back to it via explicit domain tools, leaving a traceable run record.

**Citation formatting and interchange:**
- If you want Zotero-like citation export and formatting, don’t invent a custom bibliographic format. CSL-JSON (“citeproc JSON”) is already widely used by CSL processors. The CSL primer describes CSL JSON as a JSON-based format introduced for citeproc-js and adopted by other processors. citeturn5search5
- citeproc-js docs describe CSL-JSON’s constraints (e.g., item `type` must be a CSL type), which can guide your schema validation if you support CSL-JSON exports. citeturn5search1turn5search29

## Ingestion, metadata enrichment, and search

Your ingestion system determines both (a) how “Zotero-like” the library feels and (b) how capable your agents are at paper discovery and grounded writing. The core design constraint is that scholarly data providers have rate limits, licensing constraints, and sometimes recently-changing access rules—so you need caching, idempotency, and graceful degradation.

**Ingestion entry points (must-haves):**
- Add by DOI.
- Add by arXiv ID.
- Add by URL (landing page) with best-effort extraction (optional early).
- Upload PDF (with parse + metadata extraction).
- Import from BibTeX/RIS/CSL-JSON (later, but valuable).

### Metadata sources to integrate

**entity["organization","Crossref","doi registration agency"] for DOI metadata**
- Crossref’s REST API exposes bibliographic metadata and more, including license information and relationships to other research objects. citeturn0search3turn0search11
- For text/data mining flows, Crossref notes that it “only collects metadata,” but that metadata often includes full-text URLs plus intended application and license info; it also warns that the presence of a URL does not guarantee access. citeturn17view0
- Crossref’s rate limits were revised starting December 1, 2025, and they explicitly encourage using `mailto` for the “polite pool” and caching results. citeturn16view0
- Crossref also lists community libraries (e.g., `crossref-commons`, `habanero`, and others) which can speed up implementation if you don’t want to hand-roll HTTP clients. citeturn15view1

**entity["organization","arXiv","preprint repository"] for preprint metadata**
- arXiv’s API provides programmatic access to e-print metadata and search facilities. citeturn1search2turn1search10
- arXiv imposes rate limits on legacy APIs (including the arXiv API), including “no more than one request every three seconds” and “single connection at a time,” so bulk ingestion must be throttled or shifted to other mechanisms (e.g., OAI-PMH or snapshot approaches). citeturn1search18turn1search6

**entity["organization","Unpaywall","open access lookup"] for open-access resolution**
- Unpaywall is described as a non-profit service that finds open access copies by DOI and returns OA links plus metadata such as licensing/provenance information. citeturn14view1
- roadoi (an rOpenSci wrapper) documents that Unpaywall requires an email address, suggests ~100k calls/day per user, and offers data dumps for higher-volume needs. citeturn14view0turn14view1
- A Python integration path exists too: `unpywall` exposes functions like “get PDF link,” “best OA link,” and access to the full JSON response. citeturn14view2

**entity["organization","OpenAlex","open scholarly index"] for discovery, graph context, and (optionally) semantic search**
OpenAlex is attractive for “AI that can add papers” because it’s fundamentally a scholarly knowledge graph: Works, authors, sources, institutions, topics, and their connections. citeturn12search1turn0search2

Key operational considerations changed very recently:
- OpenAlex states that *starting February 13, 2026*, an API key is required; free keys have a daily budget ($1/day) and a max of 100 requests/sec, and “singleton requests” are free while list/semantic search calls consume budget. citeturn12search2turn12search21turn12search23
- OpenAlex provides a “snapshot” (bulk data) option; its docs describe the snapshot as being stored in an Amazon S3 bucket as gzip-compressed JSON Lines files, and updated about once per month. citeturn12search0turn12search3turn12search22
- OpenAlex’s semantic search is explicitly described as embedding-based retrieval (1024-d vectors) with per-query cost under the API budget model. citeturn12search17

Design implication: if you want “agents that continuously scan literature” at scale, you almost certainly need a hybrid strategy:
- use the API for low-volume, interactive lookups and singleton fetches (free),
- use snapshots (bulk) or internal caching for high-volume refresh workflows.

OpenAlex also documents that its data is aggregated from multiple sources, including Crossref and identifiers like ORCID and ROR, which helps with normalization. citeturn10search7turn10search11

**entity["organization","Semantic Scholar","ai2 research search engine"] for citation graph and embeddings**
- Semantic Scholar’s API is positioned as a REST API for publication data about authors, papers, citations, venues, and more; it also offers a Recommendations service and references SPECTER2 embeddings as part of its Academic Graph offering. citeturn1search1turn1search5
- The tutorial documentation includes concrete guidance about endpoints like `/graph/v1/paper/search/bulk` and the base URL for the graph API, which is helpful when implementing your own query builder. citeturn1search9turn1search5

**entity["organization","ORCID","researcher identifier registry"] and entity["organization","Research Organization Registry (ROR)","org identifier registry"] for identity normalization**
- ORCID’s public API supports authenticating users and reading public data from ORCID records, which can help you connect a workspace user to a canonical researcher ID. citeturn10search12turn10search0turn10search4
- ROR provides open persistent identifiers for research organizations and exposes data via a REST API and dumps; their site notes monthly-ish releases and CC0 data availability. citeturn10search5turn10search9
- OpenAlex explicitly expects external IDs like ORCID and ROR to be used directly in filters when available, which simplifies matching logic. citeturn10search11turn10search3

**entity["organization","DataCite","doi registration agency"] for datasets and software-like citable objects**
- DataCite’s REST API supports retrieving, creating, and updating DOI metadata in JSON:API form. citeturn10search2turn10search10
If you want your system to manage not only papers but also datasets, code artifacts, and internal research outputs with DOIs, DataCite integration becomes important.

### PDF processing, extraction, and annotation

**Extraction and citation parsing**
- GROBID is explicitly described as a machine learning library for extracting and restructuring PDFs into structured TEI/XML with a focus on scientific publications. citeturn5search0turn5search4
This is valuable for:
- pulling title/author/affiliation from uploaded PDFs,
- extracting reference lists to build internal citation edges,
- extracting section structure for chunking.

**PDF viewing**
- PDF.js is described as a general-purpose, web-standards-based platform for parsing and rendering PDFs, and it is Apache-2.0 licensed. citeturn5search2turn5search10
PDF rendering is often “table stakes,” but it matters because it determines whether your comment threads can attach to precise locations in a PDF (anchors) rather than floating as generic notes.

### Search and retrieval stack

For an AI-enabled literature repository, you want at least two retrieval modalities: lexical (full-text + metadata filtering) and semantic (embeddings + filters). A practical menu of options:

**Relational + vector-in-DB**
- pgvector is explicitly positioned as vector similarity search for Postgres—i.e., store embeddings “with the rest of your data,” support nearest-neighbor search, and keep transactional semantics. citeturn8search0turn8search12
This option is attractive early because it reduces operational surface area.

**Dedicated search engine**
- OpenSearch is described (by AWS) as a community-driven, Apache-2.0 licensed fork of Elasticsearch and Kibana derived from 7.10.2, intended as a fully open-source search and analytics suite. citeturn9search0turn9search1turn9search8
This is relevant if you want strong full-text features, advanced filtering, and scaling characteristics typical of search engines—separately from your transactional DB.

**External vector DBs (optional)**
You can delay this until the product proves out, but Weaviate/Qdrant-like systems can be useful once you start storing embeddings for millions of chunks and need advanced hybrid ranking and filtering. (For example, Qdrant emphasizes payload-based filtering, and Weaviate documents hybrid search combining vectors with keyword scoring.) citeturn8search3turn8search18turn8search10

## Agent orchestration and workflow execution

The difference between “agents that sometimes help” and “agents that run systematic research workflows” is: explicit control flow + reliable execution + constrained tools + traceable artifacts.

### Workflow structure from AERO as a blueprint

AERO’s README enumerates concrete workflow steps that map cleanly to your needs. Example patterns that generalize well:

- **Decompose the task → generate search queries → retrieve papers → validate/filter → produce structured output** (Model Researcher). citeturn4view1
- **Generate candidate research problems → validate via web search → refine → generate a structured plan → critique/refine loop** (Research Planner). citeturn4view1
- **Given a plan → retrieve supporting literature (Hybrid-RAG) → idea generation (AB-MCTS) → refine designs → generate executable code** (Experiment Designer). citeturn4view2
- **Given results → analyze → choose direction → retrieve supporting papers → distill methods → propose next experiments → iterative validation** (Experimentalist). citeturn4view2

You don’t need to copy these workflows verbatim, but they provide a working “workflow taxonomy” for your catalog:
- planning workflows,
- literature workflows,
- experimentation workflows,
- writing/report workflows.

Also operationally, AERO demonstrates that such workflows typically require multiple API integrations (e.g., arXiv for paper search, web search providers, model provider credentials) and environment management. citeturn4view0turn4view1

### Orchestration frameworks and execution reliability

**Graph/state-machine orchestration**
Frameworks like LangGraph formalize the “workflow as a graph” model. LangGraph’s docs describe this explicitly: define a shared state, nodes that transform that state, and edges that select the next node (including conditional routing). citeturn6search8turn6search4
This is a good fit for research workflows because they are rarely linear; they branch, loop, and need checkpoints for validation.

**Multi-agent patterns**
If you want multiple specialized agents (search agent, screening agent, summarizer, critic, citation formatter), frameworks like Microsoft AutoGen describe multi-agent conversation as a high-level abstraction integrating LLMs, tools, and humans, and enabling automated “agent chat” to execute tasks. citeturn6search1turn6search9
Similarly, Semantic Kernel’s Agent Framework describes building collaborating agents that can send/receive messages and incorporate agentic patterns into applications. citeturn6search2turn6search18
(You don’t need to commit early; the product requirement is: can you define and run controlled multi-step workflows—whether implemented as “many agents” or “one agent with many tools.”)

**Durable execution**
A durable workflow engine matters whenever:
- runs can take minutes/hours,
- you need retries,
- the system can restart mid-run,
- you need human approvals mid-run.

Temporal’s documentation emphasizes that Workflow Executions are durable/reliable/scalable units with persisted state and recovery behavior across failures/outages. citeturn6search7turn6search22
This maps directly to “autonomous research workflows,” which often include flaky network calls, rate limits, and expensive operations.

### Human-in-the-loop and safety controls

Your stated feature—“AIs can go and add specific papers when instigated”—is a place where product trust is won or lost. The minimum guardrails that keep the system usable:

- **Propose vs apply:** agents propose changes (papers to add, tags to apply, collections to create), and users approve the diff. (Optionally allow auto-apply for low-risk actions like adding tags generated from controlled vocabularies.)
- **Tool scopes:** agents get scoped capabilities (read library, suggest additions, but no delete; or “write only within this collection”).
- **Provider-aware throttling:** enforce provider rate limits centrally (Crossref, arXiv, OpenAlex budgets, Unpaywall suggestions). citeturn16view0turn1search18turn12search2turn14view0
- **License compliance:** if downloading PDFs or doing full-text mining, record license metadata and deny disallowed operations. Crossref specifically highlights that full-text URLs do not guarantee access, and that license/TDM conditions may apply. citeturn17view0

## Implementation roadmap and Linear task breakdown

This roadmap is organized as a set of “Initiatives” you can mirror in entity["company","Linear","issue tracker software"] (Initiatives → Projects/Epics → Issues). The ordering is intended to keep the system integrated: you build the knowledge substrate first, then add ingestion/search, then add agent workflows that write back into the substrate.

### Board conventions

Use a consistent issue taxonomy:
- **Epic**: user-visible capability spanning multiple services (e.g., “Paper ingestion by DOI + PDF”).
- **Story**: end-to-end slice deliverable in ≤1 week by one engineer.
- **Task**: internal sub-step (schema migration, endpoint, UI component).

Add labels early:
- `domain:library`, `domain:workflow`, `domain:search`, `domain:collab`, `domain:infra`
- `risk:high` (anything that touches permissions, billing, deletes)
- `provider:crossref`, `provider:openalex`, etc.

### Initiative: Foundation and platform base

**Epic: Workspace, identity, and permissions**
- Story: Workspace + user membership model (workspace roles, invitation flow).
- Story: Object-level RBAC primitives (who can view/edit works, collections, notes).
- Task: Audit log schema and middleware (record “who changed what”).
- Task: Scoped API keys / service accounts for agent runtimes.

**Epic: Core storage**
- Story: Object storage integration for PDFs and attachments (upload/download, checksum).
- Story: Attachment access control (signed URLs, permission checks).
- Task: Virus/malware scanning hook (even if stubbed initially).

**Epic: Workflow runtime skeleton**
- Story: Job/run table schema (WorkflowRun, status transitions, timestamps).
- Story: Background worker service bootstrapped (can run “hello world” workflow with logging).
- Task: Centralized secrets management approach for provider keys.

### Initiative: Research library MVP

**Epic: Work object and library UX**
- Story: Work CRUD (create via manual metadata entry; view details page).
- Story: “Inbox / To Read / Read” status as first-class workflow tags (or a dedicated status field).
- Story: Deduplication v1 (unique DOI/arXiv constraints + “possible duplicate” UI).

**Epic: Collections and nested lists**
- Story: Collections CRUD with nesting (parent/child).
- Task: Choose hierarchy representation (adjacency list vs `ltree`) and implement subtree queries. citeturn13search0
- Story: Add/remove Work to Collection (many-to-many, playlist semantics inspired by Zotero). citeturn13search2
- Story: Batch operations (move, copy membership, bulk tagging).

**Epic: Comments and notes**
- Story: Threaded comments on a Work page (targetable entity model).
- Story: Basic note editor attached to Work (non-collaborative initially).
- Task: Notifications v1 (mentions/replies).

### Initiative: Ingestion and enrichment

**Epic: DOI ingestion via Crossref**
- Story: Add Work by DOI → fetch Crossref metadata → create/update Work.
- Task: Respect public/polite pool usage strategy (`mailto`, caching) and build provider throttling. citeturn16view0turn15view0
- Story: Store metadata provenance (field-level source + timestamp).
- Story: Link-out handling (Crossref `link` metadata when present) and license fields where available. citeturn17view0turn0search11

**Epic: arXiv ingestion**
- Story: Add Work by arXiv ID → fetch arXiv metadata → create Work. citeturn1search2
- Task: Provider throttling to comply with 1 request / 3 seconds and single connection constraint. citeturn1search18

**Epic: OA resolution**
- Story: Given DOI, call Unpaywall to find OA locations and store best OA link + evidence fields.
- Task: Enforce “email required” and track daily call volume; implement fallbacks to dumps. citeturn14view0turn14view1

**Epic: PDF ingestion and parsing**
- Story: Upload PDF → store → run parse job → attach extracted metadata candidates.
- Task: Stand up GROBID service (containerized) and extract header + references. citeturn5search0

### Initiative: Search and retrieval

**Epic: Full-text index**
- Story: Index Work metadata fields (title, abstract, authors, venue) for fast search.
- Task: Evaluate OpenSearch-style index vs DB full-text; decide based on expected scale. citeturn9search0turn9search1

**Epic: Vector and semantic retrieval**
- Story: Embedding pipeline for abstracts (and later full text chunks) with backfill jobs.
- Task: Store embeddings in pgvector (or alternative) and implement nearest-neighbor queries with filters. citeturn8search0
- Story: Hybrid ranking (metadata filters + vector retrieval + reranking hook).

**Epic: External discovery hooks**
- Story: OpenAlex lookup integration for “find related works” / citation expansion.
- Task: Implement OpenAlex API key + budget awareness (introduced Feb 13, 2026), plus caching and snapshot strategy for large pulls. citeturn12search2turn12search0turn12search3
- Story: Semantic Scholar integration for citation graph expansion and recommendations. citeturn1search1turn1search5

### Initiative: Collaboration and annotation depth

**Epic: PDF viewing**
- Story: PDF rendering in-app using PDF.js.
- Task: Annotation storage schema (highlights, ranges, page anchors) and sync.
PDF.js positions itself as a platform for parsing/rendering; plan for your own persistence model around it. citeturn5search2turn5search10

**Epic: Collaborative editing**
- Story: Collaborative literature review doc MVP (shared editing).
- Task: Integrate CRDT layer (Yjs) and persistence strategy. citeturn5search3turn5search7
- Story: Comments anchored to doc positions (comment threads inside docs).

### Initiative: Agent runtime and workflow catalog

**Epic: Workflow definition registry**
- Story: Store WorkflowDefinitions (versioned) and render them in UI (catalog).
- Story: Permission model: “who can run which workflows” and “what tools can they call.”

**Epic: Controlled tool layer**
- Story: Implement domain tools: search library; create collection; propose add papers; apply tags; create lit review snapshot.
- Task: “Propose vs apply” gating and approval UI (diff view).

**Epic: Port AERO-style workflows**
- Story: Implement “Research Planner” workflow shape: problem generation → validation → plan → critique/refine loop. citeturn4view1
- Story: Implement “Model Researcher” workflow shape: task analysis → literature search → validation → recommendations. citeturn4view1
- Story: Implement “Experiment Designer” workflow shape: retrieve literature → propose experiments → refine → code stubs. citeturn4view2
These can start as “single-agent, multi-step” implementations and later evolve into multi-agent variants.

**Epic: Reliable execution**
- Task: Introduce durable workflow execution semantics (Temporal-style) once you have real long-running jobs and approvals. citeturn6search7turn6search22
- Story: Run resumption (restart workers mid-run without losing state).
- Story: Structured run logs and replay/debug UI.

### Initiative: Literature review automation

**Epic: Prompt-to-collection automation**
- Story: LiteratureReviewPrompt object + UI.
- Story: “Generate candidate papers” run:
  - query construction,
  - fetch candidates,
  - screening (heuristics + model scoring),
  - dedupe,
  - propose diff (add/remove).
- Story: Approval workflow → apply to a target collection.

**Epic: Continuous refresh**
- Story: Scheduled refresh runs (weekly/monthly).
- Task: Provider-aware budgeting (OpenAlex $/day budgets; Crossref/arXiv rate-limits), with backpressure and partial completion semantics. citeturn12search2turn16view0turn1search18

### Initiative: Hardening and scale

**Epic: Provenance, compliance, and trust**
- Story: Provenance UI: “why is this in my library” (show run, sources, scores).
- Story: License-aware full-text handling (block disallowed downloads/mining; record license metadata). citeturn17view0turn14view1

**Epic: Performance**
- Task: Partitioning/archival for run logs and embeddings (keep UI snappy).
- Story: Bulk operations and streaming for large libraries.

**Epic: Export and interoperability**
- Story: Export collections as BibTeX/RIS/CSL-JSON.
CSL processors and CSL-JSON constraints are already documented; using them reduces ecosystem friction. citeturn5search5turn5search1

**Epic: API stability**
- Story: Public API v1 (so labs can extend your system).
Design inspiration: Zotero’s API emphasizes explicit versioning and an all-JSON format in v3. citeturn11search0turn11search10
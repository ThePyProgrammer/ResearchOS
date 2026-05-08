# Library Selector Modal Design

## Goal

Replace the sidebar library selector popover with a centered modal that avoids scroll interference with the sidebar and mirrors GitHub's repositories tab: searchable rows, clear selected state, library metadata, inline creation, and lightweight activity visualization.

## Scope

In scope:

- Replace the current `LibrarySwitcher` popover with a modal launcher.
- Show libraries in a GitHub repositories-style list.
- Support library search, active-library selection, and inline library creation.
- Show `Created on`, `Last Updated on`, item counts, and a compact per-library items-added sparkline.
- Keep switching behavior: selecting a library closes the modal, calls `switchLibrary`, and navigates to `/library`.

Out of scope:

- Changing collection selection or collection graph filtering.
- Adding new library management actions beyond the existing inline create flow.
- Adding a backend summary endpoint in the first implementation unless frontend summary loading is clearly too slow.

## User Experience

The existing sidebar library button opens a modal instead of an absolute-positioned dropdown. The sidebar remains fixed and no longer owns the library list scroll area.

The modal layout follows the GitHub repositories page pattern:

1. Header with title, active-library context, and close control.
2. Search/filter input across the top.
3. Inline `New library` creation row or form.
4. Scrollable list of library rows inside the modal.

Each library row shows:

- Library name.
- Optional description when available.
- `Created on` date from `library.createdAt`.
- `Last Updated on` from latest library activity or item addition.
- Total item count and item-type breakdown for papers, websites, and GitHub repos.
- Compact items-added sparkline for that library.
- Active-library checkmark and selected styling.

Rows remain clickable even if summary metadata is still loading or unavailable.

## Data Semantics

`Created on` uses the existing `createdAt` field from `librariesApi.list()`.

`Last Updated on` means latest library activity, not library settings updates. It is computed as the newest timestamp available among library-scoped activity and library items, with a fallback to `createdAt` when there are no items or activities.

The sparkline shows item additions over time for one library only. It uses the same item types as the dashboard chart: papers, websites, and GitHub repos. The modal uses a compact sparkline per row rather than embedding the full dashboard chart in every row.

## Architecture

Introduce a focused `LibrarySwitcherModal` component used by `LibrarySwitcher` in `frontend/src/components/layout/Sidebar.jsx`.

`LibrarySwitcher` responsibilities:

- Render the collapsed and expanded sidebar launcher.
- Own modal open/close state.
- Pass library context actions into the modal.

`LibrarySwitcherModal` responsibilities:

- Render the modal using the existing `WindowModal` convention.
- Manage local search state.
- Manage inline creation state and form submission.
- Render library rows and summary states.
- Switch libraries and close on selection.

Summary computation should live in a small helper or hook near the modal so the modal stays readable. It should fetch library-scoped papers, websites, and GitHub repos and derive counts, newest activity timestamp, and sparkline points. If the number of libraries makes this too chatty, replace the helper with a backend summary endpoint later without changing modal behavior.

## Loading, Empty, and Error States

While summaries load, rows show the library name immediately with skeleton metadata and sparkline placeholders.

If a library has no items, the row shows `No items yet`, uses the creation date as the fallback updated date, and shows an empty sparkline state.

If summary loading fails, the row remains selectable and displays `Activity unavailable` in place of activity metadata.

If there are no libraries, the modal shows an empty state with the inline create form as the primary action.

## Accessibility and Interaction

The modal closes on Escape, backdrop click, and successful selection. Search input should receive focus when the modal opens. The list scrolls within the modal so mouse wheel and trackpad scrolling do not affect the sidebar behind it.

Keyboard behavior should support tabbing through search, create controls, and library rows. Active rows should have visible selected styling independent of color alone.

## Testing and Verification

Frontend tests should cover:

- Opening the modal from the sidebar launcher.
- Filtering libraries by name or description.
- Switching libraries closes the modal, calls `switchLibrary`, and navigates to `/library`.
- Inline library creation calls `createLibrary` and switches to the created library.
- Rows render created/updated metadata and handle empty/loading/error summary states.

Verification commands:

- `npm --prefix frontend run test:run`
- `npm --prefix frontend run build`

Manual UI verification:

- Start the dev server.
- Open the modal from the sidebar.
- Confirm scrolling inside the modal does not scroll the sidebar.
- Search for a library.
- Create a library inline.
- Switch libraries and confirm navigation to `/library`.
- Confirm row metadata and sparklines render for libraries with and without items.

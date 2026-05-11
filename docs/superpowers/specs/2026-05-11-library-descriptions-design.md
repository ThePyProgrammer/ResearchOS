# Library Descriptions Design

## Goal

Library descriptions should be manual-only text controlled by the user. The library selector should continue showing descriptions when they exist, but it should not invent fallback descriptions or show seeded placeholder copy such as "Default research library."

## Current State

The backend model, create payload, update payload, and schema already support an optional `description` field for libraries. The selector already renders `library.description` when it is present and omits the line when absent. The missing pieces are creation/editing UI for descriptions and the default seed data that currently assigns placeholder copy to the default library.

## Architecture

Keep `description` as a nullable library field owned by the existing library API. No new summary field, derived description, migration, or fallback text is needed.

The frontend remains responsible for displaying the field:

- `LibrarySwitcherModal` renders a description line only when `library.description` is non-empty.
- `LibrarySwitcherModal` creation form accepts an optional description and passes it to `createLibrary`.
- `LibrarySettings` lets the user edit or clear the active library description alongside the name.
- `LibraryContext.createLibrary` continues to call the existing API, passing `{ name, description }`.

The backend remains responsible for persisting the field through the existing `LibraryCreate` and `LibraryUpdate` models. Seed data should stop setting the default library description to "Default research library" so new environments do not inherit unwanted copy.

## Data Flow

Creating a library from the selector:

1. User enters a required name and optional description.
2. The form trims both values.
3. Empty description is sent as `null` or omitted, preserving the manual-only invariant.
4. The existing `POST /api/libraries` endpoint persists the library.
5. The selector switches to the new library and closes as it does today.

Editing an existing library:

1. User edits name and/or description in library settings.
2. The settings form sends changed fields through `updateLibrary`.
3. Empty description is saved as `null`, clearing the selector line.
4. Library context replaces the updated library in local state, so the selector reflects the change.

Rendering the selector:

1. Each row shows the name and active badge.
2. If and only if the library has a non-empty manual description, the row shows that description.
3. Counts, dates, and sparklines remain unchanged and provide operational metadata independent of description.

## Error Handling

Use the current error style. If creating a library fails, the inline form keeps its existing "Could not create library" message. If settings save fails, the form should stop saving without claiming success. No special fallback description should appear after any error.

## Testing

Add or update frontend tests to cover:

- The selector still renders a manual description.
- The selector does not render "Default research library" or any fallback description for libraries without descriptions.
- The selector creation form passes the optional description to `createLibrary`.
- Library settings can save a changed description.
- Library settings can clear a description by saving an empty description.

Backend model and service behavior already supports the field, so backend tests are only necessary if implementation changes backend persistence beyond seed data.

## Out of Scope

- Auto-generated library summaries.
- AI-written descriptions.
- Backfilling existing database rows.
- Removing the description line from the selector entirely.

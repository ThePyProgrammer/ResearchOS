# Manual Library Descriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users set manual library descriptions that appear in the library selector only when explicitly provided.

**Architecture:** Reuse the existing nullable `description` field already present in the library model and API. Add frontend editing/creation controls for that field, keep selector rendering conditional on a non-empty manual description, and remove the seeded default copy from new environments.

**Tech Stack:** React 18, React Router, Vitest, Testing Library, FastAPI seed data in `backend/app.py`.

---

## File Structure

- Modify: `frontend/src/components/layout/LibrarySwitcherModal.jsx`
  - `NewLibraryForm` owns an optional description input and calls `createLibrary(name, descriptionOrNull)`.
  - Existing selector rows continue to render `library.description` only when the field is truthy.
- Modify: `frontend/src/components/layout/LibrarySwitcherModal.test.jsx`
  - Covers manual description rendering, missing-description rows, and create form submission with a description.
- Modify: `frontend/src/pages/LibrarySettings.jsx`
  - General settings form edits both name and description.
  - Empty description saves as `null`.
- Create: `frontend/src/pages/LibrarySettings.test.jsx`
  - Covers saving and clearing descriptions through settings.
- Modify: `backend/app.py`
  - Remove the default seed description from `lib_default`.

No schema migration is needed because `libraries.description` already exists in `backend/migrations/schema.sql`, `backend/models/library.py`, `LibraryCreate`, and `LibraryUpdate`.

---

### Task 1: Library Selector Creation Form

**Files:**
- Modify: `frontend/src/components/layout/LibrarySwitcherModal.test.jsx`
- Modify: `frontend/src/components/layout/LibrarySwitcherModal.jsx`

- [ ] **Step 1: Update selector tests for manual descriptions and description creation**

In `frontend/src/components/layout/LibrarySwitcherModal.test.jsx`, replace the existing create test with this version:

```jsx
  it('creates a new library inline with an optional manual description, switches to it, closes the modal, and navigates to library route', async () => {
    const switchLibrary = vi.fn()
    const onClose = vi.fn()
    const createLibrary = vi.fn().mockResolvedValue({
      id: 'lib_3',
      name: 'New Library',
      description: 'Human-written scope note',
      createdAt: '2026-05-01T00:00:00Z',
    })
    renderModal({ createLibrary, switchLibrary, onClose })

    fireEvent.click(screen.getByRole('button', { name: /new library/i }))
    fireEvent.change(screen.getByLabelText(/^library name$/i), { target: { value: 'New Library' } })
    fireEvent.change(screen.getByLabelText(/library description/i), { target: { value: 'Human-written scope note' } })
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => expect(createLibrary).toHaveBeenCalledWith('New Library', 'Human-written scope note'))
    expect(switchLibrary).toHaveBeenCalledWith('lib_3')
    expect(onClose).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('library-route')).toBeInTheDocument())
  })
```

Add this test after the existing `filters libraries by name or description` test:

```jsx
  it('omits the description line when no manual description is set', async () => {
    const librariesWithoutDescriptions = [
      {
        id: 'lib_empty',
        name: 'No Description Library',
        createdAt: '2026-05-01T00:00:00Z',
      },
    ]
    renderModal({ libraries: librariesWithoutDescriptions, activeLibrary: librariesWithoutDescriptions[0] })

    const row = screen.getByRole('button', { name: /No Description Library/i })
    await waitFor(() => expect(within(row).getByText('No items yet')).toBeInTheDocument())

    expect(within(row).queryByText(/Default research library/i)).not.toBeInTheDocument()
    expect(within(row).queryByText(/No description/i)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run selector tests and verify the new create test fails**

Run:

```bash
npm --prefix frontend run test:run -- src/components/layout/LibrarySwitcherModal.test.jsx
```

Expected: FAIL because `LibrarySwitcherModal` does not yet render a `Library description` input and still calls `createLibrary(trimmed)`.

- [ ] **Step 3: Add the optional description input to `NewLibraryForm`**

In `frontend/src/components/layout/LibrarySwitcherModal.jsx`, replace the full `NewLibraryForm` function with:

```jsx
function NewLibraryForm({ createLibrary, onCreated, primary = false }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (showForm) inputRef.current?.focus()
  }, [showForm])

  async function submit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    const trimmedDescription = description.trim()
    if (!trimmed || creating) return

    setCreating(true)
    setError('')
    try {
      const library = await createLibrary(trimmed, trimmedDescription || null)
      onCreated(library)
    } catch (err) {
      setError('Could not create library')
      setCreating(false)
    }
  }

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className={primary
          ? 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700'
          : 'rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50'}
      >
        New library
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Library name
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Library description <span className="font-normal text-slate-400">(optional)</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What belongs here?"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 4: Run selector tests and verify they pass**

Run:

```bash
npm --prefix frontend run test:run -- src/components/layout/LibrarySwitcherModal.test.jsx
```

Expected: PASS. Manual descriptions still render, missing descriptions do not show fallback text, and creation passes the manual description.

- [ ] **Step 5: Commit selector changes**

Run:

```bash
git add frontend/src/components/layout/LibrarySwitcherModal.jsx frontend/src/components/layout/LibrarySwitcherModal.test.jsx
git commit -m "$(cat <<'EOF'
feat: collect library descriptions in selector

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Library Settings Description Editing

**Files:**
- Create: `frontend/src/pages/LibrarySettings.test.jsx`
- Modify: `frontend/src/pages/LibrarySettings.jsx`

- [ ] **Step 1: Add settings tests for saving and clearing descriptions**

Create `frontend/src/pages/LibrarySettings.test.jsx` with this complete content:

```jsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LibrarySettings from './LibrarySettings'
import { useLibrary } from '../context/LibraryContext'
import { settingsApi } from '../services/api'

vi.mock('../context/LibraryContext', () => ({
  useLibrary: vi.fn(),
}))

vi.mock('../services/api', () => ({
  librariesApi: {},
  settingsApi: {
    getModels: vi.fn(),
    updateModels: vi.fn(),
  },
}))

const modelConfig = {
  current: {},
  defaults: {},
  descriptions: {},
  available_chat_models: [],
  available_embedding_models: [],
}

function renderSettings(activeLibrary = {
  id: 'lib_1',
  name: 'AI Papers',
  description: 'Old scope note',
  autoNoteEnabled: false,
  autoNotePrompt: '',
}) {
  const updateLibrary = vi.fn().mockResolvedValue(activeLibrary)
  const deleteLibrary = vi.fn().mockResolvedValue(undefined)

  settingsApi.getModels.mockResolvedValue(modelConfig)
  useLibrary.mockReturnValue({
    activeLibrary,
    updateLibrary,
    deleteLibrary,
  })

  render(
    <MemoryRouter initialEntries={['/library/settings']}>
      <LibrarySettings />
    </MemoryRouter>
  )

  return { updateLibrary, deleteLibrary }
}

describe('LibrarySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves a manual library description', async () => {
    const { updateLibrary } = renderSettings()

    fireEvent.change(screen.getByLabelText(/library description/i), {
      target: { value: 'Foundation model papers and related systems.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save changes$/i }))

    await waitFor(() => expect(updateLibrary).toHaveBeenCalledWith('lib_1', {
      name: 'AI Papers',
      description: 'Foundation model papers and related systems.',
    }))
  })

  it('clears the manual library description when saved empty', async () => {
    const { updateLibrary } = renderSettings()

    fireEvent.change(screen.getByLabelText(/library description/i), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save changes$/i }))

    await waitFor(() => expect(updateLibrary).toHaveBeenCalledWith('lib_1', {
      name: 'AI Papers',
      description: null,
    }))
  })
})
```

- [ ] **Step 2: Run settings tests and verify they fail**

Run:

```bash
npm --prefix frontend run test:run -- src/pages/LibrarySettings.test.jsx
```

Expected: FAIL because `LibrarySettings` does not yet render a `Library description` field.

- [ ] **Step 3: Add description state and general save logic**

In `frontend/src/pages/LibrarySettings.jsx`, add this state immediately after the existing `name` state:

```jsx
  const [description, setDescription] = useState(activeLibrary?.description ?? '')
```

Replace the existing `handleSaveName` function with this function:

```jsx
  async function handleSaveGeneral(e) {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    const currentDescription = (activeLibrary.description ?? '').trim()
    const unchanged = trimmedName === activeLibrary.name && trimmedDescription === currentDescription
    if (!trimmedName || unchanged || saving) return
    setSaving(true)
    setSaveSuccess(false)
    try {
      await updateLibrary(activeLibrary.id, {
        name: trimmedName,
        description: trimmedDescription || null,
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } finally {
      setSaving(false)
    }
  }
```

- [ ] **Step 4: Replace the General settings form**

In `frontend/src/pages/LibrarySettings.jsx`, replace the entire General form inside the `SettingsSection` with:

```jsx
          <form onSubmit={handleSaveGeneral} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Library name</label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setSaveSuccess(false) }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                placeholder="My Research Library"
              />
            </div>
            <div>
              <label htmlFor="library-description" className="block text-xs font-medium text-slate-600 mb-1.5">
                Library description <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id="library-description"
                rows={3}
                value={description}
                onChange={e => { setDescription(e.target.value); setSaveSuccess(false) }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 placeholder:text-slate-300"
                placeholder="Describe what belongs in this library."
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Shown in the library selector when set.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={
                  !name.trim() ||
                  saving ||
                  (name.trim() === activeLibrary.name && description.trim() === (activeLibrary.description ?? '').trim())
                }
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              {saveSuccess && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <Icon name="check_circle" className="text-[15px]" />
                  Saved
                </span>
              )}
            </div>
          </form>
```

- [ ] **Step 5: Run settings tests and verify they pass**

Run:

```bash
npm --prefix frontend run test:run -- src/pages/LibrarySettings.test.jsx
```

Expected: PASS. Saving sends a trimmed manual description; clearing sends `description: null`.

- [ ] **Step 6: Run related frontend tests**

Run:

```bash
npm --prefix frontend run test:run -- src/components/layout/LibrarySwitcherModal.test.jsx src/pages/LibrarySettings.test.jsx src/context/LibraryContext.test.jsx
```

Expected: PASS. `LibraryContext.createLibrary(name, description)` still passes the second argument to `librariesApi.create({ name, description })` through the existing implementation.

- [ ] **Step 7: Commit settings changes**

Run:

```bash
git add frontend/src/pages/LibrarySettings.jsx frontend/src/pages/LibrarySettings.test.jsx
git commit -m "$(cat <<'EOF'
feat: edit library descriptions in settings

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Remove Seeded Default Description

**Files:**
- Modify: `backend/app.py`

- [ ] **Step 1: Verify the current seed text is present**

Run:

```bash
grep -R "Default research library" -n backend frontend/src --exclude-dir=node_modules
```

Expected before the change:

```text
backend/app.py:103:            "description": "Default research library",
```

- [ ] **Step 2: Remove the seeded description**

In `backend/app.py`, change the default library seed from:

```python
        {
            "id": "lib_default",
            "name": "My Library",
            "description": "Default research library",
            "created_at": "2024-01-01T00:00:00Z",
        },
```

to:

```python
        {
            "id": "lib_default",
            "name": "My Library",
            "created_at": "2024-01-01T00:00:00Z",
        },
```

- [ ] **Step 3: Verify the unwanted seed text is gone from code**

Run:

```bash
grep -R "Default research library" -n backend frontend/src --exclude-dir=node_modules
```

Expected: no output.

- [ ] **Step 4: Commit seed data change**

Run:

```bash
git add backend/app.py
git commit -m "$(cat <<'EOF'
fix: remove default library description seed

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Final Verification and UI Check

**Files:**
- Verify: `frontend/src/components/layout/LibrarySwitcherModal.jsx`
- Verify: `frontend/src/pages/LibrarySettings.jsx`
- Verify: `backend/app.py`

- [ ] **Step 1: Run focused frontend regression tests**

Run:

```bash
npm --prefix frontend run test:run -- src/components/layout/LibrarySwitcherModal.test.jsx src/pages/LibrarySettings.test.jsx src/context/LibraryContext.test.jsx
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS with Vite production build output.

- [ ] **Step 3: Verify no code still emits the unwanted copy**

Run:

```bash
grep -R "Default research library" -n backend frontend/src --exclude-dir=node_modules
```

Expected: no output.

- [ ] **Step 4: Manually verify the UI in a browser**

Run the dev server:

```bash
npm --prefix frontend run dev -- --host 127.0.0.1
```

Use the browser against the local Vite server and verify these flows:

1. Open `/library/settings`.
2. Enter `Foundation model papers and related systems.` in `Library description`.
3. Click `Save changes` and confirm the save indicator appears.
4. Open the library selector from the sidebar and confirm the active library row shows `Foundation model papers and related systems.` under the library name.
5. Return to `/library/settings`, clear `Library description`, and click `Save changes`.
6. Open the library selector again and confirm the row shows no description line and does not show `Default research library` or `No description`.
7. In the selector, create a library named `Manual Description Test` with description `Temporary manual scope note`.
8. Confirm the new library becomes active and the selector shows `Temporary manual scope note` for that library.

Stop the dev server after the browser check.

- [ ] **Step 5: Inspect final git state**

Run:

```bash
git status --short
```

Expected: no uncommitted changes.

---

## Self-Review Notes

- Spec coverage: The plan exposes manual description creation, manual settings editing, description clearing, selector conditional rendering, and seed copy removal.
- Scope: No migration, generated descriptions, AI descriptions, or existing database backfill is included.
- Type consistency: The frontend uses `description` in React objects and sends `description` through `LibraryContext.createLibrary(name, description)` and `updateLibrary(id, { name, description })`; the backend already maps this field through existing models.

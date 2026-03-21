# Frontend State Management

ResearchOS uses no global state manager (no Redux, no Zustand). State is managed through React's built-in hooks and a single React Context for shared library data.

## LibraryContext

**File:** `frontend/src/context/LibraryContext.jsx`

`LibraryProvider` wraps the entire app (in `App.jsx`). It is the only cross-cutting state store. All pages consume it via `useLibrary()`.

### What it holds

| Value | Type | Description |
|-------|------|-------------|
| `libraries` | `Library[]` | All libraries fetched from `/api/libraries` on mount |
| `activeLibrary` | `Library \| null` | Resolved from `activeLibraryId`; `null` if no libraries exist |
| `activeLibraryId` | `string \| null` | Persisted to `localStorage` under key `researchos_active_library` |
| `collections` | `Collection[]` | Collections for the active library; re-fetched when `activeLibraryId` changes |
| `loading` | `boolean` | True while the initial library list is loading |

### Actions

| Function | Description |
|----------|-------------|
| `switchLibrary(id)` | Updates `activeLibraryId` and persists to `localStorage`; triggers collection re-fetch |
| `createLibrary(name, description)` | Calls API, appends to `libraries` |
| `updateLibrary(id, data)` | Calls API, patches `libraries` in place |
| `deleteLibrary(id)` | Calls API, removes from `libraries`; auto-switches to another library if the active one is deleted |
| `createCollection({ name, parentId })` | Calls API using `activeLibraryId`; appends to `collections` |
| `updateCollection(id, data)` | Calls API, patches `collections` in place |
| `deleteCollection(col)` | Recursively gathers descendant IDs, deletes all, filters from `collections` |
| `refreshCollections()` | Re-fetches collections from API for the active library |

### localStorage Keys

| Key | Value | Set by |
|-----|-------|--------|
| `researchos_active_library` | Active library UUID | `switchLibrary()`, `LibraryProvider` on init, `deleteLibrary()` |

On startup, `LibraryProvider` reads this key, validates the stored ID against the fetched library list, and falls back to the first available library if the stored ID is stale or missing.

## Per-Page Local State

Each page manages its own data entirely via React's `useState` + `useEffect` + `useCallback`. There is no shared page-level cache.

### Fetch-on-Mount Pattern

The standard pattern used throughout every page:

```jsx
const [items, setItems] = useState([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

useEffect(() => {
  setLoading(true)
  someApi.list(params)
    .then(setItems)
    .catch(err => setError(err.message))
    .finally(() => setLoading(false))
}, [dependency])
```

Pages show a loading skeleton or spinner during `loading` and an error banner when `error` is set.

### useCallback for Stable Fetch Functions

Pages that need to re-fetch on demand (e.g., after a mutation) wrap the fetch in `useCallback`:

```jsx
const fetchData = useCallback(() => {
  someApi.list().then(setData).catch(console.error)
}, [dep])

useEffect(() => { fetchData() }, [fetchData])
```

This pattern is used in `Sidebar.jsx`'s `ProjectsTree` and many page components.

## localStorage Usage in Pages

Several pages persist view preferences to `localStorage` via a `useLocalStorage` hook (`frontend/src/hooks/useLocalStorage.js`):

| Page / Component | Key(s) | Value |
|-----------------|--------|-------|
| `ProjectDetail` | `researchos_expview_<projectId>` | Table vs tree view toggle for experiment list |
| `NoteGraphView` | Various graph settings | Node layout, label toggle |

## Custom Events

The app uses browser `CustomEvent` for cross-component communication without prop drilling. These events are dispatched on `window`.

| Event | Dispatched by | Listened by | Purpose |
|-------|--------------|-------------|---------|
| `researchos:items-changed` | `Sidebar.jsx` (on collection drop), `Library.jsx` | `Library.jsx`, any component showing item counts | Re-fetch item lists after a collection assignment |
| `researchos:projects-changed` | Any component that creates/updates a project | `Sidebar.jsx` `ProjectsTree` | Re-fetch the project list in the sidebar |

Pattern for dispatching:

```js
window.dispatchEvent(new CustomEvent('researchos:items-changed'))
```

Pattern for listening:

```js
useEffect(() => {
  const handler = () => fetchProjects()
  window.addEventListener('researchos:projects-changed', handler)
  return () => window.removeEventListener('researchos:projects-changed', handler)
}, [fetchProjects])
```

## Data Fetching Notes

- There is no client-side cache or query library. Every navigation to a page re-fetches data from the API.
- Mutations (create, update, delete) optimistically update local state by calling the setter directly after the API call returns, rather than re-fetching the full list.
- The `LibraryContext` is an exception: it keeps a live in-memory list of libraries and collections that multiple components read from.
- PDF blob URLs are created with `URL.createObjectURL()` and revoked on cleanup to avoid memory leaks.

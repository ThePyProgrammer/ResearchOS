# Guide: Adding a New Entity

This guide walks through adding a new first-class domain object. Use the `projects` / `experiments` / `tasks` entities as reference examples.

---

## Step 1: Add the Database Migration

Create `backend/migrations/<NNN>_<entity>.sql`. Follow the existing numbering sequence.

Typical structure:

```sql
CREATE TABLE things (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    library_id  TEXT REFERENCES libraries(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

- Use `TEXT` primary keys. The service layer generates IDs as `thing_<uuid4().hex[:10]>`.
- Disable RLS to match the existing schema pattern: `ALTER TABLE things DISABLE ROW LEVEL SECURITY;`
- Run the migration in the Supabase SQL editor in order.

---

## Step 2: Create the Pydantic Model

Create `backend/models/thing.py`. All models must inherit from `CamelModel`.

```python
from typing import Optional
from pydantic import Field
from models.base import CamelModel

class Thing(CamelModel):
    id: str
    name: str
    description: Optional[str] = None
    library_id: Optional[str] = None
    created_at: Optional[str] = None

class ThingCreate(CamelModel):
    name: str
    description: Optional[str] = None
    library_id: Optional[str] = None

class ThingUpdate(CamelModel):
    name: Optional[str] = None
    description: Optional[str] = None
```

`CamelModel` applies `alias_generator=to_camel` and `populate_by_name=True`. This means:
- Python fields use `snake_case`.
- JSON serialization via `model.model_dump(by_alias=True)` produces `camelCase`.
- Supabase row validation via `Thing.model_validate(row)` works with `snake_case` column names.

---

## Step 3: Create the Service

Create `backend/services/thing_service.py`. All database access lives here.

```python
import uuid
from typing import Optional
from models.thing import Thing, ThingCreate, ThingUpdate
from services.db import get_client

_TABLE = "things"

def list_things(library_id: Optional[str] = None) -> list[Thing]:
    q = get_client().table(_TABLE).select("*")
    if library_id:
        q = q.eq("library_id", library_id)
    result = q.order("created_at").execute()
    return [Thing.model_validate(r) for r in result.data]

def get_thing(thing_id: str) -> Optional[Thing]:
    result = get_client().table(_TABLE).select("*").eq("id", thing_id).execute()
    return Thing.model_validate(result.data[0]) if result.data else None

def create_thing(data: ThingCreate) -> Thing:
    thing = Thing(
        id=f"thing_{uuid.uuid4().hex[:10]}",
        **data.model_dump(),
    )
    get_client().table(_TABLE).insert(thing.model_dump(by_alias=False)).execute()
    return thing

def update_thing(thing_id: str, data: ThingUpdate) -> Optional[Thing]:
    updates = data.model_dump(exclude_unset=True)   # use exclude_unset, NOT exclude_none
    if not updates:
        return get_thing(thing_id)
    if get_thing(thing_id) is None:
        return None
    get_client().table(_TABLE).update(updates).eq("id", thing_id).execute()
    return get_thing(thing_id)

def delete_thing(thing_id: str) -> bool:
    if get_thing(thing_id) is None:
        return False
    get_client().table(_TABLE).delete().eq("id", thing_id).execute()
    return True
```

**Key rules:**
- Always use `exclude_unset=True` (not `exclude_none`) on updates so fields explicitly set to `None` are not silently dropped.
- Never chain `.select()` after a filter on update/delete (causes `AttributeError`).
- Check existence before update; return `None` if not found.
- No business logic in routers — it belongs here.

---

## Step 4: Create the Router

Create `backend/routers/things.py`.

```python
from typing import Optional
from fastapi import APIRouter, HTTPException
from models.thing import Thing, ThingCreate, ThingUpdate
from services import thing_service

router = APIRouter(prefix="/api", tags=["things"])

@router.get("/things")
def list_things(library_id: Optional[str] = None):
    return [t.model_dump(by_alias=True) for t in thing_service.list_things(library_id)]

@router.post("/things", status_code=201)
def create_thing(data: ThingCreate):
    return thing_service.create_thing(data).model_dump(by_alias=True)

@router.get("/things/{thing_id}")
def get_thing(thing_id: str):
    thing = thing_service.get_thing(thing_id)
    if not thing:
        raise HTTPException(404, detail={"error": "not_found", "detail": "Thing not found"})
    return thing.model_dump(by_alias=True)

@router.patch("/things/{thing_id}")
def update_thing(thing_id: str, data: ThingUpdate):
    thing = thing_service.update_thing(thing_id, data)
    if not thing:
        raise HTTPException(404, detail={"error": "not_found", "detail": "Thing not found"})
    return thing.model_dump(by_alias=True)

@router.delete("/things/{thing_id}", status_code=204)
def delete_thing(thing_id: str):
    if not thing_service.delete_thing(thing_id):
        raise HTTPException(404, detail={"error": "not_found", "detail": "Thing not found"})
```

All 404s return `{"error": "not_found", "detail": "..."}`. All responses use `model_dump(by_alias=True)` to produce camelCase JSON.

---

## Step 5: Wire into app.py

In `backend/app.py`, import and register the router:

```python
from routers import things  # add to existing import line

app.include_router(things.router)  # add after existing include_router calls
```

---

## Step 6: Add API Client Methods

In `frontend/src/services/api.js`, add a new named export:

```js
export const thingsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString()
    return apiFetch(`/things${qs ? `?${qs}` : ''}`)
  },
  get: (id) => apiFetch(`/things/${id}`),
  create: (data) => apiFetch('/things', { method: 'POST', body: data }),
  update: (id, data) => apiFetch(`/things/${id}`, { method: 'PATCH', body: data }),
  remove: (id) => apiFetch(`/things/${id}`, { method: 'DELETE' }),
}
```

`apiFetch` handles `Content-Type: application/json`, JSON serialization, and error extraction.

---

## Step 7: Create the Page/Component

Create `frontend/src/pages/Things.jsx`. Use the fetch-on-mount pattern:

```jsx
import { useState, useEffect } from 'react'
import { thingsApi } from '../services/api'
import { useLibrary } from '../context/LibraryContext'

export default function Things() {
  const { activeLibraryId } = useLibrary()
  const [things, setThings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!activeLibraryId) return
    setLoading(true)
    thingsApi.list({ library_id: activeLibraryId })
      .then(setThings)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [activeLibraryId])

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>
  return <ul>{things.map(t => <li key={t.id}>{t.name}</li>)}</ul>
}
```

---

## Step 8: Add Route in App.jsx

In `frontend/src/App.jsx`, import and register the route inside the `<Layout>` route:

```jsx
import Things from './pages/Things'

// Inside the Route path="/" element={<Layout />} block:
<Route path="things" element={<Things />} />
```

Add a `SidebarLink` in `frontend/src/components/layout/Sidebar.jsx` if the entity deserves top-level navigation.

---

## Checklist

- [ ] Migration file created and run in Supabase
- [ ] Pydantic model inherits `CamelModel`; separate Create and Update types
- [ ] Service: `list`, `get`, `create`, `update`, `delete` — all use the service layer
- [ ] Router: all 404s return `{"error": "not_found"}`, all responses use `by_alias=True`
- [ ] `app.py`: router imported and registered
- [ ] `api.js`: named export with `list`, `get`, `create`, `update`, `remove`
- [ ] Page/component: fetch-on-mount with loading/error states
- [ ] Route registered in `App.jsx`

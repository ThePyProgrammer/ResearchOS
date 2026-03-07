import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { librariesApi, collectionsApi } from '../services/api'

const LibraryContext = createContext(null)
const STORAGE_KEY = 'researchos_active_library'

export function LibraryProvider({ children }) {
  const [libraries, setLibraries] = useState([])
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeLibraryId, setActiveLibraryId] = useState(() => localStorage.getItem(STORAGE_KEY) || null)

  useEffect(() => {
    librariesApi.list()
      .then(libs => {
        setLibraries(libs)
        // Validate stored ID; fall back to first library if missing/deleted
        setActiveLibraryId(prev => {
          const valid = libs.find(l => l.id === prev)
          const resolved = valid?.id ?? libs[0]?.id ?? null
          if (resolved) localStorage.setItem(STORAGE_KEY, resolved)
          return resolved
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const activeLibrary = libraries.find(l => l.id === activeLibraryId) ?? null

  const switchLibrary = useCallback((id) => {
    setActiveLibraryId(id)
    localStorage.setItem(STORAGE_KEY, id)
  }, [])

  useEffect(() => {
    if (loading) return
    setCollections([])
    collectionsApi.list(activeLibraryId ? { library_id: activeLibraryId } : {})
      .then(setCollections)
      .catch(() => {})
  }, [activeLibraryId, loading])

  const createLibrary = useCallback(async (name, description) => {
    const lib = await librariesApi.create({ name, description })
    setLibraries(prev => [...prev, lib])
    return lib
  }, [])

  const updateLibrary = useCallback(async (id, data) => {
    const updated = await librariesApi.update(id, data)
    setLibraries(prev => prev.map(l => l.id === id ? updated : l))
    return updated
  }, [])

  const deleteLibrary = useCallback(async (id) => {
    await librariesApi.remove(id)
    setLibraries(prev => {
      const remaining = prev.filter(l => l.id !== id)
      if (activeLibraryId === id) {
        const next = remaining[0]?.id ?? null
        setActiveLibraryId(next)
        if (next) localStorage.setItem(STORAGE_KEY, next)
        else localStorage.removeItem(STORAGE_KEY)
      }
      return remaining
    })
  }, [activeLibraryId])

  const createCollection = useCallback(async ({ name, parentId }) => {
    const created = await collectionsApi.create({
      name,
      parent_id: parentId || null,
      type: 'folder',
      library_id: activeLibraryId,
    })
    setCollections(prev => [...prev, created])
    return created
  }, [activeLibraryId])

  const refreshCollections = useCallback(() => {
    collectionsApi.list(activeLibraryId ? { library_id: activeLibraryId } : {})
      .then(setCollections)
      .catch(() => {})
  }, [activeLibraryId])

  const updateCollection = useCallback(async (id, data) => {
    const updated = await collectionsApi.update(id, data)
    setCollections(prev => prev.map(c => c.id === id ? updated : c))
    return updated
  }, [])

  const deleteCollection = useCallback(async (col) => {
    const toDelete = []
    const gather = (id) => {
      collections
        .filter(c => c.id === id || c.parentId === id)
        .forEach(c => {
          if (!toDelete.includes(c.id)) { toDelete.push(c.id); gather(c.id) }
        })
    }
    gather(col.id)
    await Promise.all(toDelete.map(id => collectionsApi.remove(id).catch(() => {})))
    setCollections(prev => prev.filter(c => !toDelete.includes(c.id)))
    return toDelete
  }, [collections])

  return (
    <LibraryContext.Provider value={{
      libraries, activeLibrary, activeLibraryId, switchLibrary,
      collections, createLibrary, updateLibrary, deleteLibrary,
      createCollection, updateCollection, deleteCollection, refreshCollections,
      loading,
    }}>
      {children}
    </LibraryContext.Provider>
  )
}

export function useLibrary() {
  return useContext(LibraryContext)
}

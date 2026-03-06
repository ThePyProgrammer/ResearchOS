import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { librariesApi, collectionsApi } from '../services/api'

const LibraryContext = createContext(null)

export function LibraryProvider({ children }) {
  const [searchParams] = useSearchParams()
  const [libraries, setLibraries] = useState([])
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)

  // Active library is purely URL-driven; falls back to first library
  const urlLibId = searchParams.get('lib')

  useEffect(() => {
    librariesApi.list()
      .then(setLibraries)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const activeLibraryId = urlLibId || (libraries[0]?.id ?? null)
  const activeLibrary = libraries.find(l => l.id === activeLibraryId) ?? null

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
    setLibraries(prev => prev.filter(l => l.id !== id))
  }, [])

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
      libraries, activeLibrary, activeLibraryId,
      collections, createLibrary, updateLibrary, deleteLibrary,
      createCollection, deleteCollection, refreshCollections,
      loading,
    }}>
      {children}
    </LibraryContext.Provider>
  )
}

export function useLibrary() {
  return useContext(LibraryContext)
}

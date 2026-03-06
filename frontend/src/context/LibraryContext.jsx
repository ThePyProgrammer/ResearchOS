import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { librariesApi, collectionsApi } from '../services/api'

const LibraryContext = createContext(null)

export function LibraryProvider({ children }) {
  const [libraries, setLibraries] = useState([])
  const [activeLibraryId, setActiveLibraryId] = useState(null)
  const [collections, setCollections] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    librariesApi.list()
      .then(libs => {
        setLibraries(libs)
        if (libs.length > 0) setActiveLibraryId(libs[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (loading) return
    collectionsApi.list(activeLibraryId ? { library_id: activeLibraryId } : {})
      .then(setCollections)
      .catch(() => {})
  }, [activeLibraryId, loading])

  const createLibrary = useCallback(async (name, description) => {
    const lib = await librariesApi.create({ name, description })
    setLibraries(prev => [...prev, lib])
    return lib
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

  const deleteCollection = useCallback(async (col) => {
    const toDelete = []
    const gather = (parentId) => {
      collections
        .filter(c => c.id === parentId || c.parentId === parentId)
        .forEach(c => {
          if (!toDelete.includes(c.id)) {
            toDelete.push(c.id)
            gather(c.id)
          }
        })
    }
    gather(col.id)
    await Promise.all(toDelete.map(id => collectionsApi.remove(id).catch(() => {})))
    setCollections(prev => prev.filter(c => !toDelete.includes(c.id)))
    return toDelete
  }, [collections])

  const activeLibrary = libraries.find(l => l.id === activeLibraryId) ?? null

  return (
    <LibraryContext.Provider value={{
      libraries, activeLibrary, activeLibraryId, setActiveLibraryId, createLibrary,
      collections, createCollection, deleteCollection,
      loading,
    }}>
      {children}
    </LibraryContext.Provider>
  )
}

export function useLibrary() {
  return useContext(LibraryContext)
}

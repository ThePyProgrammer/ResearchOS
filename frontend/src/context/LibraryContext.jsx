import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { librariesApi } from '../services/api'

const LibraryContext = createContext(null)

export function LibraryProvider({ children }) {
  const [libraries, setLibraries] = useState([])
  const [activeLibraryId, setActiveLibraryId] = useState(null)
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

  const createLibrary = useCallback(async (name, description) => {
    const lib = await librariesApi.create({ name, description })
    setLibraries(prev => [...prev, lib])
    return lib
  }, [])

  const activeLibrary = libraries.find(l => l.id === activeLibraryId) ?? null

  return (
    <LibraryContext.Provider value={{ libraries, activeLibrary, activeLibraryId, setActiveLibraryId, createLibrary, loading }}>
      {children}
    </LibraryContext.Provider>
  )
}

export function useLibrary() {
  return useContext(LibraryContext)
}

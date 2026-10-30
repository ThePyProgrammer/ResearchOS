import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'

const KEY = 'researchos.theme'
const validMode = mode => ['light', 'dark', 'system'].includes(mode) ? mode : 'system'
const readMode = () => {
  try { return validMode(localStorage.getItem(KEY)) } catch { return 'system' }
}
const ThemeContext = createContext({ mode: 'system', resolvedTheme: 'light', setMode: () => {} })

export function ThemeProvider({ children }) {
  const [mode, updateMode] = useState(readMode)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const resolvedTheme = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onSystem = event => setSystemDark(event.matches)
    const onStorage = event => {
      if (event.key === KEY || event.key === null) updateMode(readMode())
    }
    media?.addEventListener('change', onSystem)
    if (media) setSystemDark(media.matches)
    window.addEventListener('storage', onStorage)
    return () => {
      media?.removeEventListener('change', onSystem)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  function setMode(nextMode) {
    const next = validMode(nextMode)
    updateMode(next)
    try { localStorage.setItem(KEY, next) } catch { /* The session preference still works. */ }
  }

  return <ThemeContext.Provider value={{ mode, resolvedTheme, setMode }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)

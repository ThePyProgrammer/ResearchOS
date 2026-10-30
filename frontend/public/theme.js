// Runs before the app/styles load so a saved dark preference never flashes white.
;(() => {
  let mode = 'system'
  try { mode = localStorage.getItem('researchos.theme') || mode } catch { /* Storage may be disabled. */ }
  const dark = mode === 'dark' || (mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
})()

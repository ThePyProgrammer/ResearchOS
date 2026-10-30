import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeContext'
import ThemeSelector from '../components/ThemeSelector'

function Preview() {
  const { resolvedTheme } = useTheme()
  return <><ThemeSelector /><output>{resolvedTheme}</output></>
}

describe('theme preference', () => {
  let media, listeners
  beforeEach(() => {
    localStorage.clear()
    listeners = new Set()
    media = { matches: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
    vi.stubGlobal('matchMedia', () => media)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
  })
  const mount = () => render(<ThemeProvider><Preview /></ThemeProvider>)
  const system = matches => act(() => { media.matches = matches; listeners.forEach(fn => fn({ matches })) })

  it('follows the system until an explicit choice is made, persists it, and can resume following', () => {
    mount()
    system(true)
    expect(document.documentElement).toHaveClass('dark')
    fireEvent.change(screen.getByLabelText('Color theme'), { target: { value: 'light' } })
    expect(localStorage.getItem('researchos.theme')).toBe('light')
    system(false); system(true)
    expect(document.documentElement).not.toHaveClass('dark')
    fireEvent.change(screen.getByLabelText('Color theme'), { target: { value: 'system' } })
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('restores saved choices and reacts to preference changes in another tab', () => {
    localStorage.setItem('researchos.theme', 'dark')
    mount()
    expect(screen.getByRole('status')).toHaveTextContent('dark')
    act(() => {
      localStorage.setItem('researchos.theme', 'light')
      window.dispatchEvent(new StorageEvent('storage', { key: 'researchos.theme' }))
    })
    expect(document.documentElement).not.toHaveClass('dark')
    expect(screen.getByLabelText('Color theme')).toHaveValue('light')
  })

  it('falls back to system for invalid preferences and works when storage is blocked', () => {
    localStorage.setItem('researchos.theme', 'invalid')
    const view = mount()
    expect(screen.getByLabelText('Color theme')).toHaveValue('system')
    view.unmount()
    expect(listeners.size).toBe(0)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    mount()
    fireEvent.change(screen.getByLabelText('Color theme'), { target: { value: 'dark' } })
    expect(document.documentElement).toHaveClass('dark')
  })
})

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ItemContextMenu from './ItemContextMenu'

afterEach(() => vi.useRealTimers())

it('keeps a submenu open when the pointer crosses another row to reach it', () => {
  vi.useFakeTimers()
  const copy = vi.fn()
  const close = vi.fn()
  render(<ItemContextMenu x={20} y={20} title="Paper" onClose={close} groups={[
    { label: 'Copy', actions: [
      { label: 'Copy title', icon: 'copy', run: copy },
      { label: 'Copy citation', icon: 'copy', run: vi.fn() },
    ] },
    { label: 'Open', actions: [{ label: 'Open paper', icon: 'open', run: vi.fn() }] },
  ]} />)
  fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Copy', exact: true }))
  fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Open paper' }))
  const submenu = screen.getByRole('menu', { name: 'Copy' })
  fireEvent.mouseEnter(submenu)
  act(() => vi.advanceTimersByTime(300))
  expect(submenu).toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy title' }))
  expect(copy).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
  fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Open paper' }))
  act(() => vi.advanceTimersByTime(300))
  expect(screen.queryByRole('menu', { name: 'Copy' })).not.toBeInTheDocument()
})

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LibraryProvider, useLibrary } from './LibraryContext'

vi.mock('../services/api', () => ({
  librariesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  collectionsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))
import { collectionsApi, librariesApi } from '../services/api'


function Probe() {
  const { activeLibrary, collections } = useLibrary()
  return (
    <div>
      <div data-testid="active-library">{activeLibrary?.name ?? 'none'}</div>
      <div data-testid="collection-count">{collections.length}</div>
    </div>
  )
}


describe('LibraryContext', () => {
  beforeEach(() => {
    localStorage.clear()
    librariesApi.list.mockReset()
    collectionsApi.list.mockReset()
  })

  it('loads libraries and collections for the resolved active library', async () => {
    librariesApi.list.mockResolvedValue([
      { id: 'lib_1', name: 'My Library' },
      { id: 'lib_2', name: 'Second Library' },
    ])
    collectionsApi.list.mockResolvedValue([
      { id: 'c_1', name: 'Inbox' },
      { id: 'c_2', name: 'Reading' },
    ])

    render(
      <LibraryProvider>
        <Probe />
      </LibraryProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('active-library')).toHaveTextContent('My Library')
    })
    await waitFor(() => {
      expect(screen.getByTestId('collection-count')).toHaveTextContent('2')
    })
    expect(collectionsApi.list).toHaveBeenCalledWith({ library_id: 'lib_1' })
    expect(localStorage.getItem('researchos_active_library')).toBe('lib_1')
  })
})

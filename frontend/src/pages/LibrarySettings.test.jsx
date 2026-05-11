import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LibrarySettings from './LibrarySettings'
import { useLibrary } from '../context/LibraryContext'
import { settingsApi } from '../services/api'

vi.mock('../context/LibraryContext', () => ({
  useLibrary: vi.fn(),
}))

vi.mock('../services/api', () => ({
  librariesApi: {},
  settingsApi: {
    getModels: vi.fn(),
    updateModels: vi.fn(),
  },
}))

const modelConfig = {
  current: {},
  defaults: {},
  descriptions: {},
  available_chat_models: [],
  available_embedding_models: [],
}

function renderSettings(activeLibrary = {
  id: 'lib_1',
  name: 'AI Papers',
  description: 'Old scope note',
  autoNoteEnabled: false,
  autoNotePrompt: '',
}) {
  const updateLibrary = vi.fn().mockResolvedValue(activeLibrary)
  const deleteLibrary = vi.fn().mockResolvedValue(undefined)

  settingsApi.getModels.mockResolvedValue(modelConfig)
  useLibrary.mockReturnValue({
    activeLibrary,
    updateLibrary,
    deleteLibrary,
  })

  render(
    <MemoryRouter initialEntries={['/library/settings']}>
      <LibrarySettings />
    </MemoryRouter>
  )

  return { updateLibrary, deleteLibrary }
}

describe('LibrarySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves a manual library description', async () => {
    const { updateLibrary } = renderSettings()

    fireEvent.change(screen.getByLabelText(/library description/i), {
      target: { value: 'Foundation model papers and related systems.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save changes$/i }))

    await waitFor(() => expect(updateLibrary).toHaveBeenCalledWith('lib_1', {
      name: 'AI Papers',
      description: 'Foundation model papers and related systems.',
    }))
  })

  it('clears the manual library description when saved empty', async () => {
    const { updateLibrary } = renderSettings()

    fireEvent.change(screen.getByLabelText(/library description/i), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save changes$/i }))

    await waitFor(() => expect(updateLibrary).toHaveBeenCalledWith('lib_1', {
      name: 'AI Papers',
      description: null,
    }))
  })
})

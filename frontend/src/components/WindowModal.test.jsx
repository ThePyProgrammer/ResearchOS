import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import WindowModal from './WindowModal'

describe('WindowModal', () => {
  it('renders overlay outside the caller subtree so parent stacking contexts cannot cover it', () => {
    render(
      <div data-testid="caller" className="relative z-0">
        <WindowModal open title="Stacking test" onClose={() => {}}>
          <p>Modal body</p>
        </WindowModal>
      </div>
    )

    expect(screen.getByText('Stacking test')).toBeInTheDocument()
    expect(screen.getByTestId('caller')).not.toContainElement(screen.getByText('Stacking test'))
  })

  it('preserves backdrop close behavior when rendered through the portal', () => {
    const onClose = vi.fn()

    render(
      <div data-testid="caller">
        <WindowModal open title="Close behavior" onClose={onClose}>
          <button type="button">Inside modal</button>
        </WindowModal>
      </div>
    )

    fireEvent.click(screen.getByText('Inside modal'))
    expect(onClose).not.toHaveBeenCalled()

    const backdrop = [...document.body.querySelectorAll('.fixed.inset-0')]
      .find(element => !element.className.includes('pointer-events-none'))

    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

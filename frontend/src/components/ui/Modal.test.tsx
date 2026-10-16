import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Modal } from './Modal'

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Modal
        open={open}
        title="Rename"
        onClose={() => {
          onClose()
          setOpen(false)
        }}
      >
        <input aria-label="Name" />
        <button>Save</button>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('renders nothing while closed', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a labelled modal dialog that focuses its first control', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))

    const dialog = screen.getByRole('dialog', { name: 'Rename' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Name')).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('traps Tab inside the dialog in both directions', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))

    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByLabelText('Name')).toHaveFocus() // wrapped, not escaped to the page
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
  })

  it('closes on Escape, restores scroll, and returns focus to the opener', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    expect(opener).toHaveFocus()
  })

  it('closes when the backdrop is clicked but not when the panel is', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))

    await userEvent.click(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('modal-backdrop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

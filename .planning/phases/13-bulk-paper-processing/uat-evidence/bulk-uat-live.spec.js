import { test, expect } from '@playwright/test'

const APP_URL = process.env.UAT_APP_URL || 'http://localhost:5174/library'
const EVIDENCE_DIR = '/home/prannayag/personal/ResearchOS/.planning/phases/13-bulk-paper-processing/uat-evidence'
const ACTION_LABELS = ['Generate Notes', 'Auto-Tag', 'Fetch PDFs', 'Generate Embeddings']

test.describe('Phase 13 bulk paper processing live browser UAT', () => {
  test('inspect library bulk processing UI without starting costly operations', async ({ page }) => {
    const findings = {
      url: APP_URL,
      loaded: false,
      visibleFatalErrors: [],
      rowCheckboxes: 0,
      selectedRows: 0,
      actionBarVisible: false,
      actionButtons: {},
      modals: {},
      aggregateControls: {},
      perItemControls: {},
      notes: [],
    }

    page.on('pageerror', err => findings.visibleFatalErrors.push(`pageerror: ${err.message}`))
    page.on('console', msg => {
      if (msg.type() === 'error') findings.visibleFatalErrors.push(`console: ${msg.text()}`)
    })

    await page.goto(APP_URL, { waitUntil: 'networkidle' })
    await page.screenshot({ path: `${EVIDENCE_DIR}/01-library-loaded.png`, fullPage: true })

    const bodyText = await page.locator('body').innerText().catch(() => '')
    findings.loaded = await page.locator('body').isVisible()
    for (const marker of ['Fatal', 'Unhandled', 'Application error', 'Something went wrong']) {
      if (bodyText.includes(marker)) findings.visibleFatalErrors.push(`visible text: ${marker}`)
    }

    const checkboxes = page.locator('input[type="checkbox"]')
    const checkboxCount = await checkboxes.count()
    findings.rowCheckboxes = Math.max(0, checkboxCount - 1)
    if (checkboxCount >= 3) {
      await checkboxes.nth(1).check({ force: true })
      await checkboxes.nth(2).check({ force: true })
      findings.selectedRows = 2
    } else if (checkboxCount >= 1) {
      await checkboxes.first().check({ force: true })
      findings.selectedRows = 1
    } else {
      findings.notes.push('No selectable checkboxes found on library page.')
    }

    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${EVIDENCE_DIR}/02-after-selection.png`, fullPage: true })

    const selectedText = await page.locator('body').innerText().catch(() => '')
    findings.actionBarVisible = /selected/i.test(selectedText) || ACTION_LABELS.some(label => selectedText.includes(label))
    for (const label of ACTION_LABELS) {
      findings.actionButtons[label] = await page.getByRole('button', { name: new RegExp(label, 'i') }).isVisible().catch(() => false)
    }
    for (const label of ['Add to Collection', 'Export BibTeX', 'Delete All']) {
      findings.actionButtons[label] = await page.getByRole('button', { name: new RegExp(label, 'i') }).isVisible().catch(() => false)
    }

    for (const label of ACTION_LABELS) {
      const button = page.getByRole('button', { name: new RegExp(label, 'i') }).first()
      if (!(await button.isVisible().catch(() => false))) {
        findings.modals[label] = { opened: false, reason: 'button not visible' }
        continue
      }

      await button.click()
      await page.waitForTimeout(1000)
      await page.screenshot({ path: `${EVIDENCE_DIR}/03-${label.toLowerCase().replaceAll(' ', '-')}-confirmation.png`, fullPage: true })
      const modalText = await page.locator('body').innerText().catch(() => '')
      findings.modals[label] = {
        opened: /confirm|proceed|selected|skip|cost|items|operation/i.test(modalText),
        hasCount: /\d+\s+(selected|items?|papers?)|selected\s+\d+|\d+\s+papers?/i.test(modalText),
        hasSkipInfo: /skip|already|existing/i.test(modalText),
        hasCostInfo: /cost|token|OpenAI|API/i.test(modalText),
        textExcerpt: modalText.slice(0, 1200),
      }

      if (label === 'Auto-Tag' || label === 'Generate Embeddings') {
        findings.aggregateControls[label] = {
          pauseVisibleInConfirmation: /\bPause\b|\bResume\b|\bCancel\b/i.test(modalText),
          note: 'Progress controls require starting the operation; not started to avoid OpenAI/API work.',
        }
      } else {
        findings.perItemControls[label] = {
          controlsInProgressNotVerified: true,
          note: 'Pause/Resume/Cancel behavior requires starting the operation; not started to avoid modifying live data or causing API work.',
        }
      }

      const cancel = page.getByRole('button', { name: /cancel|close|×/i }).last()
      if (await cancel.isVisible().catch(() => false)) {
        await cancel.click().catch(async () => page.keyboard.press('Escape'))
      } else {
        await page.keyboard.press('Escape')
      }
      await page.waitForTimeout(500)
    }

    await page.screenshot({ path: `${EVIDENCE_DIR}/04-final-state.png`, fullPage: true })
    console.log('UAT_FINDINGS ' + JSON.stringify(findings, null, 2))

    expect(findings.loaded).toBeTruthy()
    expect(findings.visibleFatalErrors.filter(e => !/favicon|Failed to load resource/i.test(e)).length).toBe(0)
  })
})

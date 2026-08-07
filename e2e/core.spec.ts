import { expect, test } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'

const fixturePath = path.resolve('test-artifacts/export-quality/export-quality-golden.md')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('md-reader:e2e-initialized')) {
      localStorage.clear()
      sessionStorage.setItem('md-reader:e2e-initialized', '1')
    }
    Object.defineProperty(window, '__printCalls', { value: 0, writable: true })
    window.print = () => { (window as typeof window & { __printCalls: number }).__printCalls += 1 }
  })
})

test('first launch, picker open, edit, unsaved protection, save and print', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('first-launch-card')).toBeVisible()

  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByTestId('first-launch-open').click()
  await (await chooserPromise).setFiles(fixturePath)

  await expect(page.getByTestId('first-launch-card')).toBeHidden()
  await expect(page.getByRole('heading', { name: /DOCX \/ PDF/ }).first()).toBeVisible()
  await expect(page.getByTestId('print-document')).toBeEnabled()

  await page.getByTestId('edit-mode').click()
  const editor = page.getByTestId('markdown-editor')
  await expect(editor).toBeVisible()
  const original = await editor.inputValue()
  await editor.fill(`${original}\n\n端到端回归修改`)
  await editor.press('End')
  await editor.press('Enter')
  // Editing keystrokes must not cause the renderer to fall back to reading mode.
  await expect(page.getByTestId('markdown-editor')).toBeVisible()
  await editor.press('Control+Home')
  await editor.press('Delete')
  await expect(page.getByTestId('markdown-editor')).toBeVisible()

  await page.getByTestId('new-document').click()
  await expect(page.getByRole('dialog')).toBeHidden()
  const dirtyTab = page.locator('.document-tabs__item').filter({ has: page.locator('.document-tabs__dirty') })
  await expect(dirtyTab).toHaveCount(1)
  await dirtyTab.locator('.document-tabs__close').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '取消' }).click()
  await dirtyTab.locator('.document-tabs__activate').click()
  await page.getByTestId('edit-mode').click()
  await expect(page.getByTestId('markdown-editor')).toHaveValue(/端到端回归修改/)

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('save-document').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('export-quality-golden.md')
  expect(await download.createReadStream()).not.toBeNull()
  await expect(page.getByTestId('markdown-editor')).toBeVisible()

  await page.getByTestId('read-mode').click()
  await page.getByTestId('print-document').click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __printCalls: number }).__printCalls)).toBe(1)
})

test('drag and drop opens Markdown and XLSX/DOCX/PDF exports download real files', async ({ page }) => {
  await page.goto('/')
  const markdown = '# 拖入验收\n\n中文正文\n\n| 列一 | 列二 |\n| --- | --- |\n| A | B |'
  await page.locator('body').evaluate((body, value) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([value], 'dragged.md', { type: 'text/markdown' }))
    body.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
  }, markdown)
  await expect(page.getByRole('heading', { name: '拖入验收' })).toBeVisible()

  const tableTools = page.getByRole('button', { name: '表格工具' })
  await expect(tableTools).toBeVisible()
  await expect(page.getByRole('button', { name: '导出 XLSX' })).toBeHidden()
  await tableTools.click()
  await expect(page.getByRole('button', { name: '收起表格工具' })).toBeVisible()

  const xlsxPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 XLSX' }).click()
  const xlsx = await xlsxPromise
  expect(xlsx.suggestedFilename()).toBe('markdown-table.xlsx')
  const xlsxPath = await xlsx.path()
  expect(xlsxPath).not.toBeNull()
  const workbook = unzipSync(await fs.readFile(xlsxPath!))
  const worksheet = strFromU8(workbook['xl/worksheets/sheet1.xml'])
  expect(worksheet).toContain('<t xml:space="preserve">列一</t>')
  expect(worksheet).toContain('<t xml:space="preserve">B</t>')
  await fs.mkdir('test-artifacts/xlsx', { recursive: true })
  await xlsx.saveAs('test-artifacts/xlsx/table-export-golden.xlsx')

  const docxPromise = page.waitForEvent('download')
  await page.getByTestId('export-docx').click()
  const docx = await docxPromise
  expect(docx.suggestedFilename()).toBe('dragged.docx')
  const docxPath = await docx.path()
  expect(docxPath).not.toBeNull()

  const pdfPromise = page.waitForEvent('download')
  await page.getByTestId('export-pdf').click()
  const pdf = await pdfPromise
  expect(pdf.suggestedFilename()).toBe('dragged.pdf')
  const pdfPath = await pdf.path()
  expect(pdfPath).not.toBeNull()
})

test('vertical reading exposes a visible horizontal scrolling viewport', async ({ page }) => {
  await page.goto('/')
  const markdown = ['# 竖排滚动验收', ...Array.from({ length: 180 }, (_, index) => `第 ${index + 1} 段竖排阅读内容，用于确认长文可以从右向左连续浏览。`)].join('\n\n')
  await page.locator('body').evaluate((body, value) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([value], 'vertical-scroll.md', { type: 'text/markdown' }))
    body.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
  }, markdown)

  await page.getByRole('button', { name: '版式', exact: true }).click()
  await page.getByRole('button', { name: '竖排阅读' }).click()
  const viewport = page.getByTestId('vertical-reading-viewport')
  await expect(viewport).toBeVisible()
  const metrics = await viewport.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      overflowX: style.overflowX,
      writingMode: style.writingMode,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }
  })
  expect(metrics).toMatchObject({ overflowX: 'scroll', writingMode: 'vertical-rl' })
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth)
})

test('persisted history hydrates before autosave and a discarded recovery draft is consumed', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('md_reader_data', JSON.stringify({
      history: [{
        path: 'C:\\docs\\remembered.md',
        title: 'remembered',
        lastOpenedAt: Date.now(),
        isFavorite: false,
        scrollPositionRatio: 0.42,
      }],
      theme: 'paper',
      recoveryDraft: { path: null, content: '# 未保存草稿', updatedAt: Date.now() },
    }))
  })
  await page.reload()

  await expect(page.getByText('remembered', { exact: true })).toBeVisible()
  const recovery = page.getByRole('dialog', { name: '发现未保存草稿' })
  await expect(recovery).toBeVisible()
  await recovery.getByRole('button', { name: '丢弃草稿' }).click()
  await expect(recovery).toBeHidden()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('md_reader_data') || '{}').recoveryDraft ?? null)).toBeNull()

  await page.reload()
  await expect(page.getByRole('dialog', { name: '发现未保存草稿' })).toBeHidden()
  await expect(page.getByText('remembered', { exact: true })).toBeVisible()

  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('md_reader_data') || '{}')
    localStorage.setItem('md_reader_data', JSON.stringify({
      ...data,
      recoveryDraft: { path: null, content: '# 可恢复内容\n\n按钮必须立即响应。', updatedAt: Date.now() },
    }))
  })
  await page.reload()
  const secondRecovery = page.getByRole('dialog', { name: '发现未保存草稿' })
  await secondRecovery.getByRole('button', { name: '恢复草稿' }).click()
  await expect(secondRecovery).toBeHidden()
  await expect(page.getByTestId('markdown-editor')).toHaveValue(/按钮必须立即响应/)
})

test('preflight choices can continue directly to PDF export', async ({ page }) => {
  await page.goto('/')
  const markdown = '# 预检闭环\n\n![远程图片](https://example.com/remote.png)'
  await page.locator('body').evaluate((body, value) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([value], 'preflight.md', { type: 'text/markdown' }))
    body.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
  }, markdown)

  await page.getByTestId('export-pdf').click()
  const preflight = page.getByRole('region', { name: '导出预检' })
  await expect(preflight).toBeVisible()
  const exportButton = preflight.getByRole('button', { name: '导出 PDF' })
  await expect(exportButton).toBeDisabled()
  await preflight.getByRole('radio', { name: '导出副本中省略' }).check()
  await expect(exportButton).toBeEnabled()

  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const pdf = await downloadPromise
  expect(pdf.suggestedFilename()).toBe('preflight.pdf')
  await expect(preflight).toBeHidden()
})

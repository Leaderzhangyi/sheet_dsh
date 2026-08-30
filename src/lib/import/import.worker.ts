import * as XLSX from 'xlsx'
import { importWorkbook } from './adapter'

type WorkerRequest = {
  id: number
  type: 'inspect' | 'parse'
  buffer: ArrayBuffer
  sourceFile: string
  selectedSheetNames?: string[]
}

const clean = (value: unknown) => String(value ?? '').trim()

function worksheetToRows(sheet: XLSX.WorkSheet): unknown[][] {
  const populatedCells = Object.entries(sheet)
    .filter(([address, cell]) => !address.startsWith('!') && cell?.v !== undefined)
    .map(([address, cell]) => ({ position: XLSX.utils.decode_cell(address), value: cell.v }))
  if (populatedCells.length === 0) return []

  let maxRow = 0
  let maxColumn = 0
  populatedCells.forEach(({ position }) => {
    maxRow = Math.max(maxRow, position.r)
    maxColumn = Math.max(maxColumn, position.c)
  })
  const rows = Array.from({ length: maxRow + 1 }, () => Array<unknown>(maxColumn + 1).fill(null))
  populatedCells.forEach(({ position, value }) => { rows[position.r][position.c] = value })
  return rows
}

function rowCount(sheet: XLSX.WorkSheet, rows: unknown[][]) {
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null
  return range ? range.e.r - range.s.r + 1 : rows.length
}

function inspectWorkbook(workbook: XLSX.WorkBook) {
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    const rows = worksheetToRows(sheet)
    return {
      name,
      rowCount: rowCount(sheet, rows),
      preview: rows.slice(0, 5).map((row) => row.slice(0, 12)),
      likelyRevision: /修订|历史|变更|revision/i.test(name),
    }
  })
}

const workerScope = self as unknown as {
  onmessage: (event: MessageEvent<WorkerRequest>) => void
  postMessage: (message: unknown) => void
}

workerScope.onmessage = (event) => {
  const request = event.data
  try {
    workerScope.postMessage({ id: request.id, progress: 10 })
    const workbook = XLSX.read(request.buffer, { type: 'array', cellDates: true })
    if (request.type === 'inspect') {
      workerScope.postMessage({ id: request.id, progress: 85 })
      workerScope.postMessage({ id: request.id, ok: true, result: inspectWorkbook(workbook) })
      return
    }
    workerScope.postMessage({ id: request.id, progress: 35 })
    const selected = request.selectedSheetNames ? new Set(request.selectedSheetNames) : null
    const sheets = workbook.SheetNames
      .filter((name) => !selected || selected.has(name))
      .map((name) => ({ name, rows: worksheetToRows(workbook.Sheets[name]) }))
    const dataset = importWorkbook(sheets, { sourceFile: request.sourceFile })
    workerScope.postMessage({ id: request.id, progress: 85 })
    workerScope.postMessage({ id: request.id, progress: 100 })
    workerScope.postMessage({ id: request.id, ok: true, result: dataset })
  } catch (error) {
    workerScope.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : clean(error) })
  }
}

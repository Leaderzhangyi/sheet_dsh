import type { DictionaryDataset } from './types'

export interface WorkbookSheetInfo {
  name: string
  rowCount: number
  preview: unknown[][]
  likelyRevision: boolean
}

interface WorkerResponse {
  id: number
  ok: boolean
  result?: WorkbookSheetInfo[] | DictionaryDataset
  error?: string
  progress?: number
}

let workerRequestId = 0

function runWorker<T>(request: { type: 'inspect' | 'parse'; buffer: ArrayBuffer; sourceFile: string; selectedSheetNames?: string[] }, onProgress?: (progress: number) => void): Promise<T> {
  if (typeof Worker === 'undefined') return Promise.reject(new Error('当前浏览器不支持 Excel 后台解析。'))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' })
    const id = ++workerRequestId
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return
      if (event.data.progress !== undefined) {
        onProgress?.(event.data.progress)
        return
      }
      worker.terminate()
      if (event.data.ok) resolve(event.data.result as T)
      else reject(new Error(event.data.error ?? 'Excel 解析失败。'))
    }
    worker.onerror = () => {
      worker.terminate()
      reject(new Error('Excel 后台解析失败，请重试。'))
    }
    worker.postMessage({ ...request, id }, [request.buffer])
  })
}

export async function inspectExcelArrayBuffer(buffer: ArrayBuffer, sourceFile: string, onProgress?: (progress: number) => void): Promise<WorkbookSheetInfo[]> {
  return runWorker<WorkbookSheetInfo[]>({ type: 'inspect', buffer, sourceFile }, onProgress)
}

export async function inspectExcelFile(file: File, onProgress?: (progress: number) => void): Promise<WorkbookSheetInfo[]> {
  return inspectExcelArrayBuffer(await file.arrayBuffer(), file.name, onProgress)
}

export async function readExcelArrayBuffer(buffer: ArrayBuffer, sourceFile: string, selectedSheetNames?: string[], onProgress?: (progress: number) => void): Promise<DictionaryDataset> {
  return runWorker<DictionaryDataset>({ type: 'parse', buffer, sourceFile, selectedSheetNames }, onProgress)
}

export async function readExcelFile(file: File, selectedSheetNames?: string[], onProgress?: (progress: number) => void): Promise<DictionaryDataset> {
  return readExcelArrayBuffer(await file.arrayBuffer(), file.name, selectedSheetNames, onProgress)
}

export function fingerprintUploadedFile(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

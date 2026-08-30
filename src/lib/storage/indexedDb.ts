import type { DictionaryDataset } from '../import/types'

const DATABASE_NAME = 'data-dictionary-query-desk'
const STORE_NAME = 'datasets'
const ACTIVE_DATASET_KEY = 'active'
const WORKSPACE_KEY = 'workspace'
const CACHE_SCHEMA_VERSION = 2
const CHUNK_SIZE = 500
const DATASET_COLLECTIONS = ['tables', 'fields', 'standards', 'codeItems', 'revisions', 'unknownSheets', 'issues'] as const
type DatasetCollection = typeof DATASET_COLLECTIONS[number]

type DatasetWithoutCollections = Omit<DictionaryDataset, DatasetCollection>

export interface DatasetSource {
  kind: 'bundled' | 'uploaded'
  fingerprint: string
}

export interface PersistedDataset {
  dataset: DictionaryDataset
  source: DatasetSource
  savedAt: string
}

export type DatasetSlot = 'warehouse' | 'retail'

export interface PersistedWorkspace {
  warehouse?: PersistedDataset
  retail?: PersistedDataset
}

interface PersistedRecord extends PersistedDataset {
  id: string
  schemaVersion: number
}

interface PersistedWorkspaceRecord {
  id: typeof WORKSPACE_KEY
  schemaVersion: number
  datasets: PersistedWorkspace
}

interface PersistedDatasetRecord extends Omit<PersistedRecord, 'dataset'> {
  dataset: DatasetWithoutCollections
  chunked: true
}

interface PersistedChunkRecord {
  id: string
  schemaVersion: number
  collection: DatasetCollection
  values: unknown[]
}

function isChunkedRecord(record: PersistedRecord | PersistedDatasetRecord | undefined): record is PersistedDatasetRecord {
  return Boolean(record && record.schemaVersion === CACHE_SCHEMA_VERSION && 'chunked' in record && record.chunked === true)
}

function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error('当前浏览器不支持 IndexedDB。'))

  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, CACHE_SCHEMA_VERSION)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地索引库。'))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
  })
}

function completeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('本地索引写入失败。'))
    transaction.onabort = () => reject(transaction.error ?? new Error('本地索引操作被取消。'))
  })
}

const chunkId = (ownerId: string, collection: DatasetCollection, index: number) => `${ownerId}:${collection}:${index}`
const chunkIdRange = (ownerId: string, collection: DatasetCollection) => IDBKeyRange.bound(`${ownerId}:${collection}:`, `${ownerId}:${collection}:\uffff`)
const ownerKeyRange = (ownerId: string) => IDBKeyRange.bound(`${ownerId}:`, `${ownerId}:\uffff`)
const chunkOrder = (chunk: PersistedChunkRecord) => Number(String(chunk.id).split(':').pop()) || 0

function chunkDataset(dataset: DictionaryDataset) {
  const metadata = { ...dataset } as Partial<DictionaryDataset> & Record<string, unknown>
  const chunks: PersistedChunkRecord[] = []
  for (const collection of DATASET_COLLECTIONS) {
    const values = metadata[collection] as unknown[]
    delete metadata[collection]
    for (let index = 0; index < values.length; index += CHUNK_SIZE) chunks.push({ id: '', schemaVersion: CACHE_SCHEMA_VERSION, collection, values: values.slice(index, index + CHUNK_SIZE) })
  }
  return { metadata: metadata as DatasetWithoutCollections, chunks }
}

async function deleteDatasetChunks(store: IDBObjectStore, ownerId: string) {
  const keys = await requestValue(store.getAllKeys(ownerKeyRange(ownerId)))
  for (const key of keys) store.delete(key)
}

async function putDataset(store: IDBObjectStore, ownerId: string, dataset: DictionaryDataset, source: DatasetSource) {
  await deleteDatasetChunks(store, ownerId)
  const { metadata, chunks } = chunkDataset(dataset)
  store.put({ id: ownerId, schemaVersion: CACHE_SCHEMA_VERSION, chunked: true, dataset: metadata, source, savedAt: new Date().toISOString() } satisfies PersistedDatasetRecord)
  for (const [index, chunk] of chunks.entries()) store.put({ ...chunk, id: chunkId(ownerId, chunk.collection, index) })
}

async function readDataset(transaction: IDBTransaction, ownerId: string, record: PersistedDatasetRecord): Promise<PersistedDataset> {
  const store = transaction.objectStore(STORE_NAME)
  const collections = {} as Record<DatasetCollection, unknown[]>
  for (const collection of DATASET_COLLECTIONS) {
    const chunks = await requestValue(store.getAll(chunkIdRange(ownerId, collection)) as IDBRequest<PersistedChunkRecord[]>)
    chunks.sort((left, right) => chunkOrder(left) - chunkOrder(right))
    collections[collection] = chunks.flatMap((chunk) => chunk.values)
  }
  return { dataset: { ...record.dataset, ...collections } as DictionaryDataset, source: record.source, savedAt: record.savedAt }
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('本地索引读取失败。'))
  })
}

export async function savePersistedDataset(dataset: DictionaryDataset, source: DatasetSource): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    await putDataset(transaction.objectStore(STORE_NAME), ACTIVE_DATASET_KEY, dataset, source)
    await completeTransaction(transaction)
  } finally {
    database.close()
  }
}

export async function loadPersistedDataset(): Promise<PersistedDataset | null> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const record = await requestValue(transaction.objectStore(STORE_NAME).get(ACTIVE_DATASET_KEY) as IDBRequest<(PersistedRecord | PersistedDatasetRecord) | undefined>)
    if (!record || ![1, CACHE_SCHEMA_VERSION].includes(record.schemaVersion)) return null
    const result = isChunkedRecord(record) ? await readDataset(transaction, ACTIVE_DATASET_KEY, record) : { dataset: record.dataset, source: record.source, savedAt: record.savedAt }
    await completeTransaction(transaction)
    return result
  } finally {
    database.close()
  }
}

export async function saveWorkspaceDataset(slot: DatasetSlot, dataset: DictionaryDataset, source: DatasetSource, onProgress?: (progress: number) => void): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const existing = await requestValue(store.get(WORKSPACE_KEY) as IDBRequest<PersistedWorkspaceRecord | undefined>)
    const nextWorkspace = {
      ...(existing?.schemaVersion === CACHE_SCHEMA_VERSION ? existing.datasets : {}),
      [slot]: undefined,
    }
    store.put({
      id: WORKSPACE_KEY,
      schemaVersion: CACHE_SCHEMA_VERSION,
      datasets: nextWorkspace,
    } satisfies PersistedWorkspaceRecord)
    onProgress?.(10)
    await putDataset(store, `${WORKSPACE_KEY}:${slot}`, dataset, source)
    onProgress?.(100)
    await completeTransaction(transaction)
  } finally {
    database.close()
  }
}

export async function loadPersistedWorkspace(): Promise<PersistedWorkspace> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const record = await requestValue(transaction.objectStore(STORE_NAME).get(WORKSPACE_KEY) as IDBRequest<PersistedWorkspaceRecord | undefined>)
    const active = record ? null : await requestValue(transaction.objectStore(STORE_NAME).get(ACTIVE_DATASET_KEY) as IDBRequest<(PersistedRecord | PersistedDatasetRecord) | undefined>)
    if (record?.schemaVersion === CACHE_SCHEMA_VERSION && record.datasets) {
      const result: PersistedWorkspace = {}
      for (const slot of ['warehouse', 'retail'] as const) {
        const meta = await requestValue(transaction.objectStore(STORE_NAME).get(`${WORKSPACE_KEY}:${slot}`) as IDBRequest<PersistedDatasetRecord | undefined>)
        if (meta?.chunked) result[slot] = await readDataset(transaction, `${WORKSPACE_KEY}:${slot}`, meta)
      }
      await completeTransaction(transaction)
      return result
    }
    if (record?.schemaVersion === 1 && record.datasets) {
      await completeTransaction(transaction)
      return record.datasets
    }
    if (!active || ![1, CACHE_SCHEMA_VERSION].includes(active.schemaVersion)) return {}
    const activeDataset = isChunkedRecord(active) ? await readDataset(transaction, ACTIVE_DATASET_KEY, active) : { dataset: active.dataset, source: active.source, savedAt: active.savedAt }
    const slot: DatasetSlot = activeDataset.dataset.adapterName === 'rcvp-retail-mart-adapter' ? 'retail' : 'warehouse'
    await completeTransaction(transaction)
    return { [slot]: activeDataset }
  } finally {
    database.close()
  }
}

export async function clearPersistedDataset(): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const keys = await requestValue(store.getAllKeys())
    for (const key of keys) {
      if (key === ACTIVE_DATASET_KEY || key === WORKSPACE_KEY || String(key).startsWith(`${WORKSPACE_KEY}:`)) store.delete(key)
    }
    await completeTransaction(transaction)
  } finally {
    database.close()
  }
}

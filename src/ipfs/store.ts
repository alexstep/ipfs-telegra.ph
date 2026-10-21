import type { IpfsFile } from '../article/types'

export interface ContentStore {
  get(cid: string): Promise<IpfsFile[] | null>
  put(cid: string, files: IpfsFile[]): Promise<void>
}

export function memoryStore(): ContentStore {
  const records = new Map<string, IpfsFile[]>()
  return {
    async get(cid) {
      return records.get(cid) ?? null
    },
    async put(cid, files) {
      records.set(cid, files)
    },
  }
}

const DB_NAME = 'telegraph-ipfs'
const STORE = 'directories'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function idbStore(): ContentStore {
  return {
    async get(cid) {
      const db = await openDb()
      return new Promise((resolve, reject) => {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(cid)
        request.onsuccess = () => resolve((request.result as IpfsFile[] | undefined) ?? null)
        request.onerror = () => reject(request.error)
      })
    },
    async put(cid, files) {
      const db = await openDb()
      return new Promise((resolve, reject) => {
        const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(files, cid)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    },
  }
}

export function browserStore(): ContentStore {
  const fallback = memoryStore()
  const durable = idbStore()
  return {
    async get(cid) {
      try {
        return await durable.get(cid)
      } catch {
        return fallback.get(cid)
      }
    },
    async put(cid, files) {
      try {
        await durable.put(cid, files)
      } catch {
        await fallback.put(cid, files)
      }
    },
  }
}

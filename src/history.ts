import type { PublishMode } from './ipfs/pin'

export type HistoryEntry = {
  cid: string
  title: string
  author: string
  createdAt: string
  mode: PublishMode
  previousCid?: string
}

const KEY = 'telegraph.history'

export function loadHistory(): HistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]') as HistoryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function remember(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...loadHistory().filter((item) => item.cid !== entry.cid)].slice(0, 50)
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

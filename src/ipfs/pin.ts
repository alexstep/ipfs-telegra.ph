import type { IpfsFile } from '../article/types'

function fileBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy], { type })
}

export type PublishMode = 'local' | 'pinata' | 'psa' | 'kubo'

export async function uploadToPinata(files: IpfsFile[], options: {
  endpoint: string
  token: string
  name: string
  fetchImpl?: typeof fetch
}): Promise<string> {
  const endpoint = options.endpoint.replace(/\/+$/, '') || 'https://api.pinata.cloud'
  const url = endpoint.endsWith('/pinning/pinFileToIPFS')
    ? endpoint
    : `${endpoint}/pinning/pinFileToIPFS`
  const form = new FormData()
  for (const file of files) {
    form.append('file', fileBlob(file.bytes, file.type), file.path)
  }
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1, wrapWithDirectory: true }))
  form.append('pinataMetadata', JSON.stringify({ name: options.name.slice(0, 200) || 'article' }))
  const response = await (options.fetchImpl ?? fetch)(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.token}` },
    body: form,
  })
  const payload = await response.json().catch(() => ({})) as { IpfsHash?: string; error?: string; reason?: string }
  if (!response.ok || !payload.IpfsHash) {
    throw new Error(payload.error || payload.reason || `Pinata upload failed (${response.status})`)
  }
  return payload.IpfsHash
}

export async function addToKubo(files: IpfsFile[], options: {
  api: string
  fetchImpl?: typeof fetch
}): Promise<string> {
  const api = options.api.replace(/\/+$/, '').replace(/\/api\/v0$/, '')
  const form = new FormData()
  for (const file of files) {
    form.append('file', fileBlob(file.bytes, file.type), file.path)
  }
  const url = `${api}/api/v0/add?cid-version=1&wrap-with-directory=true&hash=sha2-256`
  const response = await (options.fetchImpl ?? fetch)(url, { method: 'POST', body: form })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `Kubo add failed (${response.status})`)
  const entries = text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    return JSON.parse(line) as { Name?: string; Hash?: string }
  })
  const wrapped = entries.find((entry) => entry.Name === '') ?? entries[entries.length - 1]
  if (!wrapped?.Hash) throw new Error('Kubo did not return a directory CID')
  return wrapped.Hash
}

export async function pinWithPsa(cid: string, options: {
  endpoint: string
  token: string
  name: string
  fetchImpl?: typeof fetch
}): Promise<void> {
  const endpoint = options.endpoint.replace(/\/+$/, '')
  const url = endpoint.endsWith('/pins') ? endpoint : `${endpoint}/pins`
  const response = await (options.fetchImpl ?? fetch)(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cid, name: options.name.slice(0, 255) || 'article' }),
  })
  if (response.status !== 200 && response.status !== 202) {
    const text = await response.text()
    throw new Error(text || `Pinning service rejected the CID (${response.status})`)
  }
  const payload = await response.json().catch(() => ({})) as { status?: string; error?: { reason?: string } }
  if (payload.status === 'failed') {
    throw new Error(payload.error?.reason || 'Pinning service failed')
  }
}

import { CID } from 'multiformats/cid'

// Checked on 2026-10-21. ipfs.io and dweb.link answer programmatic clients
// with 429 and a sunset date of 2026-09-21. w3s.link and cloudflare-ipfs.com
// no longer serve content. These three still returned the bytes, with CORS.
export const PUBLIC_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs',
  'https://ipfs.filebase.io/ipfs',
  'https://4everland.io/ipfs',
]

export function normalizeGateway(input: string): string {
  let value = input.trim().replace(/\/+$/, '')
  if (!value) return ''
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  if (!/\/ipfs$/i.test(value)) value += '/ipfs'
  return value
}

export function gatewayList(extra?: string): string[] {
  const list: string[] = []
  const dedicated = extra ? normalizeGateway(extra) : ''
  if (dedicated) list.push(dedicated)
  for (const gateway of PUBLIC_GATEWAYS) {
    if (!list.includes(gateway)) list.push(gateway)
  }
  return list
}

export function ipfsUrl(gateway: string, cid: string, path = ''): string {
  const base = gateway.replace(/\/+$/, '')
  const parts = path.split('/').filter(Boolean).map((part) => encodeURIComponent(part))
  return [base, cid, ...parts].join('/')
}

export function assertCid(cid: string): void {
  CID.parse(cid)
}

export async function fetchIpfsPath(cid: string, path: string, options: {
  gateways: string[]
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<{ bytes: Uint8Array; contentType: string; gateway: string; url: string }> {
  assertCid(cid)
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 12_000
  const errors: string[] = []
  for (const gateway of options.gateways) {
    const url = ipfsUrl(gateway, cid, path)
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) {
        errors.push(`${response.status} ${url}`)
        continue
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      return {
        bytes,
        contentType: response.headers.get('content-type') || '',
        gateway,
        url,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${message} ${url}`)
    }
  }
  throw new Error(errors.join(' | ') || 'No gateways configured')
}

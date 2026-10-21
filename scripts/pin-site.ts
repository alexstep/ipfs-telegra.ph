import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const token = process.env.PINNING_TOKEN || ''
const endpoint = (process.env.PINNING_ENDPOINT || 'https://api.pinata.cloud').replace(/\/+$/, '')
const dist = join(import.meta.dir, '..', 'dist')

if (!token) {
  console.error('PINNING_TOKEN is not set')
  process.exit(1)
}

const files = await walk(dist)
const form = new FormData()
for (const file of files) {
  form.append('file', new Blob([file.bytes]), file.path)
}
form.append('pinataOptions', JSON.stringify({ cidVersion: 1, wrapWithDirectory: true }))
form.append('pinataMetadata', JSON.stringify({ name: `ipfs-telegraph ${new Date().toISOString()}` }))

const response = await fetch(`${endpoint}/pinning/pinFileToIPFS`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
})
const payload = await response.json().catch(() => ({})) as { IpfsHash?: string; error?: string }
if (!response.ok || !payload.IpfsHash) {
  console.error(payload.error || `Pin failed (${response.status})`)
  process.exit(1)
}

console.log(payload.IpfsHash)
console.log(`https://gateway.pinata.cloud/ipfs/${payload.IpfsHash}/`)

async function walk(dir: string): Promise<{ path: string; bytes: Uint8Array }[]> {
  const found: { path: string; bytes: Uint8Array }[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...await walk(absolute))
    else if (entry.isFile() && !entry.name.endsWith('.map')) {
      const path = relative(dist, absolute).split('\\').join('/')
      found.push({ path, bytes: new Uint8Array(await readFile(absolute)) })
    }
  }
  return found
}

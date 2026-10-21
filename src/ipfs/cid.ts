import { MemoryBlockstore } from 'blockstore-core/memory'
import { importer } from 'ipfs-unixfs-importer'
import type { IpfsFile } from '../article/types'

// unixfs-v1-2025 is the current UnixFS profile (IPIP-499): CIDv1, raw leaves,
// 1 MiB chunks. The same name is what Pinata's upload API calls `unixfs-v1-2025`.
// Local publishing uses this CID. Remote publishing keeps the CID the service returns,
// because Kubo and Pinata folder uploads hash the bytes on their side.
export async function importDirectory(files: IpfsFile[]): Promise<{ cid: string; blockstore: MemoryBlockstore }> {
  const blockstore = new MemoryBlockstore()
  const source = [...files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => ({ path: file.path, content: file.bytes }))
  let cid = ''
  for await (const entry of importer(source, blockstore, {
    profile: 'unixfs-v1-2025',
    wrapWithDirectory: true,
  })) {
    cid = entry.cid.toString()
  }
  if (!cid) throw new Error('Nothing to publish')
  return { cid, blockstore }
}

export async function directoryCid(files: IpfsFile[]): Promise<string> {
  return (await importDirectory(files)).cid
}

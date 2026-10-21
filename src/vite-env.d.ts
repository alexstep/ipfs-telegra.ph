/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PIN_PROVIDER?: string
  readonly VITE_PIN_ENDPOINT?: string
  readonly VITE_PIN_TOKEN?: string
  readonly VITE_KUBO_API?: string
  readonly VITE_IPFS_GATEWAY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

import type { PublishMode } from './ipfs/pin'

export type Provider = PublishMode

export type PinSettings = {
  provider: Provider
  endpoint: string
  token: string
  kuboApi: string
  gateway: string
}

const KEY = 'telegraph.pin-settings'

export function defaultEndpoint(provider: Provider): string {
  if (provider === 'pinata') return 'https://api.pinata.cloud'
  if (provider === 'psa') return 'https://api.pinata.cloud/psa'
  if (provider === 'kubo') return 'http://127.0.0.1:5001'
  return ''
}

function providerOf(value: unknown): Provider {
  if (value === 'pinata' || value === 'psa' || value === 'kubo' || value === 'local') return value
  return 'local'
}

export function loadSettings(): PinSettings {
  const env = import.meta.env
  const provider = providerOf(env.VITE_PIN_PROVIDER)
  const settings: PinSettings = {
    provider,
    endpoint: env.VITE_PIN_ENDPOINT || defaultEndpoint(provider),
    token: env.VITE_PIN_TOKEN || '',
    kuboApi: env.VITE_KUBO_API || '',
    gateway: env.VITE_IPFS_GATEWAY || '',
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<PinSettings> | null
    if (saved && typeof saved === 'object') {
      return {
        provider: providerOf(saved.provider ?? settings.provider),
        endpoint: typeof saved.endpoint === 'string' ? saved.endpoint : settings.endpoint,
        token: typeof saved.token === 'string' ? saved.token : settings.token,
        kuboApi: typeof saved.kuboApi === 'string' ? saved.kuboApi : settings.kuboApi,
        gateway: typeof saved.gateway === 'string' ? saved.gateway : settings.gateway,
      }
    }
  } catch {
    // Ignore a broken local settings blob and keep the env defaults.
  }
  return settings
}

export function saveSettings(settings: PinSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
}

export type PublishPlan =
  | { ok: true; mode: PublishMode }
  | { ok: false; message: string }

export function planPublish(settings: PinSettings): PublishPlan {
  const token = settings.token.trim()
  const kubo = settings.kuboApi.trim()
  if (settings.provider === 'local') return { ok: true, mode: 'local' }
  if (settings.provider === 'pinata') {
    if (!token) return { ok: true, mode: 'local' }
    return { ok: true, mode: 'pinata' }
  }
  if (settings.provider === 'kubo') {
    if (!kubo) {
      return { ok: false, message: 'Set the Kubo HTTP API address in settings. A local node is usually http://127.0.0.1:5001.' }
    }
    return { ok: true, mode: 'kubo' }
  }
  if (!token) return { ok: true, mode: 'local' }
  if (!kubo) {
    return {
      ok: false,
      message: 'The Pinning Service API pins a CID that is already on the network. Add a Kubo HTTP API address so the article can be uploaded first, or switch the service to Pinata.',
    }
  }
  return { ok: true, mode: 'psa' }
}

export function modeLabel(settings: PinSettings): string {
  const plan = planPublish(settings)
  if (!plan.ok) return 'Needs setup'
  if (plan.mode === 'local') return 'This browser'
  if (plan.mode === 'pinata') return 'Pinata'
  if (plan.mode === 'psa') return 'Pinning service'
  return 'Kubo'
}

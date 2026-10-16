import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  apiErrorMessage,
  clearLocalAiConfig,
  fetchAiConfig,
  isRouteMissing,
  persistLocalAiConfig,
  readLocalAiConfig,
  sanitizeAiInput,
  saveAiConfig,
  testAiConnection,
  type AiConfig,
  type AiConfigUpdate,
  type AiTestResult,
  type LocalAiConfig,
} from '../../api/client'
import { AlertIcon, RefreshIcon } from '../icons'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import type { ToastMessage } from '../ui/Toast'

type ProviderId = 'gemini' | 'openai' | 'groq' | 'openrouter' | 'custom'

interface ProviderSpec {
  id: ProviderId
  label: string
  hint: string
  defaultModel: string
  models: string[]
  defaultBaseUrl: string
  withBaseUrl: boolean
}

const PROVIDERS: ProviderSpec[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    hint: 'Google AI Studio — multimodal vision + long context.',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    defaultBaseUrl: '',
    withBaseUrl: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'Platform API — GPT-4o family for reasoning and moderation.',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o'],
    defaultBaseUrl: '',
    withBaseUrl: false,
  },
  {
    id: 'groq',
    label: 'Groq',
    hint: 'Groq Cloud — lowest latency open-model inference.',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    models: ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-versatile'],
    defaultBaseUrl: '',
    withBaseUrl: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    hint: 'Single key across every major model — routing handled upstream.',
    defaultModel: 'google/gemini-2.0-flash-001',
    models: ['google/gemini-2.0-flash-001', 'openai/gpt-4o-mini'],
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    withBaseUrl: true,
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-Compatible',
    hint: 'Self-hosted or proxy endpoints that speak the OpenAI SDK contract.',
    defaultModel: '',
    models: [],
    defaultBaseUrl: '',
    withBaseUrl: true,
  },
]

const PROVIDER_ALIASES: Record<string, ProviderId> = {
  gemini: 'gemini',
  google: 'gemini',
  google_gemini: 'gemini',
  'google-gemini': 'gemini',
  google_ai: 'gemini',
  vertex: 'gemini',
  openai: 'openai',
  'open-ai': 'openai',
  open_ai: 'openai',
  gpt: 'openai',
  azure_openai: 'openai',
  groq: 'groq',
  groq_cloud: 'groq',
  openrouter: 'openrouter',
  'open-router': 'openrouter',
  custom: 'custom',
  custom_openai: 'custom',
  'custom-openai': 'custom',
  openai_compatible: 'custom',
  'openai-compatible': 'custom',
  ollama: 'custom',
  lm_studio: 'custom',
}

function providerSpec(id: ProviderId): ProviderSpec {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0]
}

/** Local-only timestamp for the amber "pending sync" notice. */
function formatSavedAt(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'earlier in this session'
  return parsed.toLocaleString()
}

/** Maps whatever the backend stores onto one of the five selectable providers. */
function normalizeProvider(raw: string): ProviderId {
  const key = raw.trim().toLowerCase().replace(/\s+/g, '_')
  if (!key) return 'gemini'
  const alias = PROVIDER_ALIASES[key]
  if (alias) return alias
  return PROVIDERS.some((provider) => provider.id === key) ? (key as ProviderId) : 'custom'
}

/** Does the queued local config already match what the server reports? */
function sameAsServer(server: AiConfig, local: LocalAiConfig): boolean {
  return (
    normalizeProvider(local.ai_provider) === normalizeProvider(server.ai_provider) &&
    local.ai_model === server.ai_model &&
    (local.ai_base_url ?? '') === (server.ai_base_url ?? '')
  )
}

interface AiConfigPanelProps {
  onToast: (text: string, tone: ToastMessage['tone']) => void
}

export function AiConfigPanel({ onToast }: AiConfigPanelProps) {
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** /admin/ai-config answered 404/405 — the backend route is not deployed yet. */
  const [routePending, setRoutePending] = useState(false)
  /** Configuration waiting in this browser to be pushed to the backend. */
  const [localPending, setLocalPending] = useState<LocalAiConfig | null>(null)
  const [provider, setProvider] = useState<ProviderId>('gemini')
  const [model, setModel] = useState(providerSpec('gemini').defaultModel)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<AiTestResult | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const applyConfig = useCallback((next: AiConfig) => {
    const id = normalizeProvider(next.ai_provider)
    const spec = providerSpec(id)
    setConfig(next)
    setProvider(id)
    setModel(next.ai_model || spec.defaultModel)
    setBaseUrl(next.ai_base_url || spec.defaultBaseUrl)
    setApiKey('')
    setFormError(null)
  }, [])

  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setLoadError(null)
    try {
      const next = await fetchAiConfig()
      if (seq !== requestSeq.current) return
      applyConfig(next)
      const cached = readLocalAiConfig()
      if (cached && sameAsServer(next, cached)) {
        // Already synced by an earlier push — drop the local copy.
        clearLocalAiConfig()
        setLocalPending(null)
      } else {
        setLocalPending(cached)
      }
      setRoutePending(false)
    } catch (error) {
      if (seq !== requestSeq.current) return
      if (isRouteMissing(error)) {
        // Graceful degradation: read the local copy instead of failing the panel.
        const cached = readLocalAiConfig()
        setRoutePending(true)
        setLocalPending(cached)
        setLoadError(null)
        if (cached) {
          applyConfig({
            ai_provider: cached.ai_provider,
            ai_model: cached.ai_model,
            ai_base_url: cached.ai_base_url,
            has_api_key: Boolean(cached.ai_api_key),
            masked_key: null,
          })
          setApiKey(cached.ai_api_key)
        }
        return
      }
      setLoadError(apiErrorMessage(error))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [applyConfig])

  useEffect(() => {
    // Yield first so the fetch (and its setState calls) start outside the
    // synchronous effect body — mirrors the boot load in App.tsx.
    void (async () => {
      await Promise.resolve()
      await load()
    })()
  }, [load])

  const spec = providerSpec(provider)
  const showBaseUrl = spec.withBaseUrl
  const hasKey = config?.has_api_key ?? false

  const selectProvider = (id: ProviderId) => {
    if (id === provider) return
    const next = providerSpec(id)
    setProvider(id)
    setModel(next.defaultModel)
    setBaseUrl(next.defaultBaseUrl)
    setApiKey('')
    setFormError(null)
    setTestResult(null)
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const sanitizedModel = sanitizeAiInput(model)
    if (!sanitizedModel) {
      setFormError('Enter a model name before pushing the configuration.')
      return
    }
    const sanitizedBaseUrl = sanitizeAiInput(baseUrl)
    if (showBaseUrl && spec.id === 'custom' && !sanitizedBaseUrl) {
      setFormError('A base URL is required for a custom OpenAI-compatible endpoint.')
      return
    }

    setSaving(true)
    setFormError(null)
    const sanitizedApiKey = sanitizeAiInput(apiKey)
    const update: AiConfigUpdate = {
      ai_provider: provider,
      ai_model: sanitizedModel,
      ai_api_key: sanitizedApiKey,
      ai_base_url: showBaseUrl ? sanitizedBaseUrl : '',
    }
    try {
      const next = await saveAiConfig(update)
      clearLocalAiConfig()
      setLocalPending(null)
      setRoutePending(false)
      applyConfig(next)
      onToast('AI Engine updated across CampusMart mobile app & backend', 'success')
    } catch (error) {
      if (isRouteMissing(error)) {
        // Backend route not deployed yet — queue locally and say so plainly.
        persistLocalAiConfig(update)
        setLocalPending(readLocalAiConfig())
        setRoutePending(true)
        setApiKey('')
        setConfig({
          ai_provider: update.ai_provider,
          ai_model: update.ai_model,
          ai_base_url: update.ai_base_url ?? '',
          has_api_key: Boolean(update.ai_api_key),
          masked_key: null,
        })
        setFormError(null)
        onToast(
          'Saved locally — waiting for Render backend deployment to finish syncing /admin/ai-config',
          'warning',
        )
      } else {
        setFormError(apiErrorMessage(error))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    const sanitizedModel = sanitizeAiInput(model)
    if (!sanitizedModel) {
      setFormError('Enter a model name before testing the AI connection.')
      return
    }
    const sanitizedBaseUrl = sanitizeAiInput(baseUrl)
    if (showBaseUrl && spec.id === 'custom' && !sanitizedBaseUrl) {
      setFormError('A base URL is required for a custom OpenAI-compatible endpoint.')
      return
    }

    setTesting(true)
    setFormError(null)
    setTestResult(null)

    const sanitizedApiKey = sanitizeAiInput(apiKey)
    const update: AiConfigUpdate = {
      ai_provider: provider,
      ai_model: sanitizedModel,
      ai_api_key: sanitizedApiKey,
      ai_base_url: showBaseUrl ? sanitizedBaseUrl : '',
    }

    try {
      // First save configuration so the backend has the sanitized key and model
      try {
        const next = await saveAiConfig(update)
        clearLocalAiConfig()
        setLocalPending(null)
        setRoutePending(false)
        applyConfig(next)
      } catch (saveError) {
        if (isRouteMissing(saveError)) {
          persistLocalAiConfig(update)
          setLocalPending(readLocalAiConfig())
          setRoutePending(true)
        }
      }

      // Execute live diagnostic against /ai/chat
      const result = await testAiConnection()
      setTestResult(result)
      if (result.ok) {
        onToast(`Live AI engine verified & connected (${result.latencyMs} ms)`, 'success')
      } else {
        onToast(`AI connection test failed: ${result.error ?? 'Unknown error'}`, 'critical')
      }
    } catch (err) {
      const errorMsg = apiErrorMessage(err)
      setTestResult({
        ok: false,
        latencyMs: 0,
        provider,
        model: sanitizedModel,
        error: errorMsg,
      })
      onToast(`AI connection test failed: ${errorMsg}`, 'critical')
    } finally {
      setTesting(false)
    }
  }

  const syncPending = Boolean(routePending || localPending)

  if (loading && !config) {
    return (
      <Panel
        title="Master AI Vision & LLM Engine Configuration"
        caption="Reading the live provider, model and API key state from the CampusMart backend."
      >
        <div className="grid min-h-[220px] place-items-center px-5 py-8 text-center">
          <div>
            <span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-line border-t-brand" />
            <p className="mt-3.5 text-[13.5px] font-medium text-ink">Loading AI engine config…</p>
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      title="Master AI Vision & LLM Engine Configuration"
      caption="Choose the provider, model and key that power listing moderation, price prediction and fraud scoring across the CampusMart mobile app and backend."
      action={
        <Badge tone={syncPending ? 'warning' : hasKey ? 'brand' : 'neutral'} withDot>
          {syncPending
            ? 'Pending backend sync'
            : hasKey
              ? config?.masked_key || 'API key stored'
              : 'Heuristic fallback'}
        </Badge>
      }
    >
      <form onSubmit={handleSave} className="space-y-5 px-5 py-5">
        {syncPending && (
          <div
            role="status"
            className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 sm:flex-row sm:items-center"
          >
            <span className="shrink-0 text-warning">
              <AlertIcon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] leading-relaxed font-medium text-warning">
                {localPending
                  ? 'Saved locally — waiting for Render backend deployment to finish syncing /admin/ai-config'
                  : '/admin/ai-config is not deployed on the backend yet — there is nothing to read from the server.'}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-warning/85">
                {localPending
                  ? `Queued from this browser at ${formatSavedAt(localPending.saved_at)} · your saved values are shown below and are safe.`
                  : 'Saving keeps the configuration in this browser and pushes it as soon as the route goes live.'}
              </p>
            </div>
            <Button
              className="shrink-0 justify-center"
              disabled={saving || loading}
              onClick={() => void load()}
            >
              <RefreshIcon size={15} />
              Retry sync
            </Button>
          </div>
        )}
        {loadError && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 sm:flex-row sm:items-center"
          >
            <span className="shrink-0 text-warning">
              <AlertIcon size={16} />
            </span>
            <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-warning">{loadError}</p>
            <Button
              className="shrink-0 justify-center"
              disabled={saving}
              onClick={() => void load()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Provider */}
        <div>
          <p className="text-[10.5px] font-semibold tracking-[0.09em] text-ink-faint uppercase">
            AI provider
          </p>
          <div
            role="group"
            aria-label="AI provider"
            className="mt-2 flex flex-wrap gap-2 sm:gap-2.5"
          >
            {PROVIDERS.map((item) => {
              const active = item.id === provider
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectProvider(item.id)}
                  className={`h-9 rounded-lg border px-3.5 text-[13px] whitespace-nowrap transition-colors duration-150 ${
                    active
                      ? 'border-brand bg-brand-soft font-medium text-brand-strong'
                      : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[12.5px] text-ink-muted">{spec.hint}</p>
        </div>

        {/* Model */}
        <div>
          <label
            htmlFor="ai-model"
            className="block text-[10.5px] font-semibold tracking-[0.09em] text-ink-faint uppercase"
          >
            Model name
          </label>
          {spec.models.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {spec.models.map((preset) => {
                const active = preset === model.trim()
                const isRecommended = preset === 'gemini-2.5-flash'
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setModel(preset)}
                    className={`rounded-full border px-3 py-1 font-mono text-[12px] transition-colors duration-150 ${
                      active
                        ? 'border-brand bg-brand-soft font-medium text-brand-strong'
                        : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    {preset}
                    {isRecommended && (
                      <span className="ml-1 font-sans font-semibold text-[10.5px] text-brand">
                        · Recommended
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          <input
            id="ai-model"
            type="text"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="e.g. gemini-2.5-flash"
            autoComplete="off"
            spellCheck={false}
            className="mt-2 h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[13.5px] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-brand"
          />
        </div>

        {/* API key */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="ai-api-key"
              className="block text-[10.5px] font-semibold tracking-[0.09em] text-ink-faint uppercase"
            >
              API key
            </label>
            <Badge tone={hasKey && !syncPending ? 'success' : 'warning'}>
              {syncPending
                ? '○ Pending backend sync'
                : hasKey
                  ? '● API Key Active'
                  : '○ Using Fallback Heuristics'}
            </Badge>
          </div>
          <input
            id="ai-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              syncPending
                ? '•••••••••••• — local copy held until the backend syncs'
                : hasKey
                  ? '•••••••••••• — leave blank to keep the current key'
                  : 'Paste your provider API key'
            }
            autoComplete="off"
            spellCheck={false}
            className="mt-2 h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[13.5px] text-ink transition-colors placeholder:font-sans placeholder:text-ink-faint hover:border-line-strong focus:border-brand"
          />
          <p className="mt-1.5 text-[12px] text-ink-muted">
            {syncPending
              ? 'Held in this browser until the backend route is deployed — Save & Push sends it the moment /admin/ai-config answers.'
              : hasKey
                ? `Stored server-side · ${config?.masked_key ?? 'masked key'} · submitting an empty field keeps it unchanged.`
                : 'No key stored — agents fall back to rule-based heuristics until a key is saved.'}
          </p>
        </div>

        {/* Base URL */}
        {showBaseUrl && (
          <div>
            <label
              htmlFor="ai-base-url"
              className="block text-[10.5px] font-semibold tracking-[0.09em] text-ink-faint uppercase"
            >
              Base URL {spec.id === 'custom' ? '' : '(optional)'}
            </label>
            <input
              id="ai-base-url"
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://your-gateway.example.com/v1"
              autoComplete="off"
              spellCheck={false}
              className="mt-2 h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-[13.5px] text-ink transition-colors placeholder:font-sans placeholder:text-ink-faint hover:border-line-strong focus:border-brand"
            />
            <p className="mt-1.5 text-[12px] text-ink-muted">
              {spec.id === 'openrouter'
                ? 'Pre-filled with the OpenRouter gateway — override it only when routing through your own proxy.'
                : 'Any OpenAI-compatible endpoint. Required for the custom provider.'}
            </p>
          </div>
        )}

        {/* Live Diagnostic Card */}
        {testResult && (
          <div
            role="status"
            className={`rounded-xl border p-4 transition-all ${
              testResult.ok
                ? 'border-success/30 bg-success-soft/30'
                : 'border-critical/30 bg-critical-soft/30'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    testResult.ok ? 'bg-success animate-pulse' : 'bg-critical'
                  }`}
                />
                <p
                  className={`text-[13px] font-semibold ${
                    testResult.ok ? 'text-success' : 'text-critical'
                  }`}
                >
                  {testResult.ok
                    ? '● Live AI Connected & Responding'
                    : '○ Live AI Connection Failed'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular font-mono text-[12px] font-medium text-ink-muted">
                  {testResult.latencyMs} ms round-trip
                </span>
                <Badge tone={testResult.ok ? 'success' : 'critical'}>
                  {testResult.ok ? 'Ready for 4-Photo Scanning' : 'Diagnostic Error'}
                </Badge>
              </div>
            </div>

            {testResult.ok ? (
              <div className="mt-3 rounded-lg border border-line bg-surface p-3.5">
                <p className="text-[10.5px] font-semibold tracking-wider text-ink-faint uppercase">
                  Live Response &amp; Valuation Preview
                </p>
                <p className="mt-1 font-mono text-[13px] leading-relaxed text-ink">
                  {testResult.sampleOutput}
                </p>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-critical/20 bg-surface p-3.5">
                <p className="text-[10.5px] font-semibold tracking-wider text-critical uppercase">
                  Error Details
                </p>
                <p className="mt-1 font-mono text-[12.5px] leading-relaxed text-critical">
                  {testResult.error || 'The AI service returned an unhandled error.'}
                </p>
                <p className="mt-2 text-[12px] text-ink-muted">
                  Ensure the API key has no trailing/leading whitespace or invalid permissions, and that the model ID is active.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Save & Test */}
        <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p
            role={formError ? 'alert' : undefined}
            className={`text-[12.5px] leading-relaxed ${
              formError ? 'font-medium text-critical' : 'text-ink-muted'
            }`}
          >
            {formError ??
              (syncPending
                ? 'While /admin/ai-config is still deploying, this browser keeps the only copy of the key and pushes it as soon as the route goes live.'
                : 'The key is stored on the backend only — this dashboard does not keep a copy in the browser.')}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              className="shrink-0 justify-center"
              disabled={saving || testing || (loading && !config)}
              onClick={() => void handleTestConnection()}
            >
              <RefreshIcon size={15} className={testing ? 'animate-spin' : undefined} />
              {testing ? 'Testing Engine…' : 'Test Live AI Connection'}
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="shrink-0 justify-center"
              disabled={saving || testing || (loading && !config)}
            >
              {saving
                ? 'Pushing…'
                : syncPending
                  ? 'Save & Queue for Sync'
                  : 'Save & Push to Live App'}
            </Button>
          </div>
        </div>
      </form>
    </Panel>
  )
}

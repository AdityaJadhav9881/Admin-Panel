import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  apiErrorMessage,
  clearLocalAiConfig,
  fetchAiConfig,
  isRouteMissing,
  persistLocalAiConfig,
  readLocalAiConfig,
  QUICK_SEED_POOL_TEMPLATE,
  sanitizeAiInput,
  saveAiConfig,
  testAiKeySlot,
  testAiPool,
  type AiConfig,
  type AiConfigUpdate,
  type AiKeyProvider,
  type AiKeyRole,
  type AiKeySlot,
  type AiPoolTestReport,
  type AiRoutingMode,
  type AiTestResult,
  type LocalAiConfig,
} from '../../api/client'
import {
  AlertIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  RefreshIcon,
  ShieldIcon,
  TrashIcon,
  ZapIcon,
} from '../icons'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import type { ToastMessage } from '../ui/Toast'

interface ProviderCatalogItem {
  id: AiKeyProvider
  label: string
  hint: string
  defaultModel: string
  models: string[]
  defaultBaseUrl: string
  withBaseUrl: boolean
}

const PROVIDER_CATALOG: ProviderCatalogItem[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    hint: 'Google AI Studio — Multimodal 4-photo vision + fair resale pricing.',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    defaultBaseUrl: '',
    withBaseUrl: false,
  },
  {
    id: 'groq',
    label: 'Groq Cloud',
    hint: 'Groq LPU — Ultra-low latency open-model inference for instant chat & search.',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    models: ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-versatile', 'llama3-70b-8192'],
    defaultBaseUrl: '',
    withBaseUrl: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    hint: 'Unified model aggregator with auto-failover and free community quotas.',
    defaultModel: 'google/gemini-2.0-flash-exp:free',
    models: [
      'google/gemini-2.0-flash-exp:free',
      'google/gemini-2.0-flash-001',
      'openai/gpt-4o-mini',
      'meta-llama/llama-3.3-70b-instruct:free',
    ],
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    withBaseUrl: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'OpenAI Platform — GPT-4o family for reasoning, extraction & safety moderation.',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o'],
    defaultBaseUrl: '',
    withBaseUrl: false,
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    hint: 'Fast European frontier models for chat, search & listing tagging.',
    defaultModel: 'mistral-small-latest',
    models: ['mistral-small-latest', 'codestral-latest', 'mistral-large-latest'],
    defaultBaseUrl: '',
    withBaseUrl: false,
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    hint: 'Wafer-scale high-throughput inference engine for peak student traffic.',
    defaultModel: 'cerebras/llama3.3-70b',
    models: ['cerebras/llama3.3-70b', 'llama3.1-8b', 'llama3.1-70b'],
    defaultBaseUrl: '',
    withBaseUrl: false,
  },
  {
    id: 'custom',
    label: 'Custom / Local',
    hint: 'Self-hosted vLLM, Ollama, LM Studio or proxy speaking OpenAI API.',
    defaultModel: 'local-model',
    models: [],
    defaultBaseUrl: '',
    withBaseUrl: true,
  },
]

function getProviderItem(provider: AiKeyProvider): ProviderCatalogItem {
  return PROVIDER_CATALOG.find((p) => p.id === provider) ?? PROVIDER_CATALOG[0]
}

const ROLE_OPTIONS: Array<{ value: AiKeyRole; label: string; tag: string }> = [
  {
    value: 'all',
    label: 'All Tasks (Vision + Price + Chat)',
    tag: 'Universal',
  },
  {
    value: 'vision_pricing',
    label: '4-Photo Vision & Fair Resale Pricing',
    tag: 'Vision & Price',
  },
  {
    value: 'fast_chat_search',
    label: 'Fast Student Chat & Semantic Search',
    tag: 'Chat & Search',
  },
]

const ROUTING_OPTIONS: Array<{
  value: AiRoutingMode
  label: string
  subtitle: string
}> = [
  {
    value: 'smart_failover',
    label: '⚡ Smart Speed + Auto-Failover (Recommended)',
    subtitle: 'Dynamically routes to the fastest healthy key; instant fallback on 429 or timeout.',
  },
  {
    value: 'round_robin',
    label: '🔄 Round-Robin Load Balance',
    subtitle: 'Distributes concurrent requests evenly across all enabled keys to prevent rate limits.',
  },
  {
    value: 'role_based',
    label: '🎯 Role-Based (Vision -> Gemini, Chat/Search -> Groq)',
    subtitle: 'Assigns 4-photo scanning to vision-optimized keys and search/chat to ultra-fast inference.',
  },
]

function formatSavedAt(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'earlier in this session'
  return parsed.toLocaleString()
}

interface AiConfigPanelProps {
  onToast: (text: string, tone: ToastMessage['tone']) => void
}

export function AiConfigPanel({ onToast }: AiConfigPanelProps) {
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [routePending, setRoutePending] = useState(false)
  const [localPending, setLocalPending] = useState<LocalAiConfig | null>(null)

  // Multi-key pool state
  const [pool, setPool] = useState<AiKeySlot[]>(() => QUICK_SEED_POOL_TEMPLATE)
  const [routingMode, setRoutingMode] = useState<AiRoutingMode>('smart_failover')
  const [showKeyMask, setShowKeyMask] = useState<Record<string, boolean>>({})

  // Diagnostic states
  const [testingSlotId, setTestingSlotId] = useState<string | null>(null)
  const [slotTestResults, setSlotTestResults] = useState<Record<string, AiTestResult>>({})
  const [testingPool, setTestingPool] = useState(false)
  const [poolReport, setPoolReport] = useState<AiPoolTestReport | null>(null)

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const activeSlotsCount = pool.filter((s) => s.enabled).length
  const totalSlotsCount = pool.length

  const applyConfig = useCallback((next: AiConfig) => {
    setConfig(next)
    setRoutingMode(next.routing_mode || 'smart_failover')

    if (next.api_keys_pool && next.api_keys_pool.length > 0) {
      setPool(next.api_keys_pool)
    } else {
      // Fallback: if server only had single key fields, seed with template and set primary
      const cached = readLocalAiConfig()
      if (cached?.api_keys_pool && cached.api_keys_pool.length > 0) {
        setPool(cached.api_keys_pool)
      } else {
        const seeded = QUICK_SEED_POOL_TEMPLATE.map((slot, idx) => {
          if (idx === 0 && next.ai_provider) {
            return {
              ...slot,
              provider: (next.ai_provider as AiKeyProvider) || slot.provider,
              model: next.ai_model || slot.model,
              base_url: next.ai_base_url || slot.base_url,
            }
          }
          return slot
        })
        setPool(seeded)
      }
    }
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
      if (cached?.api_keys_pool && cached.api_keys_pool.length > 0) {
        // Merge cached plain keys for slots so admin doesn't have to re-enter
        setPool((current) =>
          current.map((slot) => {
            const cachedSlot = cached.api_keys_pool?.find((c) => c.id === slot.id)
            if (cachedSlot && !slot.api_key && cachedSlot.api_key) {
              return { ...slot, api_key: cachedSlot.api_key }
            }
            return slot
          }),
        )
      }
      setRoutePending(false)
      setLocalPending(null)
    } catch (error) {
      if (seq !== requestSeq.current) return
      if (isRouteMissing(error)) {
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
            routing_mode: cached.routing_mode || 'smart_failover',
            api_keys_pool: cached.api_keys_pool || QUICK_SEED_POOL_TEMPLATE,
          })
        }
        return
      }
      setLoadError(apiErrorMessage(error))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [applyConfig])

  useEffect(() => {
    void (async () => {
      await Promise.resolve()
      await load()
    })()
  }, [load])

  // Slot mutations
  const handleAddSlot = () => {
    if (pool.length >= 16) {
      onToast('Maximum pool size of 16 API key slots reached.', 'warning')
      return
    }
    const newId = `key-${Date.now().toString().slice(-6)}`
    const newSlot: AiKeySlot = {
      id: newId,
      label: `API Key Slot #${pool.length + 1}`,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      api_key: '',
      role: 'all',
      enabled: true,
      status: 'untested',
    }
    setPool((prev) => [...prev, newSlot])
    onToast(`Added Slot #${pool.length + 1} to pool`, 'success')
  }

  const handleRemoveSlot = (id: string) => {
    if (pool.length <= 1) {
      onToast('The pool requires at least 1 configured key slot.', 'warning')
      return
    }
    setPool((prev) => prev.filter((s) => s.id !== id))
    onToast('Removed slot from AI pool', 'neutral')
  }

  const handleSeedTemplate = () => {
    // Preserve existing keys for matching slots
    const seeded = QUICK_SEED_POOL_TEMPLATE.map((templateSlot, idx) => {
      const existing = pool[idx]
      return {
        ...templateSlot,
        api_key: existing?.api_key || '',
      }
    })
    setPool(seeded)
    onToast('Hydra 6-Slot Template applied (Gemini x3, Groq x2, OpenRouter x1)', 'success')
  }

  const updateSlot = (id: string, patch: Partial<AiKeySlot>) => {
    setPool((prev) =>
      prev.map((slot) => {
        if (slot.id !== id) return slot
        return { ...slot, ...patch }
      }),
    )
  }

  const toggleSlotEnabled = (id: string) => {
    setPool((prev) =>
      prev.map((slot) => (slot.id === id ? { ...slot, enabled: !slot.enabled } : slot)),
    )
  }

  const toggleMask = (id: string) => {
    setShowKeyMask((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // Single Slot Test
  const handleTestSlot = async (slot: AiKeySlot) => {
    if (!slot.api_key.trim()) {
      onToast(`Enter an API key for "${slot.label}" before testing.`, 'warning')
      return
    }
    setTestingSlotId(slot.id)
    try {
      const result = await testAiKeySlot(slot)
      setSlotTestResults((prev) => ({ ...prev, [slot.id]: result }))

      if (result.ok) {
        updateSlot(slot.id, {
          status: 'active',
          latency_ms: result.latencyMs,
          calls_count: (slot.calls_count || 0) + 1,
        })
        onToast(`● ${slot.label}: Verified healthy (${result.latencyMs} ms)`, 'success')
      } else {
        const isRateLimit = result.error?.toLowerCase().includes('quota') || result.error?.includes('429')
        updateSlot(slot.id, {
          status: isRateLimit ? 'cooldown' : 'exhausted',
          latency_ms: result.latencyMs,
        })
        onToast(`✕ ${slot.label} failed: ${result.error || 'Connection error'}`, 'critical')
      }
    } catch (err) {
      const msg = apiErrorMessage(err)
      setSlotTestResults((prev) => ({
        ...prev,
        [slot.id]: {
          ok: false,
          latencyMs: 0,
          provider: slot.provider,
          model: slot.model,
          error: msg,
        },
      }))
      updateSlot(slot.id, { status: 'exhausted' })
      onToast(`Test failed for ${slot.label}: ${msg}`, 'critical')
    } finally {
      setTestingSlotId(null)
    }
  }

  // Full Pool Failover Test
  const handleTestFullPool = async () => {
    if (activeSlotsCount === 0) {
      onToast('Enable at least 1 key slot before running pool failover test.', 'warning')
      return
    }
    setTestingPool(true)
    setFormError(null)
    try {
      const report = await testAiPool(pool)
      setPoolReport(report)

      // Update pool slot statuses and latencies
      setPool((prev) =>
        prev.map((slot) => {
          const step = report.failoverChain.find((s) => s.slotId === slot.id)
          if (step) {
            return {
              ...slot,
              status: step.ok ? 'active' : 'exhausted',
              latency_ms: step.latencyMs ?? slot.latency_ms,
            }
          }
          return slot
        }),
      )

      if (report.healthyCount > 0) {
        onToast(
          `Pool test passed: ${report.healthyCount}/${report.activeCount} healthy keys (Fastest: ${report.fastestLatencyMs} ms)`,
          'success',
        )
      } else {
        onToast(
          'Pool test completed with warnings: No healthy keys responded. Check API keys and quotas.',
          'critical',
        )
      }
    } catch (err) {
      const msg = apiErrorMessage(err)
      onToast(`Pool failover diagnostic error: ${msg}`, 'critical')
    } finally {
      setTestingPool(false)
    }
  }

  // Save Pool
  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (activeSlotsCount === 0) {
      setFormError('At least 1 API key slot must be enabled.')
      return
    }

    setSaving(true)
    setFormError(null)

    // Fastest healthy or top active slot
    const enabledSlots = pool.filter((s) => s.enabled)
    const primaryCandidate =
      enabledSlots.find((s) => s.status === 'active' && s.api_key.trim()) ||
      enabledSlots.find((s) => s.api_key.trim()) ||
      enabledSlots[0]

    const update: AiConfigUpdate = {
      ai_provider: primaryCandidate.provider,
      ai_model: primaryCandidate.model,
      ai_api_key: primaryCandidate.api_key,
      ai_base_url: primaryCandidate.base_url || '',
      routing_mode: routingMode,
      api_keys_pool: pool,
    }

    try {
      const next = await saveAiConfig(update)
      clearLocalAiConfig()
      setLocalPending(null)
      setRoutePending(false)
      applyConfig(next)
      onToast('AI Hydra Pool synchronized across CampusMart mobile app & backend', 'success')
    } catch (error) {
      if (isRouteMissing(error)) {
        persistLocalAiConfig(update)
        setLocalPending(readLocalAiConfig())
        setRoutePending(true)
        setConfig({
          ai_provider: update.ai_provider,
          ai_model: update.ai_model,
          ai_base_url: update.ai_base_url ?? '',
          has_api_key: Boolean(update.ai_api_key),
          masked_key: null,
          routing_mode: update.routing_mode || 'smart_failover',
          api_keys_pool: pool,
        })
        onToast(
          'Key Pool saved locally — waiting for Render backend deployment to finish syncing /admin/ai-config',
          'warning',
        )
      } else {
        setFormError(apiErrorMessage(error))
      }
    } finally {
      setSaving(false)
    }
  }

  const syncPending = Boolean(routePending || localPending)

  if (loading && !config) {
    return (
      <Panel
        title="Multi-Key AI Hydra Load Balancer & Failover Pool"
        caption="Loading API key slots, routing mode, and latency health from the CampusMart backend."
      >
        <div className="grid min-h-[220px] place-items-center px-5 py-8 text-center">
          <div>
            <span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-line border-t-brand" />
            <p className="mt-3.5 text-[13.5px] font-medium text-ink">
              Loading AI Load Balancer pool…
            </p>
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      title="Multi-Key AI Hydra Load Balancer & Failover Pool"
      caption="Manage 5 to 10+ concurrent API keys across Google Gemini, Groq, OpenRouter, and OpenAI. Features automatic failover, smart routing, and 60-second rate-limit circuit breaking."
      action={
        <div className="flex items-center gap-2">
          <Badge tone={activeSlotsCount > 0 ? 'success' : 'warning'} withDot>
            {activeSlotsCount} / {totalSlotsCount} Keys Active
          </Badge>
          <Badge tone={syncPending ? 'warning' : 'brand'}>
            {syncPending ? 'Pending Sync' : 'Production Live'}
          </Badge>
        </div>
      }
    >
      <form onSubmit={handleSave} className="space-y-6 px-5 py-5">
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
                  ? 'Key pool saved locally in this browser — syncing automatically once the Render backend deploy completes.'
                  : '/admin/ai-config is deploying on Render — local changes are safeguarded.'}
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-warning/85">
                Queued at {formatSavedAt(localPending?.saved_at ?? '')} ·
                Mobile 4-photo scanning continues using cached keys.
              </p>
            </div>
            <Button
              className="shrink-0 justify-center"
              disabled={saving || loading}
              onClick={() => void load()}
            >
              <RefreshIcon size={15} />
              Retry Sync
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

        {/* TOP POOL SUMMARY BAR */}
        <div className="rounded-xl border border-line bg-surface-2/60 p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Active Counter & Circuit Breaker */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[14px] font-semibold text-ink">
                  AI Pool Status: {activeSlotsCount} of {totalSlotsCount} Keys Active
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-2.5 py-0.5 text-[11px] font-semibold text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  Load Balancer Engaged
                </span>
              </div>
              <div className="flex items-center gap-2 text-[12px] text-ink-muted">
                <span className="text-brand">
                  <ShieldIcon size={14} />
                </span>
                <span>
                  <strong>60s Automatic Circuit Breaker:</strong> Keys receiving HTTP 429
                  rate-limits automatically cool down and swap to secondary slots without failing student requests.
                </span>
              </div>
            </div>

            {/* Quick Template Button */}
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="text-[12.5px]"
                onClick={handleSeedTemplate}
                title="Populate pool with 3x Gemini, 2x Groq, and 1x OpenRouter slots"
              >
                <ZapIcon size={14} className="text-brand" />
                Quick Seed 6-Slot Template
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-[12.5px]"
                onClick={handleAddSlot}
              >
                <PlusIcon size={14} />
                + Add API Key Slot
              </Button>
            </div>
          </div>

          {/* ROUTING MODE SELECTOR */}
          <div className="mt-4 border-t border-line/70 pt-3.5">
            <p className="text-[10.5px] font-semibold tracking-wider text-ink-faint uppercase">
              Routing &amp; Failover Strategy
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2.5 md:grid-cols-3">
              {ROUTING_OPTIONS.map((opt) => {
                const active = routingMode === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRoutingMode(opt.value)}
                    className={`flex flex-col rounded-lg border p-3 text-left transition-all ${
                      active
                        ? 'border-brand bg-brand-soft/50 shadow-sm ring-1 ring-brand'
                        : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2'
                    }`}
                  >
                    <span
                      className={`text-[12.5px] font-semibold ${
                        active ? 'text-brand-strong' : 'text-ink'
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                      {opt.subtitle}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* FULL POOL FAILOVER DIAGNOSTIC REPORT (if run) */}
        {poolReport && (
          <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    poolReport.healthyCount > 0 ? 'bg-success animate-pulse' : 'bg-critical'
                  }`}
                />
                <h4 className="text-[13.5px] font-semibold text-ink">
                  Full Pool Failover Diagnostic Results
                </h4>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11.5px] text-ink-muted">
                <span>Healthy: {poolReport.healthyCount}/{poolReport.activeCount}</span>
                {poolReport.fastestLatencyMs !== null && (
                  <span className="rounded bg-brand-soft px-2 py-0.5 font-semibold text-brand-strong">
                    Fastest: {poolReport.fastestLatencyMs} ms
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <p className="text-[11.5px] text-ink-muted">
                Failover Chain Execution Order (Primary ➔ Secondary ➔ Fallback):
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {poolReport.failoverChain.map((step, idx) => (
                  <div
                    key={step.slotId}
                    className={`flex items-center justify-between rounded-lg border p-2.5 text-[12px] ${
                      step.ok
                        ? 'border-success/30 bg-success-soft/20 text-ink'
                        : 'border-critical/30 bg-critical-soft/20 text-critical'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-medium truncate">
                        <span className="font-mono text-[10.5px] text-ink-faint">#{idx + 1}</span>
                        <span className="truncate">{step.label}</span>
                      </div>
                      <div className="font-mono text-[10.5px] text-ink-muted truncate">
                        {step.provider} · {step.model}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {step.ok ? (
                        <span className="font-mono text-[11px] font-semibold text-success">
                          {step.latencyMs} ms
                        </span>
                      ) : (
                        <span className="text-[10.5px] font-medium text-critical">Failed</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* API KEY POOL SLOTS MANAGER */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[14px] font-semibold text-ink">
                Hydra API Key Slots ({pool.length} Configured)
              </h3>
              <p className="text-[12px] text-ink-muted">
                Configure 5 to 10+ keys with specific models and task roles. Drag priority order by
                slot index.
              </p>
            </div>
          </div>

          <div className="space-y-3.5">
            {pool.map((slot, index) => {
              const spec = getProviderItem(slot.provider)
              const testResult = slotTestResults[slot.id]
              const isTestingThis = testingSlotId === slot.id
              const isMasked = !showKeyMask[slot.id]

              return (
                <div
                  key={slot.id}
                  className={`rounded-xl border transition-all duration-150 ${
                    slot.enabled
                      ? 'border-line bg-surface shadow-sm hover:border-line-strong'
                      : 'border-line/60 bg-subtle/50 opacity-70'
                  }`}
                >
                  {/* Slot Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-subtle font-mono text-[11px] font-bold text-ink-faint">
                        #{index + 1}
                      </span>
                      <input
                        type="text"
                        value={slot.label}
                        onChange={(e) => updateSlot(slot.id, { label: e.target.value })}
                        className="min-w-0 flex-1 border-b border-transparent bg-transparent font-medium text-[13.5px] text-ink hover:border-line focus:border-brand focus:outline-none"
                        placeholder="Key Slot Label"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Provider Badge */}
                      <span className="rounded-md bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                        {spec.label}
                      </span>

                      {/* Status Badge */}
                      {slot.status === 'active' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                          Active
                        </span>
                      )}
                      {slot.status === 'cooldown' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
                          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                          Cooldown (60s)
                        </span>
                      )}
                      {slot.status === 'exhausted' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-critical-soft px-2 py-0.5 text-[11px] font-semibold text-critical">
                          <span className="h-1.5 w-1.5 rounded-full bg-critical" />
                          Exhausted / Error
                        </span>
                      )}
                      {slot.status === 'untested' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-subtle px-2 py-0.5 text-[11px] text-ink-faint">
                          ○ Untested
                        </span>
                      )}

                      {/* Latency Pill */}
                      {typeof slot.latency_ms === 'number' && (
                        <span className="font-mono text-[11px] font-medium text-brand">
                          ⚡ {slot.latency_ms} ms
                        </span>
                      )}

                      {/* Enable/Disable Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleSlotEnabled(slot.id)}
                        className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                          slot.enabled
                            ? 'bg-brand-soft text-brand-strong hover:bg-brand/20'
                            : 'bg-subtle text-ink-faint hover:text-ink'
                        }`}
                      >
                        {slot.enabled ? 'Enabled' : 'Disabled'}
                      </button>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(slot.id)}
                        className="rounded-md p-1 text-ink-faint hover:bg-critical-soft hover:text-critical"
                        title="Remove Slot"
                        aria-label="Remove Slot"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Slot Card Body */}
                  <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-12">
                    {/* Provider Select */}
                    <div className="lg:col-span-3">
                      <label className="block text-[10.5px] font-semibold tracking-wider text-ink-faint uppercase">
                        AI Provider
                      </label>
                      <select
                        value={slot.provider}
                        onChange={(e) => {
                          const nextProvider = e.target.value as AiKeyProvider
                          const nextSpec = getProviderItem(nextProvider)
                          updateSlot(slot.id, {
                            provider: nextProvider,
                            model: nextSpec.defaultModel,
                            base_url: nextSpec.defaultBaseUrl,
                          })
                        }}
                        className="mt-1.5 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink transition-colors hover:border-line-strong focus:border-brand focus:outline-none"
                      >
                        {PROVIDER_CATALOG.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Task Role Select */}
                    <div className="lg:col-span-3">
                      <label className="block text-[10.5px] font-semibold tracking-wider text-ink-faint uppercase">
                        Assigned Task Role
                      </label>
                      <select
                        value={slot.role}
                        onChange={(e) =>
                          updateSlot(slot.id, { role: e.target.value as AiKeyRole })
                        }
                        className="mt-1.5 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink transition-colors hover:border-line-strong focus:border-brand focus:outline-none"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Model Name & Presets */}
                    <div className="lg:col-span-6">
                      <label className="block text-[10.5px] font-semibold tracking-wider text-ink-faint uppercase">
                        Model ID
                      </label>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {spec.models.map((preset) => {
                          const active = preset === slot.model.trim()
                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => updateSlot(slot.id, { model: preset })}
                              className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
                                active
                                  ? 'border-brand bg-brand-soft font-semibold text-brand-strong'
                                  : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
                              }`}
                            >
                              {preset}
                            </button>
                          )
                        })}
                      </div>
                      <input
                        type="text"
                        value={slot.model}
                        onChange={(e) => updateSlot(slot.id, { model: e.target.value })}
                        placeholder="e.g. gemini-2.5-flash"
                        className="mt-1.5 h-8 w-full rounded-md border border-line bg-surface px-2.5 font-mono text-[12.5px] text-ink hover:border-line-strong focus:border-brand focus:outline-none"
                      />
                    </div>

                    {/* API Key Input */}
                    <div className="lg:col-span-8">
                      <div className="flex items-center justify-between">
                        <label className="block text-[10.5px] font-semibold tracking-wider text-ink-faint uppercase">
                          API Key
                        </label>
                        <span className="text-[11px] text-ink-faint">
                          {slot.api_key.trim() ? (
                            <span className="text-success font-medium">✓ Key Present</span>
                          ) : (
                            <span className="text-warning">⚠ Key Required</span>
                          )}
                        </span>
                      </div>
                      <div className="relative mt-1.5">
                        <input
                          type={isMasked ? 'password' : 'text'}
                          value={slot.api_key}
                          onChange={(e) =>
                            updateSlot(slot.id, {
                              api_key: sanitizeAiInput(e.target.value),
                            })
                          }
                          placeholder="Paste API Key (trimmed automatically)"
                          autoComplete="off"
                          spellCheck={false}
                          className="h-9 w-full rounded-lg border border-line bg-surface pr-10 pl-3 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-ink-faint hover:border-line-strong focus:border-brand focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => toggleMask(slot.id)}
                          className="absolute inset-y-0 right-0 flex items-center px-2.5 text-ink-faint hover:text-ink"
                          title={isMasked ? 'Show Key' : 'Hide Key'}
                        >
                          {isMasked ? <EyeIcon size={15} /> : <EyeOffIcon size={15} />}
                        </button>
                      </div>
                    </div>

                    {/* Test Key Button */}
                    <div className="flex items-end lg:col-span-4">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 w-full justify-center text-[12.5px]"
                        disabled={isTestingThis || !slot.api_key.trim()}
                        onClick={() => void handleTestSlot(slot)}
                      >
                        <RefreshIcon
                          size={14}
                          className={isTestingThis ? 'animate-spin' : undefined}
                        />
                        {isTestingThis ? 'Testing Key…' : 'Test Key'}
                      </Button>
                    </div>

                    {/* Base URL (if custom or openrouter) */}
                    {(spec.withBaseUrl || slot.base_url) && (
                      <div className="lg:col-span-12">
                        <label className="block text-[10.5px] font-semibold tracking-wider text-ink-faint uppercase">
                          Custom Gateway / Base URL
                        </label>
                        <input
                          type="url"
                          value={slot.base_url || ''}
                          onChange={(e) => updateSlot(slot.id, { base_url: e.target.value })}
                          placeholder={spec.defaultBaseUrl || 'https://api.your-proxy.com/v1'}
                          className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2.5 font-mono text-[12px] text-ink hover:border-line-strong focus:border-brand focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Inline Slot Diagnostic Result */}
                  {testResult && (
                    <div
                      className={`border-t px-4 py-2.5 text-[12px] ${
                        testResult.ok
                          ? 'border-success/20 bg-success-soft/20 text-ink'
                          : 'border-critical/20 bg-critical-soft/20 text-critical'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          {testResult.ok ? '✓ Connection Verified' : '✕ Diagnostic Error'}:
                        </span>
                        <span className="font-mono text-[11px] font-medium">
                          {testResult.latencyMs} ms
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[11.5px] leading-relaxed truncate">
                        {testResult.ok ? testResult.sampleOutput : testResult.error}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            {formError ? (
              <p role="alert" className="text-[12.5px] font-medium text-critical">
                {formError}
              </p>
            ) : (
              <p className="text-[12px] text-ink-muted">
                Fastest healthy key is automatically synced to primary{' '}
                <code className="font-mono text-ink">ai_api_key</code> for backward compatibility
                with mobile 4-photo scanning and server routes.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              className="shrink-0 justify-center"
              disabled={saving || testingPool || activeSlotsCount === 0}
              onClick={() => void handleTestFullPool()}
            >
              <RefreshIcon size={15} className={testingPool ? 'animate-spin' : undefined} />
              {testingPool ? 'Testing All Keys…' : 'Test Full Pool Failover'}
            </Button>

            <Button
              type="submit"
              variant="primary"
              className="shrink-0 justify-center"
              disabled={saving || testingPool || activeSlotsCount === 0}
            >
              <CheckIcon size={15} />
              {saving
                ? 'Pushing Pool…'
                : syncPending
                  ? 'Save & Queue Key Pool'
                  : 'Save & Push Key Pool to Live App & Website'}
            </Button>
          </div>
        </div>
      </form>
    </Panel>
  )
}

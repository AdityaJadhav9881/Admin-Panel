import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  apiErrorMessage,
  autoDetectProviderFromKey,
  fetchAiConfig,
  getProviderDisplayName,
  isRouteMissing,
  maskApiKey,
  readLocalAiConfig,
  sanitizeAiInput,
  saveAiConfig,
  testAiPool,
  testAutoDiscoverAiKey,
  ZERO_CONFIG_SEED_SLOTS,
  type AiConfig,
  type AiConfigUpdate,
  type AiKeyProvider,
  type AiKeyRole,
  type AiKeySlot,
  type AiPoolTestReport,
  type AiRoutingMode,
  type AutoDiscoverKeyResult,
  type LocalAiConfig,
} from '../../api/client'
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
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

function formatSavedAt(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'earlier in this session'
  return parsed.toLocaleString()
}

interface AiConfigPanelProps {
  onToast: (text: string, tone: ToastMessage['tone']) => void
}

const PROVIDER_BADGE_STYLES: Record<string, string> = {
  gemini: 'bg-brand-soft text-brand-strong border-brand/20',
  groq: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
  openrouter: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/25',
  openai: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
  mistral: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/25',
  cerebras: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/25',
  custom: 'bg-subtle text-ink-muted border-line',
}

export function AiConfigPanel({ onToast }: AiConfigPanelProps) {
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [routePending, setRoutePending] = useState(false)
  const [localPending, setLocalPending] = useState<LocalAiConfig | null>(null)

  // Multi-key pool state
  const [pool, setPool] = useState<AiKeySlot[]>(() => ZERO_CONFIG_SEED_SLOTS)
  const [routingMode] = useState<AiRoutingMode>('smart_failover')
  const [showKeyMask, setShowKeyMask] = useState<Record<string, boolean>>({})
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<string, boolean>>({})

  // Diagnostic states
  const [testingSlotId, setTestingSlotId] = useState<string | null>(null)
  const [slotTestResults, setSlotTestResults] = useState<Record<string, AutoDiscoverKeyResult>>({})
  const [testingPool, setTestingPool] = useState(false)
  const [poolReport, setPoolReport] = useState<AiPoolTestReport | null>(null)

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const activeSlotsCount = pool.filter((s) => s.enabled).length
  const totalSlotsCount = pool.length

  const applyConfig = useCallback((next: AiConfig) => {
    setConfig(next)

    if (next.api_keys_pool && next.api_keys_pool.length > 0) {
      setPool(next.api_keys_pool)
    } else {
      const cached = readLocalAiConfig()
      if (cached?.api_keys_pool && cached.api_keys_pool.length > 0) {
        setPool(cached.api_keys_pool)
      } else {
        const seeded = ZERO_CONFIG_SEED_SLOTS.map((slot, idx) => {
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
            masked_key: maskApiKey(cached.ai_api_key),
            routing_mode: cached.routing_mode || 'smart_failover',
            api_keys_pool: cached.api_keys_pool || ZERO_CONFIG_SEED_SLOTS,
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
    const newId = `key-slot-${Date.now().toString().slice(-6)}`
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
    onToast(`Added API Key Slot #${pool.length + 1}`, 'success')
  }

  const handleRemoveSlot = (id: string) => {
    if (pool.length <= 1) {
      onToast('The pool requires at least 1 API key slot.', 'warning')
      return
    }
    setPool((prev) => prev.filter((s) => s.id !== id))
    onToast('Removed key slot from pool', 'neutral')
  }

  const handleSeedCleanSlots = () => {
    const seeded = ZERO_CONFIG_SEED_SLOTS.map((templateSlot, idx) => {
      const existing = pool[idx]
      return {
        ...templateSlot,
        api_key: existing?.api_key || '',
      }
    })
    setPool(seeded)
    onToast('Zero-Config 3-Slot Template loaded (Primary, Backup, and Failover)', 'success')
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

  const toggleAdvanced = (id: string) => {
    setExpandedAdvanced((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // Handle key input with auto-detection
  const handleKeyInput = (slotId: string, rawKey: string) => {
    const sanitized = sanitizeAiInput(rawKey)
    const detected = autoDetectProviderFromKey(sanitized)
    updateSlot(slotId, {
      api_key: sanitized,
      provider: detected.provider,
      model: detected.model,
      base_url: detected.baseUrl || undefined,
    })
  }

  // Single Slot Test & Auto-Discovery
  const handleTestAndDiscover = async (slot: AiKeySlot) => {
    if (!slot.api_key.trim()) {
      onToast(`Please paste an API key for "${slot.label}" before testing.`, 'warning')
      return
    }
    setTestingSlotId(slot.id)
    try {
      const result = await testAutoDiscoverAiKey(slot.api_key)
      setSlotTestResults((prev) => ({ ...prev, [slot.id]: result }))

      if (result.ok) {
        updateSlot(slot.id, {
          provider: (result.provider as AiKeyProvider) || slot.provider,
          model: result.activeModel || slot.model,
          status: 'active',
          latency_ms: result.latencyMs,
          calls_count: (slot.calls_count || 0) + 1,
        })
        onToast(
          `✅ Connected! Auto-detected provider: ${result.providerName} (Active Model: ${result.activeModel}) · Latency: ${result.latencyMs}ms`,
          'success',
        )
      } else {
        const isRateLimit =
          result.error?.toLowerCase().includes('quota') || result.error?.includes('429')
        updateSlot(slot.id, {
          status: isRateLimit ? 'cooldown' : 'exhausted',
          latency_ms: result.latencyMs,
        })
        onToast(`✕ Connection failed: ${result.error || 'Connection error'}`, 'critical')
      }
    } catch (err) {
      const msg = apiErrorMessage(err)
      setSlotTestResults((prev) => ({
        ...prev,
        [slot.id]: {
          ok: false,
          provider: slot.provider,
          providerName: getProviderDisplayName(slot.provider),
          activeModel: slot.model,
          latencyMs: 0,
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
          `Pool test passed: ${report.healthyCount}/${report.activeCount} healthy keys responding (Fastest: ${report.fastestLatencyMs} ms)`,
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

    const activeWithKeys = pool.filter((s) => s.enabled && s.api_key.trim().length > 0)
    const candidate =
      activeWithKeys.find((s) => s.status === 'active') ||
      activeWithKeys[0] ||
      pool.find((s) => s.api_key.trim().length > 0) ||
      pool[0]

    const detected = candidate ? autoDetectProviderFromKey(candidate.api_key) : null

    const primaryProvider = candidate?.provider || detected?.provider || 'gemini'
    const primaryModel = candidate?.model || detected?.model || 'gemini-2.5-flash'
    const primaryApiKey = candidate?.api_key || ''
    const primaryBaseUrl = candidate?.base_url || detected?.baseUrl || ''

    const payload: AiConfigUpdate = {
      ai_provider: primaryProvider,
      ai_model: primaryModel,
      ai_api_key: primaryApiKey,
      ai_base_url: primaryBaseUrl,
      routing_mode: routingMode,
      api_keys_pool: pool,
    }

    try {
      const updated = await saveAiConfig(payload)
      applyConfig(updated)
      setRoutePending(false)
      setLocalPending(null)
      onToast(
        'Zero-Config AI Key Pool successfully saved and pushed to live app & website.',
        'success',
      )
    } catch (error) {
      if (isRouteMissing(error)) {
        setRoutePending(true)
        const cached = readLocalAiConfig()
        setLocalPending(cached)
        onToast(
          'AI Key Pool safely stored in browser storage — will sync with backend upon next reload.',
          'warning',
        )
        return
      }
      const message = apiErrorMessage(error)
      setFormError(message)
      onToast(`Failed to save AI configuration: ${message}`, 'critical')
    } finally {
      setSaving(false)
    }
  }

  const syncPending = Boolean(routePending || localPending)

  if (loading && !config) {
    return (
      <Panel
        title="Zero-Config AI Engine & Multi-Key Load Balancer"
        caption="Loading AI configuration and connection health from CampusMart backend."
      >
        <div className="grid min-h-[220px] place-items-center px-5 py-8 text-center">
          <div>
            <span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-line border-t-brand" />
            <p className="mt-3.5 text-[13.5px] font-medium text-ink">
              Loading Zero-Config AI Engine…
            </p>
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      title="Zero-Config AI Engine & Multi-Key Load Balancer"
      caption="100% Zero-Config: Simply paste any Gemini, Groq, OpenRouter, or OpenAI API key below. The engine automatically detects the provider, discovers the active working model, and manages automatic failovers."
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
                Queued at {formatSavedAt(localPending?.saved_at ?? '')} · Mobile 4-photo scanning continues using cached keys.
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

        {/* TOP STATUS BAR & ACTIONS */}
        <div className="rounded-xl border border-line bg-surface-2/60 p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-ink">
                  Zero-Config Mode: {activeSlotsCount} of {totalSlotsCount} API Keys Active
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-2.5 py-0.5 text-[11px] font-semibold text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  Auto-Discovery Ready
                </span>
              </div>
              <p className="text-[12px] text-ink-muted flex items-center gap-1.5">
                <ShieldIcon size={14} className="text-brand shrink-0" />
                <span>
                  No model selection required. Paste your keys and click <strong>Test &amp; Auto-Discover</strong>.
                </span>
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="text-[12.5px]"
                onClick={handleSeedCleanSlots}
                title="Populate pool with Primary, Backup, and Failover slots"
              >
                <ZapIcon size={14} className="text-brand" />
                Quick Seed 3 Slots
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
                Failover Chain Execution Order:
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
                        {getProviderDisplayName(step.provider)} · {step.model}
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

        {/* STREAMLINED API KEY SLOTS (KEY-ONLY ZERO-CONFIG) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-semibold text-ink">
                API Key Slots ({pool.length} Configured)
              </h3>
              <p className="text-[12px] text-ink-muted">
                Paste your API keys below. The engine auto-detects the provider and discovers the active model.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {pool.map((slot, index) => {
              const detected = autoDetectProviderFromKey(slot.api_key)
              const effectiveProvider = slot.api_key.trim() ? detected.provider : slot.provider
              const providerName = getProviderDisplayName(effectiveProvider)
              const testResult = slotTestResults[slot.id]
              const isTestingThis = testingSlotId === slot.id
              const isMasked = !showKeyMask[slot.id]
              const isAdvancedOpen = Boolean(expandedAdvanced[slot.id])

              return (
                <div
                  key={slot.id}
                  className={`rounded-xl border transition-all duration-150 ${
                    slot.enabled
                      ? 'border-line bg-surface shadow-xs hover:border-line-strong'
                      : 'border-line/60 bg-subtle/40 opacity-70'
                  }`}
                >
                  {/* Slot Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
                      {/* Auto-detected Provider Badge */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                          PROVIDER_BADGE_STYLES[effectiveProvider] || PROVIDER_BADGE_STYLES.custom
                        }`}
                      >
                        {slot.api_key.trim() ? `✨ ${providerName}` : '○ Key Required'}
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
                        className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors cursor-pointer ${
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
                        className="rounded-md p-1 text-ink-faint hover:bg-critical-soft hover:text-critical cursor-pointer"
                        title="Remove Slot"
                        aria-label="Remove Slot"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Clean Zero-Config Key Input Area */}
                  <div className="p-4 space-y-3.5">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[11px] font-semibold tracking-wider text-ink-faint uppercase">
                          API Key (Auto-Detects Provider &amp; Model)
                        </label>
                        <span className="text-[11px] text-ink-faint">
                          {slot.api_key.trim() ? (
                            <span className="text-success font-medium">✓ Key Entered ({slot.api_key.length} chars)</span>
                          ) : (
                            <span className="text-warning">⚠ Paste any Gemini, Groq, OpenRouter, or OpenAI key</span>
                          )}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2.5">
                        {/* Key Input Box */}
                        <div className="relative flex-1">
                          <input
                            type={isMasked ? 'password' : 'text'}
                            value={slot.api_key}
                            onChange={(e) => handleKeyInput(slot.id, e.target.value)}
                            placeholder="Paste any Gemini (AIzaSy...), Groq (gsk_...), OpenRouter (sk-or-...), or OpenAI (sk-...) API key"
                            autoComplete="off"
                            spellCheck={false}
                            className="h-10 w-full rounded-lg border border-line bg-surface pr-10 pl-3 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-ink-faint hover:border-line-strong focus:border-brand focus:outline-none transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => toggleMask(slot.id)}
                            className="absolute inset-y-0 right-0 flex items-center px-2.5 text-ink-faint hover:text-ink cursor-pointer"
                            title={isMasked ? 'Show Key' : 'Hide Key'}
                          >
                            {isMasked ? <EyeIcon size={16} /> : <EyeOffIcon size={16} />}
                          </button>
                        </div>

                        {/* Prominent "🧪 Test & Auto-Discover Key" Button */}
                        <Button
                          type="button"
                          variant="primary"
                          className="h-10 px-4 text-[12.5px] font-semibold shrink-0 justify-center shadow-xs cursor-pointer"
                          disabled={isTestingThis || !slot.api_key.trim()}
                          onClick={() => void handleTestAndDiscover(slot)}
                        >
                          <RefreshIcon
                            size={14}
                            className={isTestingThis ? 'animate-spin' : undefined}
                          />
                          {isTestingThis ? 'Auto-Discovering…' : '🧪 Test & Auto-Discover Key'}
                        </Button>
                      </div>
                    </div>

                    {/* Instant Result Box */}
                    {testResult && (
                      <div
                        className={`rounded-lg border p-3 text-[12.5px] ${
                          testResult.ok
                            ? 'border-success/30 bg-success-soft/25 text-ink'
                            : 'border-critical/30 bg-critical-soft/25 text-critical'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold flex items-center gap-1.5">
                            {testResult.ok ? (
                              <>
                                <span className="text-success font-bold">✅ Connected!</span>
                                <span>
                                  Auto-detected provider: <strong>{testResult.providerName}</strong> (Active Model: <code className="font-mono text-ink text-[12px] bg-white/70 dark:bg-black/30 px-1.5 py-0.5 rounded border border-line">{testResult.activeModel}</code>)
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-critical font-bold">✕ Connection Failed:</span>
                                <span>{testResult.error || 'Invalid API key or network timeout'}</span>
                              </>
                            )}
                          </span>
                          {testResult.ok && (
                            <span className="font-mono text-[11.5px] font-semibold text-success shrink-0">
                              · Latency: {testResult.latencyMs}ms
                            </span>
                          )}
                        </div>
                        {testResult.sampleOutput && (
                          <p className="mt-1.5 font-mono text-[11.5px] text-ink-muted leading-relaxed line-clamp-2">
                            Sample output: {testResult.sampleOutput}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Collapsible Advanced Settings (Optional & Tucked Away) */}
                    <div className="border-t border-line/60 pt-2.5">
                      <button
                        type="button"
                        onClick={() => toggleAdvanced(slot.id)}
                        className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-muted hover:text-ink cursor-pointer"
                      >
                        <ChevronDownIcon
                          size={14}
                          className={`transition-transform duration-150 ${isAdvancedOpen ? 'rotate-180' : ''}`}
                        />
                        {isAdvancedOpen ? 'Hide Advanced Options' : 'Advanced Configuration (Model ID & Gateway URL)'}
                      </button>

                      {isAdvancedOpen && (
                        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-line/70 bg-surface-2/40 p-3">
                          <div>
                            <label className="block text-[10.5px] font-semibold tracking-wider text-ink-faint uppercase">
                              Active Model ID
                            </label>
                            <input
                              type="text"
                              value={slot.model}
                              onChange={(e) => updateSlot(slot.id, { model: e.target.value })}
                              placeholder="e.g. gemini-2.5-flash"
                              className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2.5 font-mono text-[12px] text-ink hover:border-line-strong focus:border-brand focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10.5px] font-semibold tracking-wider text-ink-faint uppercase">
                              Task Assignment
                            </label>
                            <select
                              value={slot.role}
                              onChange={(e) => updateSlot(slot.id, { role: e.target.value as AiKeyRole })}
                              className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2 text-[12px] text-ink hover:border-line-strong focus:border-brand focus:outline-none"
                            >
                              <option value="all">Universal (All Tasks)</option>
                              <option value="vision_pricing">4-Photo Vision &amp; Resale Pricing</option>
                              <option value="fast_chat_search">Fast Student Chat &amp; Search</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10.5px] font-semibold tracking-wider text-ink-faint uppercase">
                              Custom Gateway / Base URL
                            </label>
                            <input
                              type="text"
                              value={slot.base_url || ''}
                              onChange={(e) => updateSlot(slot.id, { base_url: e.target.value })}
                              placeholder="Default provider endpoint"
                              className="mt-1 h-8 w-full rounded-md border border-line bg-surface px-2.5 font-mono text-[12px] text-ink hover:border-line-strong focus:border-brand focus:outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
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
                Zero-Config Load Balancer automatically routes traffic to the fastest healthy key with instant 60s cooldown failover.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              className="shrink-0 justify-center text-[12.5px]"
              disabled={saving || testingPool || activeSlotsCount === 0}
              onClick={() => void handleTestFullPool()}
            >
              <RefreshIcon size={15} className={testingPool ? 'animate-spin' : undefined} />
              {testingPool ? 'Testing All Keys…' : 'Test Full Pool Failover'}
            </Button>

            <Button
              type="submit"
              variant="primary"
              className="shrink-0 justify-center text-[12.5px] font-semibold"
              disabled={saving || testingPool || activeSlotsCount === 0}
            >
              <CheckIcon size={15} />
              {saving
                ? 'Pushing Keys…'
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

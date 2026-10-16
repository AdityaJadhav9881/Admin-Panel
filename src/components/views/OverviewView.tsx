import { useState } from 'react'
import type {
  Agent,
  FlaggedTransaction,
  OverviewMetrics,
  Service,
  ViewId,
} from '../../data/mock'
import {
  issueServiceCount,
  overallServiceState,
  stateLabel,
  stateTone,
} from '../../data/mock'
import { formatMoney } from '../../lib/format'
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  FlagIcon,
  InboxIcon,
  RefreshIcon,
  UsersIcon,
} from '../icons'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { MetricCard } from '../ui/MetricCard'
import { Panel } from '../ui/Panel'
import { ServiceRow } from '../ui/ServiceRow'

interface OverviewViewProps {
  metrics: OverviewMetrics
  queue: FlaggedTransaction[]
  agents: Agent[]
  services: Service[]
  probing: boolean
  onNavigate: (view: ViewId) => void
  onAcknowledge: (id: string) => void
  onRunProbes: () => void
}

export function OverviewView({
  metrics,
  queue,
  agents,
  services,
  probing,
  onNavigate,
  onAcknowledge,
  onRunProbes,
}: OverviewViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const pending = queue.filter((tx) => !tx.acknowledged)
  const highSeverity = pending.filter((tx) => tx.severity === 'high').length
  const activeAgents = agents.filter((agent) => agent.enabled).length
  const fraudAgent = agents.find((agent) => agent.id === 'trust_fraud_detection')
  const overall = overallServiceState(services)
  const issueCount = issueServiceCount(services)

  const scrollToQueue = () => {
    document.getElementById('flag-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="view-enter space-y-6">
      {/* Level 1 — immediate understanding */}
      <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Total Active Users"
          value={metrics.totalActiveUsers.toLocaleString('en-US')}
          icon={<UsersIcon size={17} />}
          action={{ label: 'Manage users', onClick: () => onNavigate('users') }}
        />
        <MetricCard
          label="Listings Today"
          value={metrics.listingsToday.toLocaleString('en-US')}
          icon={<InboxIcon size={17} />}
          footnote="Active campus marketplace listings"
        />
        <MetricCard
          label="Flagged Transactions"
          value={metrics.flaggedCount.toLocaleString('en-US')}
          context={
            metrics.flaggedCount === 0
              ? 'Queue clear — nothing waiting'
              : `${highSeverity} high severity · review required`
          }
          contextTone={metrics.flaggedCount === 0 ? 'success' : 'critical'}
          icon={<FlagIcon size={17} />}
          action={{ label: 'Review queue', onClick: scrollToQueue }}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.7fr_1fr] lg:items-start">
        {/* Flag queue — Level 2 detail on demand */}
        <Panel
          id="flag-queue"
          title="Flagged transactions"
          caption="Opened by the Trust & Fraud Detection Agent and buyer reports"
          action={
            <Badge tone={pending.length === 0 ? 'success' : 'critical'} withDot>
              {pending.length === 0 ? 'Clear' : `${pending.length} pending`}
            </Badge>
          }
        >
          {queue.length === 0 ? (
            <EmptyQueue onOpenAgents={() => onNavigate('settings')} />
          ) : (
            <>
              {pending.length === 0 && (
                <p className="flex items-center gap-2 border-b border-line bg-success-soft px-5 py-3 text-[12.5px] font-medium text-success">
                  <CheckIcon size={15} />
                  All {queue.length} flags acknowledged — nothing waiting for review.
                </p>
              )}
              <ul className="divide-y divide-line">
              {queue.map((tx) => {
                const expanded = expandedId === tx.id
                return (
                  <li key={tx.id}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? null : tx.id)}
                      className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-surface-2"
                    >
                      <span className="hidden w-[74px] shrink-0 font-mono text-[12px] text-ink-faint sm:block">
                        {tx.id}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">
                          {tx.listing}
                        </span>
                        <span className="block truncate text-[12.5px] text-ink-muted">
                          {tx.reason}
                        </span>
                      </span>
                      <span className="tabular hidden w-24 shrink-0 text-right text-[13.5px] font-medium text-ink sm:block">
                        {formatMoney(tx.amount)}
                      </span>
                      <span className="flex shrink-0 justify-end sm:w-[116px]">
                        <Badge
                          tone={
                            tx.acknowledged
                              ? 'neutral'
                              : tx.severity === 'high'
                                ? 'critical'
                                : 'warning'
                          }
                          withDot
                        >
                          {tx.acknowledged
                            ? 'Acknowledged'
                            : tx.severity === 'high'
                              ? 'High'
                              : 'Medium'}
                        </Badge>
                      </span>
                      <ChevronDownIcon
                        size={16}
                        className={`shrink-0 text-ink-faint transition-transform duration-200 ease-out-soft ${expanded ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {expanded && (
                      <div className="view-enter border-t border-line bg-surface-2 px-5 py-4">
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                          <Detail label="AI confidence" value={`${tx.confidence}%`} />
                          <Detail label="Reported by" value={tx.reportedBy} />
                          <Detail label="Opened" value={tx.opened} />
                          <Detail label="Transaction" value={tx.id} mono />
                        </dl>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-[12.5px] text-ink-muted">
                            {tx.acknowledged
                              ? 'Acknowledged for this session. The next data refresh reloads the flag from the server.'
                              : 'Acknowledge to clear it from the active review queue.'}
                          </p>
                          {!tx.acknowledged && (
                            <Button
                              variant="primary"
                              onClick={() => onAcknowledge(tx.id)}
                            >
                              <CheckIcon size={15} />
                              Acknowledge
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
              </ul>
            </>
          )}
        </Panel>

        {/* System status — connected to the settings view */}
        <Panel
          title="System status"
          caption={`${activeAgents} of ${agents.length} agents active · ${issueCount} service issue${issueCount === 1 ? '' : 's'}`}
          action={<Badge tone={stateTone[overall]} withDot>{stateLabel[overall]}</Badge>}
        >
          {!fraudAgent?.enabled && (
            <div className="flex items-start gap-3 border-b border-line bg-warning-soft px-5 py-3.5">
              <span className="mt-0.5 shrink-0 text-warning">
                <AlertIcon size={16} />
              </span>
              <p className="text-[12.5px] leading-relaxed text-warning">
                Trust &amp; Fraud Detection Agent is paused — new transactions are not being
                flagged.
              </p>
            </div>
          )}

          <ul className="divide-y divide-line">
            {services.map((service) => (
              <ServiceRow key={service.id} service={service} />
            ))}
          </ul>

          <div className="border-t border-line px-5 py-3.5">
            {probing && (
              <p className="mb-2.5 flex items-center gap-2 text-[12.5px] text-ink-muted">
                <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-brand" />
                Measuring live latency across all five services…
              </p>
            )}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Button className="justify-center" disabled={probing} onClick={onRunProbes}>
                <RefreshIcon size={15} className={probing ? 'animate-spin' : undefined} />
                {probing ? 'Probing…' : 'Run Live Probe'}
              </Button>
              <Button className="justify-center" onClick={() => onNavigate('settings')}>
                Open AI &amp; API settings
              </Button>
            </div>
          </div>
        </Panel>
      </section>
    </div>
  )
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
        {label}
      </dt>
      <dd className={`mt-1 text-[13px] text-ink ${mono ? 'font-mono' : 'font-medium'}`}>{value}</dd>
    </div>
  )
}

function EmptyQueue({ onOpenAgents }: { onOpenAgents: () => void }) {
  return (
    <div className="px-5 py-10 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-success-soft text-success">
        <CheckIcon size={20} />
      </span>
      <p className="mt-3.5 text-[14px] font-semibold text-ink">Queue is clear</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">
        Every flagged transaction has been acknowledged. New items appear here as the fraud agent
        scans the marketplace.
      </p>
      <Button className="mt-4" onClick={onOpenAgents}>
        Open AI &amp; API settings
      </Button>
    </div>
  )
}

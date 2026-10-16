import type { Agent, Service } from '../../data/mock'
import { overallServiceState, stateLabel, stateTone } from '../../data/mock'
import { PauseIcon, PlayIcon, RefreshIcon } from '../icons'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { ServiceRow } from '../ui/ServiceRow'
import { Toggle } from '../ui/Toggle'
import type { ToastMessage } from '../ui/Toast'
import { AiConfigPanel } from './AiConfigPanel'

interface SettingsViewProps {
  agents: Agent[]
  services: Service[]
  probing: boolean
  onToggleAgent: (id: string) => void
  onRunProbes: () => void
  onToast: (text: string, tone: ToastMessage['tone']) => void
}

export function SettingsView({
  agents,
  services,
  probing,
  onToggleAgent,
  onRunProbes,
  onToast,
}: SettingsViewProps) {
  const activeAgents = agents.filter((agent) => agent.enabled).length
  const allActive = activeAgents === agents.length
  const overall = overallServiceState(services)

  return (
    <div className="view-enter space-y-6">
      <AiConfigPanel onToast={onToast} />

      <Panel
        title="AI agents"
        caption="Control which models run against live marketplace data. Toggles are saved on the backend immediately."
        action={
          <Badge tone={allActive ? 'success' : activeAgents === 0 ? 'critical' : 'warning'} withDot>
            {activeAgents} of {agents.length} active
          </Badge>
        }
      >
        <ul className="divide-y divide-line">
          {agents.map((agent) => (
            <li key={agent.id} className="flex items-center gap-4 px-5 py-4">
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                  agent.enabled ? 'bg-success-soft text-success' : 'bg-subtle text-ink-faint'
                }`}
              >
                {agent.enabled ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-[13.5px] font-medium text-ink">{agent.name}</h3>
                  <Badge tone={agent.enabled ? 'success' : 'neutral'} withDot>
                    {agent.enabled ? 'Running' : 'Paused'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[12.5px] text-ink-muted">{agent.description}</p>
              </div>

              <Toggle
                checked={agent.enabled}
                label={`${agent.enabled ? 'Pause' : 'Resume'} ${agent.name}`}
                onChange={() => onToggleAgent(agent.id)}
              />
            </li>
          ))}
        </ul>
        <div className="border-t border-line bg-surface-2 px-5 py-3.5 text-[12.5px] text-ink-muted">
          Pausing an agent stops new predictions immediately; existing records are not affected.
        </div>
      </Panel>

      <Panel
        title="Server & API health"
        caption="Live round-trip latency measured from this browser against the production API"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <Badge tone={stateTone[overall]} withDot>
              {stateLabel[overall]}
            </Badge>
            <Button className="h-9 justify-center" disabled={probing} onClick={onRunProbes}>
              <RefreshIcon size={15} className={probing ? 'animate-spin' : undefined} />
              {probing ? 'Probing…' : 'Run Live Probe'}
            </Button>
          </div>
        }
        footer="Every row is a real HTTP measurement: gateway reachability, listing records, active agents, LLM configuration and Cloudinary photo delivery."
      >
        <ul className="divide-y divide-line">
          {services.map((service) => (
            <ServiceRow key={service.id} service={service} />
          ))}
        </ul>
      </Panel>
    </div>
  )
}

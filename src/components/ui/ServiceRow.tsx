import type { Service } from '../../data/mock'
import { stateLabel, stateTone } from '../../data/mock'
import { ServerIcon } from '../icons'
import { Badge } from './Badge'

export function ServiceRow({ service }: { service: Service }) {
  const latency = service.latencyMs === null ? '—' : `${service.latencyMs} ms`

  return (
    <li className="flex items-center gap-3 px-5 py-3.5 sm:gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-faint">
        <ServerIcon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink">{service.name}</span>
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">
            {service.note}
          </span>
          <span className="tabular shrink-0 font-mono text-[12px] text-ink-muted sm:hidden">
            {latency}
          </span>
        </span>
      </span>
      <span className="tabular hidden w-16 shrink-0 text-right font-mono text-[12.5px] text-ink-muted sm:block">
        {latency}
      </span>
      <Badge tone={stateTone[service.state]} withDot className="shrink-0">
        {stateLabel[service.state]}
      </Badge>
    </li>
  )
}

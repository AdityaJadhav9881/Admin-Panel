import { useState } from 'react'
import type { User } from '../../data/mock'
import { trustBand } from '../../data/mock'
import { initials } from '../../lib/format'
import { SearchIcon } from '../icons'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Panel } from '../ui/Panel'

export type UserFilter = 'all' | 'active' | 'blocked'

interface UsersViewProps {
  users: User[]
  query: string
  filter: UserFilter
  onQueryChange: (value: string) => void
  onFilterChange: (value: UserFilter) => void
  onToggleStatus: (user: User) => void
}

const FILTERS: { id: UserFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'blocked', label: 'Blocked' },
]

const BAR_TONES = {
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-critical',
} as const

export function UsersView({
  users,
  query,
  filter,
  onQueryChange,
  onFilterChange,
  onToggleStatus,
}: UsersViewProps) {
  const [pendingBlock, setPendingBlock] = useState<User | null>(null)

  const counts = {
    all: users.length,
    active: users.filter((u) => u.status === 'active').length,
    blocked: users.filter((u) => u.status === 'blocked').length,
  }

  const normalized = query.trim().toLowerCase()
  const visible = users.filter((user) => {
    const matchesFilter = filter === 'all' || user.status === filter
    const matchesQuery =
      normalized === '' ||
      user.name.toLowerCase().includes(normalized) ||
      user.email.toLowerCase().includes(normalized)
    return matchesFilter && matchesQuery
  })

  const requestToggle = (user: User) => {
    if (user.status === 'active') setPendingBlock(user)
    else onToggleStatus(user)
  }

  const clearFilters = () => {
    onQueryChange('')
    onFilterChange('all')
  }

  return (
    <div className="view-enter space-y-6">
      <Panel
        title="User directory"
        caption="Trust scores are recalculated nightly by the platform; blocks apply immediately."
        action={
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
            <div className="relative">
              <SearchIcon
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search name or email"
                aria-label="Search users by name or email"
                className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13px] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-brand sm:w-60"
              />
            </div>
            <div
              role="group"
              aria-label="Filter by status"
              className="inline-flex rounded-lg border border-line bg-surface p-0.5"
            >
              {FILTERS.map((item) => {
                const active = filter === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onFilterChange(item.id)}
                    className={`h-8 rounded-[7px] px-3 text-[13px] whitespace-nowrap transition-colors duration-150 ${
                      active
                        ? 'bg-brand-soft font-medium text-brand-strong'
                        : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    {item.label}
                    <span className="tabular ml-1.5 text-[12px] opacity-70">
                      {counts[item.id]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        }
      >
        {visible.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-subtle text-ink-faint">
              <SearchIcon size={20} />
            </span>
            <p className="mt-3.5 text-[14px] font-semibold text-ink">No users in this view</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">
              {normalized
                ? `Nothing matches “${query.trim()}” with the current status filter.`
                : 'No accounts currently have this status.'}
            </p>
            <Button className="mt-4" onClick={clearFilters}>
              Clear search and filters
            </Button>
          </div>
        ) : (
          <>
            {/* Mobile: stacked records instead of a compressed table */}
            <ul className="divide-y divide-line sm:hidden">
              {visible.map((user) => {
                const band = trustBand(user.trustScore)
                const blocked = user.status === 'blocked'
                return (
                  <li
                    key={user.id}
                    className={`px-5 py-4 ${blocked ? 'bg-surface-2/60' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12px] font-semibold ${
                          blocked ? 'bg-subtle text-ink-faint' : 'bg-brand-soft text-brand-strong'
                        }`}
                      >
                        {initials(user.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-[14px] font-medium text-ink">{user.name}</p>
                          <Badge tone={blocked ? 'critical' : 'success'} withDot className="shrink-0">
                            {blocked ? 'Blocked' : 'Active'}
                          </Badge>
                        </div>
                        <p className="truncate text-[12.5px] text-ink-muted">{user.email}</p>
                        <p className="mt-0.5 text-[12px] text-ink-faint">
                          {user.listings} listings · joined {user.joined}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-4">
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span className="tabular w-6 text-[13px] font-medium text-ink">
                          {user.trustScore}
                        </span>
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                          <span
                            className={`block h-full rounded-full ${BAR_TONES[band.tone]}`}
                            style={{ width: `${user.trustScore}%` }}
                          />
                        </span>
                        <span className="text-[12px] text-ink-muted">{band.label}</span>
                      </div>
                      <Button
                        variant={blocked ? 'outline' : 'danger-quiet'}
                        className="min-w-[92px]"
                        aria-label={blocked ? `Unblock ${user.name}` : `Block ${user.name}`}
                        onClick={() => requestToggle(user)}
                      >
                        {blocked ? 'Unblock' : 'Block'}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {['Name', 'Email', 'Trust score', 'Status', 'Actions'].map((heading, index) => (
                    <th
                      key={heading}
                      scope="col"
                      className={`px-5 py-3 text-[10.5px] font-semibold tracking-[0.09em] text-ink-faint uppercase ${
                        index === 4 ? 'text-right' : ''
                      }`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((user) => {
                  const band = trustBand(user.trustScore)
                  const blocked = user.status === 'blocked'
                  return (
                    <tr
                      key={user.id}
                      className={`transition-colors duration-150 hover:bg-surface-2 ${blocked ? 'bg-surface-2/60' : ''}`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span
                            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12px] font-semibold ${
                              blocked
                                ? 'bg-subtle text-ink-faint'
                                : 'bg-brand-soft text-brand-strong'
                            }`}
                          >
                            {initials(user.name)}
                          </span>
                          <span>
                            <span
                              className={`block text-[13.5px] font-medium ${blocked ? 'text-ink-muted' : 'text-ink'}`}
                            >
                              {user.name}
                            </span>
                            <span className="block text-[12px] text-ink-faint">
                              {user.listings} listings · joined {user.joined}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-ink-muted">{user.email}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="tabular w-6 text-[13px] font-medium text-ink">
                            {user.trustScore}
                          </span>
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
                            <span
                              className={`block h-full rounded-full ${BAR_TONES[band.tone]}`}
                              style={{ width: `${user.trustScore}%` }}
                            />
                          </span>
                          <span className="w-11 text-[12px] text-ink-muted">{band.label}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={blocked ? 'critical' : 'success'} withDot>
                          {blocked ? 'Blocked' : 'Active'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end">
                          <Button
                            variant={blocked ? 'outline' : 'danger-quiet'}
                            className="min-w-[92px]"
                            aria-label={
                              blocked ? `Unblock ${user.name}` : `Block ${user.name}`
                            }
                            onClick={() => requestToggle(user)}
                          >
                            {blocked ? 'Unblock' : 'Block'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2 px-5 py-3.5 text-[12.5px] text-ink-muted">
          <span>
            Showing {visible.length} of {users.length} users
          </span>
          <span>Blocking revokes listing, purchase and messaging access.</span>
        </div>
      </Panel>

      <ConfirmDialog
        open={pendingBlock !== null}
        title={pendingBlock ? `Block ${pendingBlock.name}?` : ''}
        body="They will no longer be able to list, buy or message on CampusMart. Existing listings stay visible until reviewed. You can unblock them at any time."
        confirmLabel="Block user"
        onCancel={() => setPendingBlock(null)}
        onConfirm={() => {
          if (pendingBlock) onToggleStatus(pendingBlock)
          setPendingBlock(null)
        }}
      />
    </div>
  )
}

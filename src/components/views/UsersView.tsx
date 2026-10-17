import { useMemo, useState } from 'react'
import type { AdminUserUpdatePayload } from '../../api/client'
import { isProtectedAdminEmail, isSuperAdminEmail } from '../../api/client'
import type { User } from '../../data/mock'
import {
  MAHARASHTRA_COLLEGES,
  formatCollegeBadge,
  formatTrustScore,
  trustBand,
  trustPercent,
} from '../../data/mock'
import { initials } from '../../lib/format'
import { AcademicCapIcon, ChevronDownIcon, EditIcon, SearchIcon, TrashIcon } from '../icons'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Panel } from '../ui/Panel'
import { UserEditDrawer } from '../users/UserEditDrawer'

export type UserFilter = 'all' | 'active' | 'blocked'
export type UserViewMode = 'table' | 'colleges'

interface UsersViewProps {
  users: User[]
  query: string
  filter: UserFilter
  onQueryChange: (value: string) => void
  onFilterChange: (value: UserFilter) => void
  onToggleStatus: (user: User) => void
  onDeleteUser: (user: User) => void
  onUpdateUser: (
    userId: string,
    payload: AdminUserUpdatePayload,
    updateListingsCollege?: boolean,
  ) => void
  onBulkUpdateCollege?: (userIds: string[], collegeName: string, collegeCode: string) => void
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

interface CollegeGroup {
  collegeName: string
  collegeCode: string
  students: User[]
  totalStudents: number
  activeCount: number
  blockedCount: number
  totalListings: number
  avgTrustScore: number
}

export function UsersView({
  users,
  query,
  filter,
  onQueryChange,
  onFilterChange,
  onToggleStatus,
  onDeleteUser,
  onUpdateUser,
  onBulkUpdateCollege,
}: UsersViewProps) {
  const [viewMode, setViewMode] = useState<UserViewMode>('table')
  const [collegeFilter, setCollegeFilter] = useState<string>('all')
  const [expandedColleges, setExpandedColleges] = useState<Record<string, boolean>>({})

  const [pendingBlock, setPendingBlock] = useState<User | null>(null)
  const [pendingDelete, setPendingDelete] = useState<User | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [bulkCollegeValue, setBulkCollegeValue] = useState('')

  const counts = {
    all: users.length,
    active: users.filter((u) => u.status === 'active').length,
    blocked: users.filter((u) => u.status === 'blocked').length,
  }

  // Extract all unique colleges from user roster
  const collegeOptions = useMemo(() => {
    const map = new Map<string, { name: string; code: string; count: number }>()
    for (const u of users) {
      const name = u.collegeName || 'Government College of Engineering, Karad'
      const code = u.collegeCode || '6004'
      const entry = map.get(name)
      if (entry) {
        entry.count++
      } else {
        map.set(name, { name, code, count: 1 })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [users])

  const normalized = query.trim().toLowerCase()
  const visible = users.filter((user) => {
    const matchesFilter = filter === 'all' || user.status === filter
    const matchesCollege = collegeFilter === 'all' || user.collegeName === collegeFilter

    const userCollege = (user.collegeName ?? '').toLowerCase()
    const userCode = (user.collegeCode ?? '').toLowerCase()
    const userName = user.name.toLowerCase()
    const userEmail = user.email.toLowerCase()

    const matchesQuery =
      normalized === '' ||
      userName.includes(normalized) ||
      userEmail.includes(normalized) ||
      userCollege.includes(normalized) ||
      userCode.includes(normalized)

    return matchesFilter && matchesCollege && matchesQuery
  })

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllVisible = () => {
    if (selectedUserIds.size === visible.length) {
      setSelectedUserIds(new Set())
    } else {
      setSelectedUserIds(new Set(visible.map((u) => u.id)))
    }
  }

  const handleBulkReassignSubmit = () => {
    if (!bulkCollegeValue || selectedUserIds.size === 0) return
    const [cName, cCode] = bulkCollegeValue.split('|')
    if (onBulkUpdateCollege) {
      onBulkUpdateCollege(Array.from(selectedUserIds), cName, cCode)
    } else {
      for (const uid of selectedUserIds) {
        onUpdateUser(uid, { college_name: cName, college_code: cCode }, true)
      }
    }
    setSelectedUserIds(new Set())
    setBulkCollegeValue('')
  }

  // Group visible users by college
  const collegeGroups: CollegeGroup[] = useMemo(() => {
    const groupsMap = new Map<string, User[]>()
    for (const user of visible) {
      const cName = user.collegeName || 'Government College of Engineering, Karad'
      const list = groupsMap.get(cName) || []
      list.push(user)
      groupsMap.set(cName, list)
    }

    const groups: CollegeGroup[] = []
    for (const [cName, students] of groupsMap.entries()) {
      const code = students[0]?.collegeCode || '6004'
      const totalScore = students.reduce((acc, s) => acc + s.trustScore, 0)
      const avgScore = students.length > 0 ? Number((totalScore / students.length).toFixed(1)) : 5.0
      const totalListings = students.reduce((acc, s) => acc + s.listings, 0)
      const activeCount = students.filter((s) => s.status === 'active').length
      const blockedCount = students.filter((s) => s.status === 'blocked').length

      groups.push({
        collegeName: cName,
        collegeCode: code,
        students,
        totalStudents: students.length,
        activeCount,
        blockedCount,
        totalListings,
        avgTrustScore: avgScore,
      })
    }

    return groups.sort((a, b) => b.totalStudents - a.totalStudents)
  }, [visible])

  const toggleCollegeExpand = (collegeName: string) => {
    setExpandedColleges((prev) => ({
      ...prev,
      [collegeName]: prev[collegeName] === undefined ? false : !prev[collegeName],
    }))
  }

  const isCollegeExpanded = (collegeName: string): boolean => {
    // Default to true (expanded) for ease of browsing
    return expandedColleges[collegeName] !== false
  }

  const requestToggle = (user: User) => {
    if (isProtectedAdminEmail(user.email) && user.status === 'active') return
    if (user.status === 'active') setPendingBlock(user)
    else onToggleStatus(user)
  }

  const clearFilters = () => {
    onQueryChange('')
    onFilterChange('all')
    setCollegeFilter('all')
  }

  return (
    <div className="view-enter space-y-6">
      <Panel
        title="User & Campus Directory"
        caption="Review verified students, trust scores, and CET Cell institutes across Maharashtra."
        action={
          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:justify-end">
            {/* View Mode Segmented Control */}
            <div
              role="group"
              aria-label="View mode"
              className="inline-flex rounded-lg border border-line bg-surface p-0.5"
            >
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`h-8 rounded-[7px] px-3 text-[12.5px] font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                All Users Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('colleges')}
                className={`inline-flex items-center gap-1.5 h-8 rounded-[7px] px-3 text-[12.5px] font-medium transition-colors ${
                  viewMode === 'colleges'
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <AcademicCapIcon size={14} />
                Grouped by College
              </button>
            </div>

            {/* College Dropdown Filter */}
            <select
              value={collegeFilter}
              onChange={(e) => setCollegeFilter(e.target.value)}
              className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink transition-colors hover:border-line-strong focus:border-brand focus:outline-none"
              aria-label="Filter by college"
            >
              <option value="all">🎓 All Campuses ({users.length})</option>
              {collegeOptions.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} · CET {c.code} ({c.count})
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative">
              <SearchIcon
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search student, email, college…"
                aria-label="Search users by name, email or college"
                className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13px] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-brand sm:w-60"
              />
            </div>

            {/* Status Filter */}
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
        {/* Bulk Reassign Action Bar */}
        {selectedUserIds.size > 0 && (
          <div className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-soft/40 px-4 py-3 text-[13px]">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-brand-strong">
                {selectedUserIds.size} student{selectedUserIds.size === 1 ? '' : 's'} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedUserIds(new Set())}
                className="text-[12px] text-ink-muted hover:text-ink underline ml-1 cursor-pointer"
              >
                Deselect all
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bulkCollegeValue}
                onChange={(e) => setBulkCollegeValue(e.target.value)}
                className="h-8.5 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink"
                aria-label="Target College for Bulk Reassign"
              >
                <option value="">Select target campus…</option>
                {MAHARASHTRA_COLLEGES.map((c) => (
                  <option key={c.code} value={`${c.name}|${c.code}`}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              <Button
                variant="primary"
                className="h-8.5 px-3.5 text-[12.5px]"
                disabled={!bulkCollegeValue}
                onClick={handleBulkReassignSubmit}
              >
                Reassign Campus
              </Button>
            </div>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-subtle text-ink-faint">
              <SearchIcon size={20} />
            </span>
            <p className="mt-3.5 text-[14px] font-semibold text-ink">No users in this view</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">
              {normalized || collegeFilter !== 'all'
                ? 'Nothing matches your current search criteria or campus filter.'
                : 'No accounts currently have this status.'}
            </p>
            <Button className="mt-4" onClick={clearFilters}>
              Clear search and filters
            </Button>
          </div>
        ) : viewMode === 'colleges' ? (
          /* GROUPED BY COLLEGE ACCORDION VIEW */
          <div className="divide-y divide-line">
            {collegeGroups.map((group) => {
              const expanded = isCollegeExpanded(group.collegeName)
              return (
                <div key={group.collegeName} className="transition-colors">
                  {/* College Accordion Header */}
                  <button
                    type="button"
                    onClick={() => toggleCollegeExpand(group.collegeName)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-surface-2/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-strong text-[18px]">
                        🎓
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[14px] font-semibold text-ink truncate">
                            {group.collegeName}
                          </h3>
                          <span className="rounded-md border border-brand/20 bg-brand-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-brand-strong">
                            CET {group.collegeCode}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12px] text-ink-muted">
                          {group.totalStudents} verified student{group.totalStudents === 1 ? '' : 's'} ·{' '}
                          {group.totalListings} active listing{group.totalListings === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <Badge tone="success" withDot>
                        ★ {group.avgTrustScore} / 5.0 Trust
                      </Badge>
                      <ChevronDownIcon
                        size={17}
                        className={`text-ink-faint transition-transform duration-200 ${
                          expanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {/* Expanded Student List */}
                  {expanded && (
                    <div className="border-t border-line/60 bg-surface-2/30 px-5 py-3">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                          <thead>
                            <tr className="border-b border-line text-[10.5px] font-semibold tracking-wider text-ink-faint uppercase">
                              <th className="py-2.5 pr-4">Student</th>
                              <th className="py-2.5 px-4">Contact</th>
                              <th className="py-2.5 px-4">Trust Score</th>
                              <th className="py-2.5 px-4">Status</th>
                              <th className="py-2.5 pl-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line/60">
                            {group.students.map((student) => {
                              const band = trustBand(student.trustScore)
                              const blocked = student.status === 'blocked'
                              const protectedAdmin = isProtectedAdminEmail(student.email)
                              const isSuper = isSuperAdminEmail(student.email)

                              return (
                                <tr key={student.id} className="hover:bg-surface-2/80 transition-colors">
                                  <td className="py-2.5 pr-4">
                                    <div className="flex items-center gap-2.5">
                                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-[11.5px] font-semibold text-brand-strong">
                                        {initials(student.name)}
                                      </span>
                                      <div>
                                        <p className="text-[13px] font-medium text-ink">{student.name}</p>
                                        <p className="text-[11.5px] text-ink-faint">
                                          {student.listings} listings · joined {student.joined}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-4 text-[12.5px]">
                                    <a
                                      href={`mailto:${student.email}?subject=CampusMart%20Student%20Notice`}
                                      className="text-ink-muted hover:text-brand hover:underline"
                                    >
                                      {student.email}
                                    </a>
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <div className="flex items-center gap-2">
                                      <span className="tabular font-mono text-[12px] font-medium text-ink">
                                        {formatTrustScore(student.trustScore)}
                                      </span>
                                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                                        <span
                                          className={`block h-full rounded-full ${BAR_TONES[band.tone]}`}
                                          style={{ width: `${trustPercent(student.trustScore)}%` }}
                                        />
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <div className="flex items-center gap-1.5">
                                      <Badge tone={blocked ? 'critical' : 'success'} withDot>
                                        {blocked ? 'Blocked' : 'Active'}
                                      </Badge>
                                      {protectedAdmin && (
                                        <Badge tone="brand">
                                          {isSuper ? 'Super Admin' : 'Admin'}
                                        </Badge>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 pl-4 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Button
                                        variant="outline"
                                        className="h-7 px-2 text-[11.5px]"
                                        onClick={() => setEditingUser(student)}
                                      >
                                        <EditIcon size={13} />
                                        Edit
                                      </Button>
                                      <Button
                                        variant={blocked ? 'outline' : 'danger-quiet'}
                                        className="h-7 px-2.5 text-[11.5px]"
                                        disabled={protectedAdmin && !blocked}
                                        onClick={() => requestToggle(student)}
                                      >
                                        {blocked ? 'Unblock' : 'Block'}
                                      </Button>
                                      <Button
                                        variant="danger-outline"
                                        className="h-7 px-2 text-[11.5px] text-critical"
                                        disabled={protectedAdmin}
                                        onClick={() => setPendingDelete(student)}
                                      >
                                        <TrashIcon size={13} />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          /* STANDARD TABLE VIEW WITH COLLEGE BADGES */
          <>
            {/* Mobile: stacked records */}
            <ul className="divide-y divide-line sm:hidden">
              {visible.map((user) => {
                const band = trustBand(user.trustScore)
                const blocked = user.status === 'blocked'
                const protectedAdmin = isProtectedAdminEmail(user.email)
                const isSuper = isSuperAdminEmail(user.email)

                return (
                  <li key={user.id} className={`px-5 py-4 ${blocked ? 'bg-surface-2/60' : ''}`}>
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
                        <a
                          href={`mailto:${user.email}?subject=CampusMart%20Student%20Account%20Notice`}
                          className="block truncate text-[12.5px] text-ink-muted hover:text-brand hover:underline"
                          title={`Email ${user.name}`}
                        >
                          {user.email}
                        </a>

                        {/* College badge */}
                        <div className="mt-1.5">
                          <span className="inline-flex items-center gap-1 rounded-md border border-brand/20 bg-brand-soft/60 px-2 py-0.5 text-[11px] font-medium text-brand-strong">
                            {formatCollegeBadge(user.collegeName, user.collegeCode)}
                          </span>
                        </div>

                        {protectedAdmin && (
                          <p className="mt-1.5">
                            <Badge tone="brand">
                              {isSuper ? 'Super Admin (Protected)' : 'Admin (Protected)'}
                            </Badge>
                          </p>
                        )}
                        <p className="mt-0.5 text-[12px] text-ink-faint">
                          {user.listings} listings · joined {user.joined}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-4">
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span className="tabular text-[13px] font-medium text-ink whitespace-nowrap">
                          {formatTrustScore(user.trustScore)} / 5.0
                        </span>
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                          <span
                            className={`block h-full rounded-full ${BAR_TONES[band.tone]}`}
                            style={{ width: `${trustPercent(user.trustScore)}%` }}
                          />
                        </span>
                        <span className="text-[12px] text-ink-muted">{band.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="outline"
                          className="h-8 px-2 text-[12px]"
                          onClick={() => setEditingUser(user)}
                        >
                          <EditIcon size={13} />
                          Edit
                        </Button>
                        <Button
                          variant={blocked ? 'outline' : 'danger-quiet'}
                          className="h-8 min-w-[78px] px-2 text-[12px]"
                          disabled={protectedAdmin && !blocked}
                          onClick={() => requestToggle(user)}
                        >
                          {blocked ? 'Unblock' : 'Block'}
                        </Button>
                        <Button
                          variant="danger-outline"
                          className="h-8 px-2 text-[12px] text-critical"
                          disabled={protectedAdmin}
                          onClick={() => setPendingDelete(user)}
                        >
                          <TrashIcon size={13} />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[840px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all visible students"
                        checked={visible.length > 0 && selectedUserIds.size === visible.length}
                        onChange={selectAllVisible}
                        className="h-4 w-4 rounded border-line text-brand focus:ring-brand accent-brand cursor-pointer"
                      />
                    </th>
                    {['Name', 'Campus & CET Cell Code', 'Email', 'Trust score', 'Status', 'Actions'].map(
                      (heading, index) => (
                        <th
                          key={heading}
                          scope="col"
                          className={`px-5 py-3 text-[10.5px] font-semibold tracking-[0.09em] text-ink-faint uppercase ${
                            index === 5 ? 'text-right' : ''
                          }`}
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((user) => {
                    const band = trustBand(user.trustScore)
                    const blocked = user.status === 'blocked'
                    const protectedAdmin = isProtectedAdminEmail(user.email)
                    const isSuper = isSuperAdminEmail(user.email)

                    return (
                      <tr
                        key={user.id}
                        className={`transition-colors duration-150 hover:bg-surface-2 ${
                          blocked ? 'bg-surface-2/60' : ''
                        }`}
                      >
                        <td className="w-10 px-4 py-3.5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${user.name}`}
                            checked={selectedUserIds.has(user.id)}
                            onChange={() => toggleSelectUser(user.id)}
                            className="h-4 w-4 rounded border-line text-brand focus:ring-brand accent-brand cursor-pointer"
                          />
                        </td>
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
                                className={`block text-[13.5px] font-medium ${
                                  blocked ? 'text-ink-muted' : 'text-ink'
                                }`}
                              >
                                {user.name}
                              </span>
                              <span className="block text-[12px] text-ink-faint">
                                {user.listings} listings · joined {user.joined}
                              </span>
                            </span>
                          </div>
                        </td>

                        {/* College Column */}
                        <td className="px-5 py-3.5">
                          <div className="flex flex-col items-start gap-1">
                            <span className="inline-flex items-center gap-1 rounded-md border border-brand/20 bg-brand-soft/50 px-2 py-0.5 text-[11.5px] font-medium text-brand-strong">
                              {formatCollegeBadge(user.collegeName, user.collegeCode)}
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-3.5 text-[13px]">
                          <a
                            href={`mailto:${user.email}?subject=CampusMart%20Student%20Account%20Notice`}
                            className="text-ink-muted hover:text-brand hover:underline"
                            title={`Email ${user.name}`}
                          >
                            {user.email}
                          </a>
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="tabular text-[13px] font-medium text-ink whitespace-nowrap">
                              {formatTrustScore(user.trustScore)} / 5.0
                            </span>
                            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
                              <span
                                className={`block h-full rounded-full ${BAR_TONES[band.tone]}`}
                                style={{ width: `${trustPercent(user.trustScore)}%` }}
                              />
                            </span>
                            <span className="w-16 text-[12px] text-ink-muted">{band.label}</span>
                          </div>
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="flex flex-col items-start gap-1.5">
                            <Badge tone={blocked ? 'critical' : 'success'} withDot>
                              {blocked ? 'Blocked' : 'Active'}
                            </Badge>
                            {protectedAdmin && (
                              <Badge tone="brand">
                                {isSuper ? 'Super Admin' : 'Admin'}
                              </Badge>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              className="h-8 px-2.5 text-[12.5px]"
                              onClick={() => setEditingUser(user)}
                            >
                              <EditIcon size={14} />
                              Edit
                            </Button>
                            <Button
                              variant={blocked ? 'outline' : 'danger-quiet'}
                              className="h-8 min-w-[80px] px-2.5 text-[12.5px]"
                              disabled={protectedAdmin && !blocked}
                              onClick={() => requestToggle(user)}
                            >
                              {blocked ? 'Unblock' : 'Block'}
                            </Button>
                            <Button
                              variant="danger-outline"
                              className="h-8 px-2.5 text-[12.5px] text-critical"
                              disabled={protectedAdmin}
                              onClick={() => setPendingDelete(user)}
                            >
                              <TrashIcon size={14} />
                              Delete
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
            Showing {visible.length} of {users.length} verified students across{' '}
            {collegeOptions.length} Maharashtra institutes
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

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Permanently delete ${pendingDelete.name}?` : ''}
        body={
          pendingDelete
            ? `This will permanently delete ${pendingDelete.name} (${pendingDelete.email}) and all their associated records from the CampusMart database. This action cannot be undone.`
            : ''
        }
        confirmLabel="Permanently delete user"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDeleteUser(pendingDelete)
          setPendingDelete(null)
        }}
      />

      <UserEditDrawer
        user={editingUser}
        isOpen={editingUser !== null}
        onClose={() => setEditingUser(null)}
        onSave={onUpdateUser}
        onDelete={(u) => {
          setEditingUser(null)
          setPendingDelete(u)
        }}
      />
    </div>
  )
}

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 18, ...props }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  }
}

export function OverviewIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="4.5" rx="1.5" />
      <rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9.5" cy="8" r="3.25" />
      <path d="M3.5 19.5c0-3 2.7-5 6-5s6 2 6 5" />
      <path d="M16 5.4a3.25 3.25 0 0 1 0 5.2" />
      <path d="M18 14.9c1.8.7 3 2.3 3 4.6" />
    </svg>
  )
}

export function AgentsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="7.5" width="16" height="12" rx="3" />
      <path d="M12 4v3.5" />
      <circle cx="12" cy="3.5" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9 12.5v1.5M15 12.5v1.5M9.5 16.75h5" />
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </svg>
  )
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.2 5 6v5.4c0 4.2 2.9 7.6 7 9.4 4.1-1.8 7-5.2 7-9.4V6l-7-2.8Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </svg>
  )
}

export function FlagIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5.5 21V4.5" />
      <path d="M5.5 5.2h10.2l-1.4 3.2 1.4 3.2H5.5" />
    </svg>
  )
}

export function ActivityIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12h3.5l2.2-6 3.6 12 2.4-6H21" />
    </svg>
  )
}

export function ServerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="4.5" width="17" height="6" rx="2" />
      <rect x="3.5" y="13.5" width="17" height="6" rx="2" />
      <path d="M7.5 7.5h.01M7.5 16.5h.01" />
    </svg>
  )
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.7 4.2 2.9 17.6a1.5 1.5 0 0 0 1.3 2.3h15.6a1.5 1.5 0 0 0 1.3-2.3L13.3 4.2a1.5 1.5 0 0 0-2.6 0Z" />
      <path d="M12 9.5v4" />
      <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function InboxIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 13.5h4l1.6 2.6h5.8l1.6-2.6h4" />
      <path d="M5.4 5.4h13.2l1.9 8.1v4a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-4l1.9-8.1Z" />
    </svg>
  )
}

export function PauseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9.5 5.5v13M14.5 5.5v13" />
    </svg>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 5.7v12.6l10-6.3-10-6.3Z" />
    </svg>
  )
}

export function TagIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 12.6V4.9a1.4 1.4 0 0 1 1.4-1.4h7.7l7.9 7.9a1.4 1.4 0 0 1 0 2l-6.7 6.7a1.4 1.4 0 0 1-2 0l-8.3-7.5Z" />
      <circle cx="8.2" cy="8.2" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function BookIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 7c0-1.5-2-2.6-5-2.6H4.5v13H7c3 0 5 1.1 5 2.6V7Z" />
      <path d="M12 7c0-1.5 2-2.6 5-2.6h.5v13H17c-3 0-5 1.1-5 2.6V7Z" />
    </svg>
  )
}

export function LaptopIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="11" rx="1.6" />
      <path d="M2 19.5h20" />
    </svg>
  )
}

export function ChairIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.5 12V7A2.5 2.5 0 0 1 9 4.5h6A2.5 2.5 0 0 1 17.5 7v5" />
      <rect x="4.5" y="11.5" width="15" height="4.5" rx="1.5" />
      <path d="M7.5 16v3M16.5 16v3" />
    </svg>
  )
}

export function BikeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="16.5" r="3.4" />
      <circle cx="18" cy="16.5" r="3.4" />
      <path d="M6 16.5 11 8h3l4 8.5M9.5 8h5.5" />
    </svg>
  )
}

export function BoxIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 7.6 12 3.5l8.5 4.1v8.8L12 20.5l-8.5-4.1V7.6Z" />
      <path d="M3.5 7.6 12 11.7l8.5-4.1M12 11.7v8.8" />
    </svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
      <path d="m6.8 6.5.9 12.1a1.6 1.6 0 0 0 1.6 1.4h5.4a1.6 1.6 0 0 0 1.6-1.4l.9-12.1" />
      <path d="M10 10.5v5.5M14 10.5v5.5" />
    </svg>
  )
}

export function BanIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6.2 6.2 11.6 11.6" />
    </svg>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 12a8 8 0 1 1-2.35-5.65" />
      <path d="M20 4v4.5h-4.5" />
    </svg>
  )
}

export function SignOutIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
      <path d="M10 12h10" />
      <path d="m17 9 3 3-3 3" />
    </svg>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  )
}

export function ZapIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function ChatIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  )
}

export function PhoneIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  )
}

export function AcademicCapIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
    </svg>
  )
}


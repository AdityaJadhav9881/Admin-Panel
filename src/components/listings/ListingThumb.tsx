import type { ComponentType } from 'react'
import type { Listing, ListingCategory } from '../../data/mock'
import { BookIcon, BoxIcon, BikeIcon, ChairIcon, LaptopIcon } from '../icons'

const CATEGORY_STYLES: Record<
  ListingCategory,
  { tile: string; icon: ComponentType<{ size?: number }> }
> = {
  textbooks: { tile: 'bg-subtle text-[#4a5568]', icon: BookIcon },
  electronics: { tile: 'bg-brand-soft text-brand-strong', icon: LaptopIcon },
  furniture: { tile: 'bg-[#f5eee3] text-[#7d6234]', icon: ChairIcon },
  transport: { tile: 'bg-success-soft text-success', icon: BikeIcon },
  supplies: { tile: 'bg-warning-soft text-warning', icon: BoxIcon },
  other: { tile: 'bg-subtle text-ink-faint', icon: BoxIcon },
}

interface ListingThumbProps {
  listing: Listing
  size?: 'sm' | 'lg'
}

export function ListingThumb({ listing, size = 'sm' }: ListingThumbProps) {
  const large = size === 'lg'
  const frame = large ? 'h-24 w-24 rounded-xl' : 'h-11 w-11 rounded-lg'

  if (!listing.hasImage) {
    return (
      <span
        className={`grid ${frame} shrink-0 place-items-center border border-dashed border-line-strong bg-surface-2 text-center`}
      >
        <span className="px-1 text-[9.5px] leading-tight font-medium text-ink-faint">
          No image
        </span>
      </span>
    )
  }

  const style = CATEGORY_STYLES[listing.category]
  const Icon = style.icon

  return (
    <span className={`grid ${frame} shrink-0 place-items-center ${style.tile}`}>
      <Icon size={large ? 36 : 19} />
    </span>
  )
}

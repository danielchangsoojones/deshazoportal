type DeveloperBadgeProps = {
  className?: string
}

export function DeveloperBadge({ className = '' }: DeveloperBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full bg-[#d92d20] px-1.5 py-0.5 text-[10px] font-black uppercase leading-none text-white ${className}`}
    >
      DEV
    </span>
  )
}

export function OldDbBadge({ className = '' }: DeveloperBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border border-[#d92d20] bg-white px-1.5 py-0.5 text-[9px] font-black uppercase leading-none text-[#d92d20] ${className}`}
    >
      ON OLD DB
    </span>
  )
}

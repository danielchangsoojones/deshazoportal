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

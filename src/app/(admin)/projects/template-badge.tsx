/**
 * Trello's marks for card templates: the button at the foot of a list — a
 * card with a plus in its corner — and the light-blue "Vorlage" badge a
 * template card wears, with its small dashed card. Plain drawings, so the
 * board and the template's own sheet share them.
 */

type IconProps = { className?: string }

/** The button at the foot of a list that opens the card templates. */
export function FromTemplateIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M18 2v6M15 5h6" />
    </svg>
  )
}

/** The small card on the "Vorlage" badge. */
export function TemplateCardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="none">
      <rect x="1.75" y="1.75" width="12.5" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 1.5" />
      <rect x="4" y="7.5" width="8" height="4.5" rx="1" fill="currentColor" />
    </svg>
  )
}

/** Trello's light blue for everything that says "template". */
export const TEMPLATE_TONE = 'bg-[#e9f2ff] text-[#0c66e4] dark:bg-[#1c2b41] dark:text-[#85b8ff]'

/** The "Vorlage" badge on a template card. */
export function TemplateBadge({ label, large = false }: { label: string; large?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded font-medium ${TEMPLATE_TONE} ${
        large ? 'px-2 py-1 text-sm' : 'px-1.5 py-0.5 text-[11px]'
      }`}
    >
      <TemplateCardIcon className={large ? 'h-4 w-4 shrink-0' : 'h-3.5 w-3.5 shrink-0'} />
      {label}
    </span>
  )
}

import { Phone } from 'lucide-react'
import { telHref } from '@/lib/phone'

/**
 * A phone number that can be called with a click — see `telHref`. What is not
 * a number is shown as it was typed; nothing at all is a dash.
 */
export function PhoneLink({ value, className = '' }: { value: string | null | undefined; className?: string }) {
  const href = telHref(value)
  if (!value?.trim()) return <>—</>
  if (!href) return <>{value}</>
  return (
    <a href={href} className={`inline-flex items-center gap-1.5 text-accent hover:underline ${className}`}>
      <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="tabular-nums">{value}</span>
    </a>
  )
}

'use client'

import { useCallback, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import { Popover, PopoverHead } from '@/components/ui/popover'
import { LiveSearchInput } from '@/components/live-search'
import { projectControl } from './toolbar-styles'

export function ProjectSearch() {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const query = useSearchParams().get('q') ?? ''
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => { setOpen(false); anchor.current?.focus() }, [])
  return <>
    <button data-project-search ref={anchor} type="button" aria-expanded={open} aria-haspopup="dialog" aria-label={query ? `${t('searchPlaceholder')}: ${query}` : t('searchPlaceholder')} title={query || t('searchPlaceholder')} onClick={() => setOpen(!open)} className={`${projectControl.icon} relative ${query ? '!text-accent !bg-accent/10' : ''}`}>
      <Search className="h-4 w-4" aria-hidden />
      {query && <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
    </button>
    <Popover open={open} onClose={close} anchor={anchor} label={t('searchPlaceholder')} width={420}>
      <PopoverHead title={t('searchPlaceholder')} close={close} closeLabel={tc('close')} />
      <LiveSearchInput autoFocus placeholder={t('searchPlaceholder')} className={`${projectControl.search} !pl-3`} />
    </Popover>
  </>
}

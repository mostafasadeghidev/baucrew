'use client'

/**
 * The big title on a card's back, typed over where it stands, the way
 * Trello's is: a click turns it into a field, Enter or a click elsewhere
 * saves, Escape leaves it as it was. The number stays beside it.
 */

import { useLayoutEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { quickUpdateProject } from '../actions'

export function EditableTitle({ projectId, name, number }: { projectId: string; name: string; number: string }) {
  const t = useTranslations('projects')
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [shown, setShown] = useState(name)
  const [seen, setSeen] = useState(name)
  if (seen !== name) {
    setSeen(name)
    setShown(name)
  }
  const field = useRef<HTMLTextAreaElement>(null)

  // As tall as what is written in it, like the title it stands in for.
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [editing, value])

  const save = () => {
    const next = value.replace(/\s+/g, ' ').trim()
    setEditing(false)
    if (!next || next === shown) {
      setValue(shown)
      return
    }
    const before = shown
    setShown(next)
    startTransition(async () => {
      const result = await quickUpdateProject(projectId, { name: next })
      if (result.error) {
        setShown(before)
        setValue(before)
      }
      router.refresh()
    })
  }

  if (editing)
    return (
      <textarea
        ref={field}
        autoFocus
        rows={1}
        maxLength={300}
        value={value}
        aria-label={t('titleEdit')}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape') {
            // The sheet closes on Escape too; here it only lets go of the title.
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation()
            setValue(shown)
            setEditing(false)
          }
        }}
        onBlur={save}
        className="block min-w-0 flex-1 resize-none overflow-hidden rounded-md border border-accent bg-background px-1.5 py-0.5 text-2xl font-semibold leading-tight focus:outline-none focus:ring-2 focus:ring-ring"
      />
    )

  return (
    <h2
      title={t('titleEdit')}
      onClick={() => {
        setValue(shown)
        setEditing(true)
      }}
      className="-mx-1.5 min-w-0 flex-1 cursor-text break-words rounded-md px-1.5 py-0.5 text-2xl font-semibold leading-tight transition-colors hover:bg-black/5 dark:hover:bg-white/5"
    >
      {shown}
      <span className="ml-2 align-middle text-sm font-normal text-muted">{number}</span>
    </h2>
  )
}

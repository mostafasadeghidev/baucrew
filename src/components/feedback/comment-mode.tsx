'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { COMMENT_PARAM, withCommentParam, withoutCommentParam } from '@/lib/feedback'

// The tools and the screenshot code load only once somebody asks for them.
const CommentToolbar = dynamic(() => import('./comment-toolbar'), { ssr: false })

/**
 * Comment mode is switched on by `?comment` on the address and by nothing
 * else: a page loaded without it never shows the tools. Once on, it stays on
 * while the person moves around the app — every address they go to gets the
 * word back — until they close the tools.
 */
export function CommentMode({
  name,
  tasksHref,
  localCopy = null,
}: {
  name: string
  tasksHref: string
  localCopy?: { liveUrl: string | null } | null
}) {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const asked = params.has(COMMENT_PARAM)
  const [active, setActive] = useState(asked)
  // Closed while the address still carries the word: not switched on again by it.
  const [closing, setClosing] = useState(false)
  if (asked && !active && !closing) setActive(true)
  if (!asked && closing) setClosing(false)

  const query = params.toString()
  useEffect(() => {
    if (!active || asked) return
    router.replace(withCommentParam(`${pathname}${query ? `?${query}` : ''}${window.location.hash}`), { scroll: false })
  }, [active, asked, pathname, query, router])

  if (!active) return null
  return (
    <CommentToolbar
      name={name}
      tasksHref={tasksHref}
      localCopy={localCopy}
      onExit={() => {
        setActive(false)
        setClosing(true)
        router.replace(withoutCommentParam(`${pathname}${query ? `?${query}` : ''}${window.location.hash}`), { scroll: false })
      }}
    />
  )
}

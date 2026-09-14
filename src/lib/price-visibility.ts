import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { HIDE_PRICES_COOKIE } from './format'

/**
 * Whether this browser has asked for prices to be hidden, read once per
 * request. It is a curtain for a screen others can see, not a permission:
 * who may see money at all is `canViewFinancials`.
 */
export const pricesHidden = cache(async (): Promise<boolean> => (await cookies()).get(HIDE_PRICES_COOKIE)?.value === '1')

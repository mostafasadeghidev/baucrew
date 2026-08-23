'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireManagement } from '@/lib/authz'
import {
  DASHBOARD_WIDGETS,
  moveWidget,
  parseLayout,
  serializeLayout,
  toggleHidden,
  toggleWidth,
  type DashboardWidget,
} from '@/lib/dashboard-layout'

function widgetFrom(formData: FormData): DashboardWidget | null {
  const id = String(formData.get('widget') ?? '')
  return (DASHBOARD_WIDGETS as readonly string[]).includes(id) ? (id as DashboardWidget) : null
}

/**
 * One action for every layout change (move / hide / width) so the buttons stay
 * plain forms — no client component needed for the edit mode.
 */
export async function changeDashboardLayout(formData: FormData) {
  const user = await requireManagement()
  const widget = widgetFrom(formData)
  if (!widget) return
  const op = String(formData.get('op') ?? '')
  const current = parseLayout(user.dashboardLayout)

  let next = current
  if (op === 'up') next = moveWidget(current, widget, -1)
  else if (op === 'down') next = moveWidget(current, widget, 1)
  else if (op === 'toggle') next = toggleHidden(current, widget)
  else if (op === 'width') next = toggleWidth(current, widget)
  else return

  await db.user.update({
    where: { id: user.id },
    data: { dashboardLayout: serializeLayout(next) },
  })
  revalidatePath('/dashboard')
}

/** Back to the layout everybody starts with. */
export async function resetDashboardLayout() {
  const user = await requireManagement()
  await db.user.update({ where: { id: user.id }, data: { dashboardLayout: null } })
  revalidatePath('/dashboard')
}

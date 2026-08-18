'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { SavedToast } from '@/components/saved-toast'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import { MultiCombobox } from '@/components/multi-combobox'
import type { TemplateFormState } from './actions'
import { btn } from '@/components/ui/button'

export type TemplateFormValues = {
  name: string
  workCategoryId: string
  description: string
  active: boolean
  /** Optional default assignment copied into new projects. */
  managerId: string
  vehicleIds: string[]
  employeeIds: string[]
}

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

export function TemplateForm({
  action,
  initial,
  categories,
  employees,
  vehicles,
  itemsSection,
}: {
  action: (prev: TemplateFormState, formData: FormData) => Promise<TemplateFormState>
  initial: TemplateFormValues
  categories: ComboboxOption[]
  employees: ComboboxOption[]
  vehicles: ComboboxOption[]
  /** Draft tools/materials, shown while creating (saved together with the template). */
  itemsSection?: ReactNode
}) {
  const t = useTranslations('templates')
  const tc = useTranslations('common')
  const tProjects = useTranslations('projects')
  const tEmployees = useTranslations('employees')
  const tVehicles = useTranslations('vehicles')
  const [vehicleIds, setVehicleIds] = useState<string[]>(initial.vehicleIds)
  const [employeeIds, setEmployeeIds] = useState<string[]>(initial.employeeIds)
  const [managerId, setManagerId] = useState(initial.managerId)
  const [state, formAction, pending] = useActionState<TemplateFormState, FormData>(action, {})

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              {t('name')} <span className="text-danger">*</span>
            </label>
            <input id="name" name="name" defaultValue={initial.name} required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium">{t('category')}</label>
            <Combobox
              name="workCategoryId"
              options={categories}
              defaultValue={initial.workCategoryId}
              placeholder={tc('none')}
              noResultsLabel={t('noResults')}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="description" className="block text-sm font-medium">
              {t('description')}
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={initial.description}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="active"
                defaultChecked={initial.active}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {tc('active')}
            </label>
          </div>
        </div>
      </div>

      {/* Optional defaults — copied into a new project created from this template */}
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold">{tProjects('assignmentSection')}</h2>
        <p className="mt-0.5 text-xs text-muted">{t('assignmentHint')}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">{tProjects('manager')}</label>
            <Combobox
              name="managerId"
              options={employees}
              defaultValue={managerId}
              placeholder={tc('none')}
              noResultsLabel={tEmployees('noResults')}
              onSelect={(id) => {
                setManagerId(id)
                if (id) setEmployeeIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">{tProjects('vehicle')}</label>
            <MultiCombobox
              options={vehicles}
              value={vehicleIds}
              onChange={setVehicleIds}
              placeholder={tc('none')}
              noResultsLabel={tVehicles('noResults')}
            />
            {vehicleIds.map((v) => (
              <input key={v} type="hidden" name="vehicleIds" value={v} />
            ))}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium">{tProjects('team')}</label>
            <MultiCombobox
              options={employees}
              value={employeeIds}
              onChange={setEmployeeIds}
              placeholder={tc('none')}
              noResultsLabel={tEmployees('noResults')}
            />
            {employeeIds.map((e) => (
              <input key={e} type="hidden" name="employeeIds" value={e} />
            ))}
          </div>
        </div>
      </div>

      {itemsSection}

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error === 'nameRequired' ? t('nameRequired') : tc('saveFailed')}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={btn.primary}
        >
          {tc('save')}
        </button>
        <Link
          href="/projects/templates"
          className={btn.outline}
        >
          {tc('cancel')}
        </Link>
        <SavedToast trigger={state.savedAt} />
      </div>
    </form>
  )
}

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
  /** Checklists every project from this template starts with. */
  checklistIds: string[]
  deviceIds: string[]
}

const FORM_ID = 'template-form'

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

export function TemplateForm({
  action,
  initial,
  categories,
  employees,
  vehicles,
  checklists,
  devices,
  itemsSection,
}: {
  action: (prev: TemplateFormState, formData: FormData) => Promise<TemplateFormState>
  initial: TemplateFormValues
  categories: ComboboxOption[]
  employees: ComboboxOption[]
  vehicles: ComboboxOption[]
  checklists: ComboboxOption[]
  /** Machines this kind of job usually needs. */
  devices: ComboboxOption[]
  /** Draft tools/materials, shown while creating (saved together with the template). */
  itemsSection?: ReactNode
}) {
  const t = useTranslations('templates')
  const tc = useTranslations('common')
  const tProjects = useTranslations('projects')
  const tEmployees = useTranslations('employees')
  const tVehicles = useTranslations('vehicles')
  const tChecklists = useTranslations('checklists')
  const tDevices = useTranslations('devices')
  const [vehicleIds, setVehicleIds] = useState<string[]>(initial.vehicleIds)
  const [employeeIds, setEmployeeIds] = useState<string[]>(initial.employeeIds)
  const [checklistIds, setChecklistIds] = useState<string[]>(initial.checklistIds)
  const [deviceIds, setDeviceIds] = useState<string[]>(initial.deviceIds)
  const [managerId, setManagerId] = useState(initial.managerId)
  const [state, formAction, pending] = useActionState<TemplateFormState, FormData>(action, {})

  return (
    <div className="max-w-2xl space-y-6">
      <form id={FORM_ID} action={formAction} className="space-y-6">
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

      </form>

      {/* Optional defaults — copied into a new project created from this template */}
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold">{tProjects('assignmentSection')}</h2>
        <p className="mt-0.5 text-xs text-muted">{t('assignmentHint')}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">{tProjects('manager')}</label>
            <Combobox
              formId={FORM_ID}
              name="managerId"
              options={employees}
              defaultValue={managerId}
              placeholder={tc('none')}
              noResultsLabel={tEmployees('noResults')}
              clearable
              clearLabel={tc('clear')}
              onSelect={(id) => {
                setEmployeeIds((prev) => {
                  const next = prev.filter((x) => !managerId || x !== managerId)
                  return id && !next.includes(id) ? [...next, id] : next
                })
                setManagerId(id)
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
              <input key={v} type="hidden" form={FORM_ID} name="vehicleIds" value={v} />
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
              <input key={e} type="hidden" form={FORM_ID} name="employeeIds" value={e} />
            ))}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium">{tChecklists('projectChecklists')}</label>
            <MultiCombobox
              options={checklists}
              value={checklistIds}
              onChange={setChecklistIds}
              placeholder={tc('none')}
              noResultsLabel={tChecklists('templateNone')}
            />
            {checklistIds.map((c) => (
              <input key={c} type="hidden" form={FORM_ID} name="checklistIds" value={c} />
            ))}
            <p className="mt-1 text-xs text-muted">{tChecklists('templateChecklistsHint')}</p>
          </div>
        </div>
      </div>


      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold">{tDevices('needTitle')}</h2>
        <p className="mt-0.5 text-xs text-muted">{tDevices('needTemplateHint')}</p>
        <div className="mt-3">
          <MultiCombobox
            options={devices}
            value={deviceIds}
            onChange={setDeviceIds}
            placeholder={tc('none')}
            noResultsLabel={tDevices('noResults')}
          />
          {deviceIds.map((d) => (
            <input key={d} type="hidden" form={FORM_ID} name="deviceIds" value={d} />
          ))}
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
          form={FORM_ID}
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
    </div>
  )
}

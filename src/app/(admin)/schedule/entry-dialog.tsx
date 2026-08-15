'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Combobox, type ComboboxOption } from '@/components/combobox'
import { MultiCombobox } from '@/components/multi-combobox'
import { ProjectItemsEditor, type ProjectItemRow } from '../projects/[id]/project-items'
import { getProjectScheduleDefaults, type EntryInput } from './actions'

export type BoardEntry = {
  id: string
  date: string
  projectId: string
  projectNumber: string
  projectName: string
  customerName: string
  vehicles: Array<{ id: string; name: string }>
  startTime: string
  endTime: string
  note: string
  employees: Array<{ id: string; name: string }>
  hasConflict: boolean
}

export type DialogState =
  | { mode: 'closed' }
  | { mode: 'create'; date: string; projectId?: string }
  | { mode: 'edit'; entry: BoardEntry }

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

/**
 * Create/edit dialog for a schedule entry. Used by the weekly board and by
 * the project page ("Einsatz planen"). Selecting a project prefills team and
 * vehicle from the project record and shows the project's tool/material
 * list for editing right here (the list belongs to the project).
 */
export function EntryDialog({
  dialog,
  projects,
  employees,
  vehicles,
  pending,
  onClose,
  onSubmit,
  onDelete,
}: {
  dialog: Exclude<DialogState, { mode: 'closed' }>
  projects: ComboboxOption[]
  employees: ComboboxOption[]
  vehicles: ComboboxOption[]
  pending: boolean
  onClose: () => void
  onSubmit: (input: EntryInput, entryId?: string) => void
  onDelete?: (entryId: string) => void
}) {
  const t = useTranslations('schedule')
  const tc = useTranslations('common')
  const tProjects = useTranslations('projects')
  const tSheet = useTranslations('sheet')
  const tVehicles = useTranslations('vehicles')
  const isEdit = dialog.mode === 'edit'
  const entry = isEdit ? dialog.entry : null

  // Lock background scrolling while the dialog is open.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const [projectId, setProjectId] = useState(
    entry?.projectId ?? (dialog.mode === 'create' ? (dialog.projectId ?? '') : '')
  )
  const [date, setDate] = useState(entry?.date ?? (dialog.mode === 'create' ? dialog.date : ''))
  const [vehicleIds, setVehicleIds] = useState<string[]>(entry?.vehicles.map((v) => v.id) ?? [])
  const [startTime, setStartTime] = useState(entry?.startTime ?? '07:00')
  const [endTime, setEndTime] = useState(entry?.endTime ?? '')
  const [note, setNote] = useState(entry?.note ?? '')
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(
    new Set(entry?.employees.map((e) => e.id) ?? [])
  )
  const [items, setItems] = useState<ProjectItemRow[] | null>(null)
  const [catalogOptions, setCatalogOptions] = useState<ComboboxOption[]>([])
  const [prefilled, setPrefilled] = useState(false)
  const [loadingDefaults, startLoadDefaults] = useTransition()

  /** Loads project defaults; only overwrites team/vehicle when creating. */
  function loadDefaults(pid: string, applyAssignments: boolean) {
    if (!pid) {
      setItems(null)
      return
    }
    startLoadDefaults(async () => {
      const d = await getProjectScheduleDefaults(pid)
      if (!d) return
      setItems(d.items)
      setCatalogOptions(d.catalogOptions)
      if (applyAssignments) {
        setSelectedEmployees(new Set(d.employeeIds))
        setVehicleIds(d.vehicleIds)
        setPrefilled(d.employeeIds.length > 0 || d.vehicleIds.length > 0)
      }
    })
  }

  // Initial load (edit → items only; create with preselected project → full
  // prefill). Runs once; the async work happens inside a transition, which the
  // React compiler lint accepts (no synchronous setState in the effect).
  const [initialLoaded, setInitialLoaded] = useState(false)
  useEffect(() => {
    if (initialLoaded) return
    const pid = projectId
    startLoadDefaults(async () => {
      setInitialLoaded(true)
      if (!pid) return
      const d = await getProjectScheduleDefaults(pid)
      if (!d) return
      setItems(d.items)
      setCatalogOptions(d.catalogOptions)
      if (!isEdit) {
        setSelectedEmployees(new Set(d.employeeIds))
        setVehicleIds(d.vehicleIds)
        setPrefilled(d.employeeIds.length > 0 || d.vehicleIds.length > 0)
      }
    })
  }, [initialLoaded, projectId, isEdit])

  function toggleEmployee(id: string) {
    setSelectedEmployees((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSubmit(
      { projectId, date, vehicleIds, employeeIds: [...selectedEmployees], startTime, endTime, note },
      entry?.id
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{isEdit ? t('editEntry') : t('addEntry')}</h2>
          <div className="flex items-center gap-2">
            {projectId && (
              <Link
                href={`/projects/${projectId}/sheet`}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                {tSheet('title')}
              </Link>
            )}
            <button
              type="button"
              onClick={onClose}
              title={tc('cancel')}
              aria-label={tc('cancel')}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-hover hover:text-foreground"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium">
              {t('project')} <span className="text-danger">*</span>
            </label>
            <Combobox
              key={`p-${projectId}`}
              name="projectId"
              options={projects}
              defaultValue={projectId}
              placeholder={t('selectProject')}
              noResultsLabel={tProjects('noResults')}
              required
              onSelect={(pid) => {
                setProjectId(pid)
                setPrefilled(false)
                loadDefaults(pid, !isEdit)
              }}
            />
            {prefilled && <p className="mt-1 text-xs text-accent">{t('prefilledFromProject')}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="entry-date" className="block text-sm font-medium">
                {t('date')}
              </label>
              <input
                id="entry-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="entry-time" className="block text-sm font-medium">
                {t('startTime')}
              </label>
              <input id="entry-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="entry-end" className="block text-sm font-medium">
                {t('endTime')}
              </label>
              <input id="entry-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted">{t('timeHint')}</p>

          <div>
            <label className="block text-sm font-medium">{t('vehicle')}</label>
            <MultiCombobox
              options={vehicles}
              value={vehicleIds}
              onChange={setVehicleIds}
              placeholder={t('noVehicle')}
              noResultsLabel={tVehicles('noResults')}
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium">{t('team')}</legend>
            <div className="mt-2 grid max-h-48 grid-cols-2 gap-1 overflow-auto sm:grid-cols-3">
              {employees.map((e) => (
                <label
                  key={e.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm hover:bg-surface-hover"
                >
                  <input
                    type="checkbox"
                    checked={selectedEmployees.has(e.value)}
                    onChange={() => toggleEmployee(e.value)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="truncate">{e.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="entry-note" className="block text-sm font-medium">
              {t('note')}
            </label>
            <input id="entry-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </div>

          {/* Project tool/material list — belongs to the project, editable here */}
          {projectId && (
            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-4 py-2">
                <p className="text-sm font-semibold">{tProjects('itemsTitle')}</p>
                <p className="text-xs text-muted">{t('itemsInDialogHint')}</p>
              </div>
              {items === null || loadingDefaults ? (
                <p className="px-4 py-3 text-sm text-muted">{tc('loading')}</p>
              ) : (
                <ProjectItemsEditor
                  projectId={projectId}
                  items={items}
                  options={catalogOptions}
                  onChanged={() => loadDefaults(projectId, false)}
                />
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
              >
                {tc('save')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-hover"
              >
                {tc('cancel')}
              </button>
            </div>
            {isEdit && onDelete && (
              <button
                type="button"
                disabled={pending}
                onClick={() => onDelete(entry!.id)}
                className="rounded-md border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60"
              >
                {tc('delete')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

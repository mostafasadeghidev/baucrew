'use client'

import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react'
import { MarkdownToolbar } from '@/components/ui/markdown-toolbar'
import { useRouter } from 'next/navigation'
import { AlignLeft, Pencil, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Combobox } from '@/components/combobox'
import { MultiCombobox } from '@/components/multi-combobox'
import { CityPicker } from '@/components/city-picker'
import { NewCustomerModal } from './new-customer-modal'
import type { ProjectFormState } from './actions'
import { Select } from '@/components/ui/select'
import { btn } from '@/components/ui/button'
import { FormHead } from '@/components/ui/form-head'
import { PROJECT_SECTIONS, SECTIONS_FIELD } from '@/lib/project-sections'

/**
 * The project's own page shows these five cards read-only and lets each one be
 * opened for editing where it stands. It is this very form that does the
 * editing — the fields are defined once, here, and the page hands in what each
 * card should look like while it is closed. A closed card keeps its fields in
 * the page, hidden, but the form names the cards that are open and only
 * theirs are written: the windows around the form change the project too, and
 * what a closed card still holds may be older than what they saved.
 */
export type ProjectSectionKey = 'basic' | 'address' | 'planning' | 'assignment' | 'description'

/** Fired by the button in the page's bar; opens every card at once. */
export const PROJECT_EDIT_ALL_EVENT = 'baucrew:project-edit-all'
/** Fired by that button's "cancel"; puts every field back as it was. */
export const PROJECT_EDIT_CANCEL_EVENT = 'baucrew:project-edit-cancel'
/** Opens one card by its key and brings it into view — the card sheet's side column asks for it. */
export const PROJECT_EDIT_CARD_EVENT = 'baucrew:project-edit-card'
/**
 * Fired by the form after every change of mind, so the button in the bar knows
 * what to call itself. `all` means the bar opened everything and the bar
 * therefore carries save and cancel; `card` means one pencil did, and that
 * card carries them instead.
 */
export const PROJECT_EDIT_STATE_EVENT = 'baucrew:project-edit-state'
export type ProjectEditMode = 'none' | 'card' | 'all'

/** The form's id, so a button outside it can still submit it. */
export const PROJECT_FORM_ID = 'project-form'

export type Option = { value: string; label: string }
export type CustomerAddress = {
  street: string
  postalCode: string
  city: string
  phone: string
  latitude: number | null
  longitude: number | null
}

export type ProjectFormValues = {
  name: string
  customerId: string
  status: string
  isSub: boolean
  clientType: string
  buildingType: string
  priority: string
  leadSource: string
  street: string
  postalCode: string
  city: string
  latitude: number | null
  longitude: number | null
  phone: string
  contact: string
  price: string
  plannedStart: string
  plannedEnd: string
  planMonth: string
  planMonths: string
  dueDate: string
  /** The day of the site visit — the client's "Termin Besichtigung". */
  inspectionDate: string
  /** When the customer would like the work done, in the customer's words. */
  executionWish: string
  actualStart: string
  actualEnd: string
  managerId: string
  vehicleIds: string[]
  description: string
  internalNotes: string
  categoryIds: string[]
  teamIds: string[]
  /** Checklist templates copied into the project on save. */
  checklistIds: string[]
  /** Machines this job needs — a wish list, not a handout. */
  deviceIds: string[]
}

const STATUSES = [
  'LEAD',
  'QUOTED',
  'APPROVED',
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'INVOICED',
  'PAID',
  'CANCELLED',
] as const

const todayIso = new Date().toISOString().slice(0, 10)

const inputClass =
  'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

function Section({
  title,
  children,
  wide = false,
  view,
  open = true,
  onOpen,
  onCancel,
  showActions = false,
  editLabel,
  saveLabel,
  cancelLabel,
  pending = false,
  anchor,
  icon,
}: {
  /** Trello's heading on the card's back: an icon before the title, "Bearbeiten" as a word instead of a pencil. */
  icon?: ReactNode
  title: string
  children: React.ReactNode
  /** The card's id on the page, so it can be scrolled to. */
  anchor?: string
  /** Runs the full width of the form — for the long text boxes. */
  wide?: boolean
  /**
   * What the card shows while it is closed. Only the project's own page hands
   * one in; on the add and edit pages every card is open from the start.
   */
  view?: ReactNode
  open?: boolean
  onOpen?: () => void
  onCancel?: () => void
  /**
   * True when this card was opened on its own. Save and cancel then stand
   * where the pencil stood — a strip that appears above the cards would push
   * everything under it down the moment you reach for a field.
   */
  showActions?: boolean
  /** The pencil's name for a screen reader. */
  editLabel?: string
  saveLabel?: string
  cancelLabel?: string
  pending?: boolean
}) {
  const inline = view !== undefined
  return (
    <section
      id={anchor}
      // A query container: the fields pair off by the card's own width, not the
      // window's — the same card stands full width on a page and half width
      // beside another, or in the narrow column of the card's back.
      className={`@container scroll-mt-24 rounded-xl border border-border bg-surface p-5 shadow-sm ${
        // Every column there is, however many that is at this width.
        wide ? 'col-span-full' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        {icon ? (
          <h2 className="flex items-center gap-3 text-base font-semibold">
            {icon}
            {title}
          </h2>
        ) : (
          <h2 className="text-sm font-semibold">{title}</h2>
        )}
        {inline && !open && onOpen && icon && (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`${editLabel}: ${title}`}
            className="inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            {editLabel}
          </button>
        )}
        {inline && !open && onOpen && !icon && (
          <button
            type="button"
            onClick={onOpen}
            title={editLabel}
            aria-label={`${editLabel}: ${title}`}
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
        {inline && open && showActions && (
          <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={onCancel} className={btn.outlineXs}>
              {cancelLabel}
            </button>
            <button type="submit" disabled={pending} className={`${btn.primarySm} px-2.5 py-1 text-xs`}>
              {saveLabel}
            </button>
          </div>
        )}
      </div>
      {inline && !open && <div className={icon ? 'mt-3 pl-8' : 'mt-3'}>{view}</div>}
      {/* Hidden, not absent: the fields of a closed card still travel with the
          form (the name and the customer are checked on every save), but only
          the open cards are written. */}
      <div hidden={inline && !open} className="mt-4 grid grid-cols-1 gap-4 @xs:grid-cols-2">
        {children}
      </div>
    </section>
  )
}

function ControlledField({
  label,
  name,
  value,
  onChange,
  readOnly,
}: {
  label: string
  name: string
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} ${readOnly ? 'bg-surface-hover text-muted' : ''}`}
      />
    </div>
  )
}

function TextField({
  label,
  name,
  defaultValue,
  type = 'text',
  required,
  min,
  placeholder,
  maxLength,
}: {
  label: string
  name: string
  defaultValue: string
  type?: string
  required?: boolean
  /** For date fields: earliest selectable day. */
  min?: string
  placeholder?: string
  maxLength?: number
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        min={min}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        className={inputClass}
      />
    </div>
  )
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  required,
  emptyOption,
}: {
  label: string
  name: string
  defaultValue: string
  options: Option[]
  required?: boolean
  emptyOption?: string
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <Select id={name} name={name} defaultValue={defaultValue} required={required} className="mt-1 w-full">
        {emptyOption !== undefined && <option value="">{emptyOption}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  )
}

function CheckboxGroup({
  legend,
  name,
  options,
  selected,
  onToggle,
}: {
  legend: string
  name: string
  options: Option[]
  selected: string[]
  /** When set the group is controlled (used for the team, which follows the manager). */
  onToggle?: (value: string) => void
}) {
  return (
    <fieldset className="col-span-full">
      <legend className="text-sm font-medium">{legend}</legend>
      {/* As many columns as the card has room for, each wide enough for the
          longest trade on one line; a name longer still wraps inside its box. */}
      <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-hover"
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              {...(onToggle
                ? { checked: selected.includes(o.value), onChange: () => onToggle(o.value) }
                : { defaultChecked: selected.includes(o.value) })}
              className="h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0 break-words">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function ProjectForm({
  action,
  initial,
  cancelHref,
  title,
  headExtra,
  customers,
  employees,
  vehicles,
  categories,
  checklists,
  devices,
  clientTypes,
  buildingTypes,
  leadSources,
  showPrice,
  office = true,
  templateId,
  draftId,
  extraSection,
  afterDescription,
  customerAddresses = {},
  inline,
  pairFrom = 'xl',
  fold,
}: {
  action: (prev: ProjectFormState, formData: FormData) => Promise<ProjectFormState>
  initial: ProjectFormValues
  cancelHref: string
  /** The page's own name, shown in the bar above the fields. */
  title: string
  /** A control for the bar, e.g. the template picker on a new project. */
  headExtra?: ReactNode
  customers: Option[]
  employees: Option[]
  vehicles: Option[]
  categories: Option[]
  /** Active checklists to choose from. */
  checklists: Option[]
  /** Active devices to choose from. */
  devices: Option[]
  /** Configurable lists from Settings. */
  clientTypes: Option[]
  buildingTypes: Option[]
  leadSources: Option[]
  showPrice: boolean
  /**
   * The office's own: the internal notes and a customer made new from the
   * customer field. A site manager has neither.
   */
  office?: boolean
  /** When creating from a template, its items are copied on save. */
  templateId?: string
  /** Taking over an inbox draft: marks it done on save. */
  draftId?: string
  /** Rendered between "assignment" and "description" (e.g. template items). */
  extraSection?: ReactNode
  /**
   * What stands right under the description on the card's back — the fields
   * grid, the way the client's Trello puts its fields there. Only with `fold`.
   */
  afterDescription?: ReactNode
  /** Addresses per customer id — for "same as customer address". */
  customerAddresses?: Record<string, CustomerAddress>
  /**
   * Set on the project's own page: each card shows `views[key]` until its
   * pencil is used. Absent on the add and edit pages, where every card is open.
   */
  inline?: {
    views: Record<ProjectSectionKey, ReactNode>
    /** The pencil's name, and the words on the two buttons. */
    labels: { edit: string; save: string; cancel: string }
  }
  /**
   * The width from which the cards stand in pairs. One step later where a
   * column beside the form takes room from it.
   */
  pairFrom?: 'xl' | '2xl'
  /**
   * The card back the way Trello lays it out: the description first, and the
   * other four cards folded under this title, opened by a click — or by the
   * bar and the "add to card" row, which open what they reach for.
   */
  fold?: { title: string }
}) {
  const t = useTranslations('projects')
  /** The description's box, for its editor bar. */
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const tc = useTranslations('common')
  const tStatus = useTranslations('status')
  const tCustomers = useTranslations('customers')
  const tEmployees = useTranslations('employees')
  const tVehicles = useTranslations('vehicles')
  const tChecklists = useTranslations('checklists')
  const tDevices = useTranslations('devices')
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(action, {})

  const [vehicleIds, setVehicleIds] = useState<string[]>(initial.vehicleIds)
  const [checklistIds, setChecklistIds] = useState<string[]>(initial.checklistIds)
  const [deviceIds, setDeviceIds] = useState<string[]>(initial.deviceIds)
  const [teamIds, setTeamIds] = useState<string[]>(initial.teamIds)
  const [managerAdded, setManagerAdded] = useState(false)
  const [managerId, setManagerId] = useState(initial.managerId)
  const [customerOptions, setCustomerOptions] = useState(customers)
  const [customerId, setCustomerId] = useState(initial.customerId)
  const [addresses, setAddresses] = useState(customerAddresses)
  const isNew = !initial.name && !initial.street && !initial.city
  const [address, setAddress] = useState({
    street: initial.street,
    postalCode: initial.postalCode,
    city: initial.city,
    latitude: initial.latitude,
    longitude: initial.longitude,
    phone: initial.phone,
  })
  const [sameAsCustomer, setSameAsCustomer] = useState(false)
  const customerAddress = customerId ? addresses[customerId] : undefined
  const customerHasAddress = !!(customerAddress && (customerAddress.street || customerAddress.city))
  const addressEmpty = !address.street && !address.postalCode && !address.city && !address.phone

  function copyFromCustomer(addr: CustomerAddress) {
    setAddress({
      street: addr.street,
      postalCode: addr.postalCode,
      city: addr.city,
      latitude: addr.latitude,
      longitude: addr.longitude,
      phone: addr.phone,
    })
  }
  function selectCustomer(id: string) {
    setCustomerId(id)
    const addr = addresses[id]
    // Creating a project with an empty address: default to the customer's address.
    if (isNew && addr && (addr.street || addr.city) && (addressEmpty || sameAsCustomer)) {
      copyFromCustomer(addr)
      setSameAsCustomer(true)
    } else if (!addr || !(addr.street || addr.city)) {
      setSameAsCustomer(false)
    }
  }
  function toggleSameAsCustomer(on: boolean) {
    setSameAsCustomer(on)
    if (on && customerAddress) copyFromCustomer(customerAddress)
    if (!on) setAddress({ street: '', postalCode: '', city: '', latitude: null, longitude: null, phone: '' })
  }
  const [customerModal, setCustomerModal] = useState<{ open: boolean; prefill: string }>({
    open: false,
    prefill: '',
  })

  const router = useRouter()
  /** Which cards are open for editing; every one of them when this is not inline. */
  const [openCards, setOpenCards] = useState<Partial<Record<ProjectSectionKey, boolean>>>({})
  /**
   * Whether a pencil opened one card or the bar opened them all. It decides
   * where save and cancel stand: in the card that was opened, or in the bar
   * that opened everything. Either way they replace the control that was
   * already there, so nothing on the page moves when editing begins.
   */
  const [mode, setMode] = useState<ProjectEditMode>('none')
  /**
   * Bumped on cancel. It is the form's key, so React builds the fields again
   * from their original values — the only way to take back what was typed into
   * an input that keeps its own value.
   */
  const [formKey, setFormKey] = useState(0)
  /** Whether the folded cards are shown; anything that opens one of them opens the fold. */
  const [unfolded, setUnfolded] = useState(false)
  const openCard = (key: ProjectSectionKey) => {
    setOpenCards((o) => ({ ...o, [key]: true }))
    setMode('card')
    if (key !== 'description') setUnfolded(true)
  }

  /** Every field back to what is stored; the inputs that keep their own value are built again. */
  function takeStored() {
    setVehicleIds(initial.vehicleIds)
    setChecklistIds(initial.checklistIds)
    setDeviceIds(initial.deviceIds)
    setTeamIds(initial.teamIds)
    setManagerId(initial.managerId)
    setManagerAdded(false)
    setCustomerId(initial.customerId)
    setSameAsCustomer(false)
    setAddress({
      street: initial.street,
      postalCode: initial.postalCode,
      city: initial.city,
      latitude: initial.latitude,
      longitude: initial.longitude,
      phone: initial.phone,
    })
    setFormKey((k) => k + 1)
  }

  function cancelInline() {
    setOpenCards({})
    setMode('none')
    takeStored()
    router.refresh()
  }

  // The project changed under the form while no card was open — a window on
  // the card, a move to another list, another tab: the fields take what is
  // stored now, so the next card opened starts from it. A card open for
  // editing keeps what is being typed; it is caught up once it closes.
  const stored = JSON.stringify(initial)
  const [shownStored, setShownStored] = useState(stored)
  if (inline && mode === 'none' && shownStored !== stored) {
    setShownStored(stored)
    takeStored()
  }

  // The bar tells the form to open or to give up; the form tells the bar what
  // it should call itself.
  useEffect(() => {
    if (!inline) return
    const openAll = () => {
      setOpenCards({ basic: true, address: true, planning: true, assignment: true, description: true })
      setMode('all')
      setUnfolded(true)
    }
    const openOne = (event: Event) => {
      const key = (event as CustomEvent<ProjectSectionKey>).detail
      // With every card open already there is nothing to open, only to show.
      if (mode !== 'all') openCard(key)
      requestAnimationFrame(() =>
        document.getElementById(`project-card-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      )
    }
    window.addEventListener(PROJECT_EDIT_ALL_EVENT, openAll)
    window.addEventListener(PROJECT_EDIT_CANCEL_EVENT, cancelInline)
    window.addEventListener(PROJECT_EDIT_CARD_EVENT, openOne)
    return () => {
      window.removeEventListener(PROJECT_EDIT_ALL_EVENT, openAll)
      window.removeEventListener(PROJECT_EDIT_CANCEL_EVENT, cancelInline)
      window.removeEventListener(PROJECT_EDIT_CARD_EVENT, openOne)
    }
  })

  useEffect(() => {
    if (!inline) return
    window.dispatchEvent(new CustomEvent(PROJECT_EDIT_STATE_EVENT, { detail: mode }))
  }, [inline, mode])

  /** The props every card needs in inline mode, and nothing at all otherwise. */
  const card = (key: ProjectSectionKey) =>
    inline
      ? {
          view: inline.views[key],
          anchor: `project-card-${key}`,
          open: !!openCards[key],
          onOpen: () => openCard(key),
          onCancel: cancelInline,
          // Only a card opened on its own carries the buttons; when the bar
          // opened all five, the bar carries them once instead of five times.
          showActions: mode === 'card',
          editLabel: inline.labels.edit,
          saveLabel: inline.labels.save,
          cancelLabel: inline.labels.cancel,
          pending,
        }
      : {}

  function handleCustomerCreated(customer: {
    id: string
    name: string
    street?: string | null
    postalCode?: string | null
    city?: string | null
    phone?: string | null
    latitude?: number | null
    longitude?: number | null
  }) {
    setCustomerOptions((prev) =>
      [...prev, { value: customer.id, label: customer.name }].sort((a, b) =>
        a.label.localeCompare(b.label)
      )
    )
    const addr: CustomerAddress = {
      street: customer.street ?? '',
      postalCode: customer.postalCode ?? '',
      city: customer.city ?? '',
      phone: customer.phone ?? '',
      latitude: customer.latitude ?? null,
      longitude: customer.longitude ?? null,
    }
    setAddresses((prev) => ({ ...prev, [customer.id]: addr }))
    setCustomerId(customer.id)
    if (isNew && (addr.street || addr.city) && (addressEmpty || sameAsCustomer)) {
      copyFromCustomer(addr)
      setSameAsCustomer(true)
    }
    setCustomerModal({ open: false, prefill: '' })
  }

  /**
   * The form has the same shape as the project's own page: cards side by side
   * across the width of the window rather than one narrow column of them. Two
   * columns only from xl up — a field needs more room than a line of read-only
   * text, and the fields inside each card pair off by the card's own width.
   * Folded on the card's back the form stands in a column of its own, so there
   * the cards pair by the form's width instead: one under the other in the
   * column beside the comments, two abreast where the column is the sheet.
   */
  return (
    <>
    <form
      key={formKey}
      id={inline ? PROJECT_FORM_ID : undefined}
      action={formAction}
      className={`grid grid-cols-1 items-start gap-6 ${fold ? '@container' : pairFrom === '2xl' ? '2xl:grid-cols-2' : 'xl:grid-cols-2'}`}
    >
      {inline ? null : (
      <FormHead
        title={title}
        saveLabel={tc('save')}
        cancelLabel={tc('cancel')}
        cancelHref={cancelHref}
        pending={pending}
        className="col-span-full"
        extra={headExtra}
      />
      )}
      {/* The cards being saved; the others keep what is stored (src/lib/project-sections.ts). */}
      {inline && <input type="hidden" name={SECTIONS_FIELD} value={PROJECT_SECTIONS.filter((key) => openCards[key]).join(',')} />}
      {templateId && <input type="hidden" name="templateId" value={templateId} />}
      {draftId && <input type="hidden" name="draftId" value={draftId} />}
      {/* Folded: the four cards of facts under one line, which a click opens.
          They are drawn either way; saving the description writes only the
          description. */}
      {fold && (
        <button
          type="button"
          onClick={() => setUnfolded((u) => !u)}
          aria-expanded={unfolded}
          className="order-2 col-span-full flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-left text-sm font-semibold shadow-sm transition-colors hover:bg-surface-hover"
        >
          <ChevronRight className={`h-4 w-4 shrink-0 text-muted transition-transform ${unfolded ? 'rotate-90' : ''}`} aria-hidden />
          {fold.title}
        </button>
      )}
      <div className={fold ? `order-3 col-span-full grid grid-cols-1 items-start gap-6 @3xl:grid-cols-2 ${unfolded ? '' : 'hidden'}` : 'contents'}>
      <Section title={t('basicData')} {...card('basic')}>
        <TextField label={t('name')} name="name" defaultValue={initial.name} required />
        <div>
          <label className="block text-sm font-medium">
            {t('customer')} <span className="text-danger">*</span>
          </label>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Combobox
                key={customerId}
                name="customerId"
                options={customerOptions}
                defaultValue={customerId}
                placeholder={t('selectCustomer')}
                noResultsLabel={tCustomers('noResults')}
                required
                onSelect={selectCustomer}
                onCreateNew={office ? (q) => setCustomerModal({ open: true, prefill: q }) : undefined}
                createLabel={office ? (q) => t('createCustomerOption', { name: q }) : undefined}
              />
            </div>
            {office && (
              <button
                type="button"
                onClick={() => setCustomerModal({ open: true, prefill: '' })}
                title={tCustomers('newCustomer')}
                aria-label={tCustomers('newCustomer')}
                className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-lg text-muted hover:bg-surface-hover hover:text-foreground"
              >
                +
              </button>
            )}
          </div>
        </div>
        <SelectField
          label={t('status')}
          name="status"
          defaultValue={initial.status}
          options={STATUSES.map((s) => ({ value: s, label: tStatus(s) }))}
        />
        <SelectField
          label={t('clientType')}
          name="clientType"
          defaultValue={initial.clientType}
          options={clientTypes}
          emptyOption={tc('none')}
        />
        <SelectField
          label={t('buildingType')}
          name="buildingType"
          defaultValue={initial.buildingType}
          options={buildingTypes}
          emptyOption={tc('none')}
        />
        <SelectField
          label={t('priority')}
          name="priority"
          defaultValue={initial.priority}
          options={[
            { value: 'HIGH', label: t('priorityHigh') },
            { value: 'LOW', label: t('priorityLow') },
          ]}
          emptyOption={t('priorityNormal')}
        />
        <SelectField
          label={t('leadSource')}
          name="leadSource"
          defaultValue={initial.leadSource}
          options={leadSources}
          emptyOption={tc('none')}
        />
        <CheckboxGroup
          legend={t('workCategories')}
          name="categoryIds"
          options={categories}
          selected={initial.categoryIds}
        />
        <div className="col-span-full">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="isSub"
              defaultChecked={initial.isSub}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {t('isSub')}
          </label>
        </div>
      </Section>

      <Section title={t('addressSection')} {...card('address')}>
        <div className="col-span-full">
          <label className={`flex items-center gap-2 text-sm font-medium ${customerHasAddress ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
            <input
              type="checkbox"
              checked={sameAsCustomer}
              disabled={!customerHasAddress}
              onChange={(e) => toggleSameAsCustomer(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {t('sameAsCustomer')}
          </label>
          <p className="mt-1 text-xs text-muted">
            {customerId && !customerHasAddress ? t('sameAsCustomerNoAddress') : t('sameAsCustomerHint')}
          </p>
        </div>
        <ControlledField
          label={t('street')}
          name="street"
          value={address.street}
          onChange={(v) => setAddress((a) => ({ ...a, street: v }))}
          readOnly={sameAsCustomer}
        />
        <ControlledField
          label={t('postalCode')}
          name="postalCode"
          value={address.postalCode}
          onChange={(v) => setAddress((a) => ({ ...a, postalCode: v }))}
          readOnly={sameAsCustomer}
        />
        <CityPicker
          label={t('city')}
          value={{ city: address.city, latitude: address.latitude, longitude: address.longitude }}
          onChange={(v) => setAddress((a) => ({ ...a, city: v.city, latitude: v.latitude, longitude: v.longitude }))}
          onPostcode={(pc) => setAddress((a) => (a.postalCode ? a : { ...a, postalCode: pc }))}
          disabled={sameAsCustomer}
        />
        <ControlledField
          label={t('phone')}
          name="phone"
          value={address.phone}
          onChange={(v) => setAddress((a) => ({ ...a, phone: v }))}
          readOnly={sameAsCustomer}
        />
        <TextField label={t('contact')} name="contact" defaultValue={initial.contact} />
      </Section>

      {/* Whoever is not shown the price is not promised one in the title either. */}
      <Section title={t(showPrice ? 'planningSection' : 'planningSectionDates')} {...card('planning')}>
        {/* Planning looks forward: a new project cannot start in the past. */}
        <TextField
          label={t('plannedStart')}
          name="plannedStart"
          type="date"
          min={isNew ? todayIso : undefined}
          defaultValue={initial.plannedStart}
        />
        <TextField
          label={t('plannedEnd')}
          name="plannedEnd"
          type="date"
          min={isNew ? todayIso : undefined}
          defaultValue={initial.plannedEnd}
        />
        {/* Where the job stands in the year before a day is fixed: the month
            the work is expected in, and how many months it runs. */}
        <TextField label={t('planMonth')} name="planMonth" type="month" defaultValue={initial.planMonth} />
        <TextField label={t('planMonths')} name="planMonths" type="number" min="1" defaultValue={initial.planMonths} />
        <p className="col-span-full text-xs text-muted">{t('planMonthHint')}</p>
        {/* What was promised to the customer — a date of its own, so a plan
            that runs past it shows as one. */}
        <TextField label={t('dueDate')} name="dueDate" type="date" defaultValue={initial.dueDate} />
        {/* The client's two Trello fields: when the customer would like the
            work — in the customer's words, not a month the office picked —
            and the day somebody goes to look at the site. */}
        <TextField label={t('executionWish')} name="executionWish" defaultValue={initial.executionWish} placeholder={t('executionWishPlaceholder')} maxLength={200} />
        <TextField label={t('inspectionDate')} name="inspectionDate" type="date" defaultValue={initial.inspectionDate} />
        <TextField label={t('actualStart')} name="actualStart" type="date" defaultValue={initial.actualStart} />
        <TextField label={t('actualEnd')} name="actualEnd" type="date" defaultValue={initial.actualEnd} />
        {showPrice && (
          <div>
            <label htmlFor="price" className="block text-sm font-medium">
              {t('price')} (€)
            </label>
            <input
              id="price"
              name="price"
              type="text"
              inputMode="decimal"
              defaultValue={initial.price}
              className={inputClass}
            />
          </div>
        )}
      </Section>

      <Section title={t('assignmentSection')} {...card('assignment')}>
        <div>
          <label className="block text-sm font-medium">{t('manager')}</label>
          <Combobox
            name="managerId"
            options={employees}
            defaultValue={initial.managerId}
            placeholder={tc('none')}
            noResultsLabel={tEmployees('noResults')}
            clearable
            clearLabel={tc('clear')}
            onSelect={(id) => {
              // The site manager is part of the crew: tick the new one and drop
              // the tick of the previous manager again.
              setTeamIds((prev) => {
                const next = prev.filter((x) => !managerId || x !== managerId)
                return id && !next.includes(id) ? [...next, id] : next
              })
              setManagerAdded(Boolean(id))
              setManagerId(id)
            }}
          />
          {managerAdded && <p className="mt-1 text-xs text-accent">{t('managerAddedToTeam')}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium">{t('vehicle')}</label>
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
        <div>
          <label className="block text-sm font-medium">{tChecklists('projectChecklists')}</label>
          <MultiCombobox
            options={checklists}
            value={checklistIds}
            onChange={setChecklistIds}
            placeholder={tc('none')}
            noResultsLabel={tChecklists('templateNone')}
          />
          {checklistIds.map((c) => (
            <input key={c} type="hidden" name="checklistIds" value={c} />
          ))}
          <p className="mt-1 text-xs text-muted">{tChecklists('projectChecklistsHint')}</p>
        </div>
        <div>
          <label className="block text-sm font-medium">{tDevices('needTitle')}</label>
          <MultiCombobox
            options={devices}
            value={deviceIds}
            onChange={setDeviceIds}
            placeholder={tc('none')}
            noResultsLabel={tDevices('noResults')}
          />
          {deviceIds.map((d) => (
            <input key={d} type="hidden" name="deviceIds" value={d} />
          ))}
          <p className="mt-1 text-xs text-muted">{tDevices('needProjectHint')}</p>
        </div>
        <CheckboxGroup
          legend={t('team')}
          name="teamIds"
          options={employees}
          selected={teamIds}
          onToggle={(id) =>
            setTeamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
          }
        />
      </Section>

      </div>

      {extraSection}

      {/* First on the card back, the way Trello puts it: what the job is. */}
      <div className={fold ? 'order-1 col-span-full' : 'contents'}>
      <Section
        title={t('descriptionSection')}
        wide
        {...card('description')}
        icon={fold ? <AlignLeft className="h-5 w-5 shrink-0 text-muted" aria-hidden /> : undefined}
      >
        <div className="col-span-full">
          <label htmlFor="description" className="block text-sm font-medium">
            {t('description')}
          </label>
          {/* Trello's editor bar: bold, lists, links and the rest, written as Markdown. */}
          <MarkdownToolbar target={descriptionRef} className="mt-1" />
          <textarea
            ref={descriptionRef}
            id="description"
            name="description"
            rows={6}
            defaultValue={initial.description}
            className={inputClass}
          />
        </div>
        {office && (
          <div className="col-span-full">
            <label htmlFor="internalNotes" className="block text-sm font-medium">
              {t('internalNotes')}
            </label>
            <textarea
              id="internalNotes"
              name="internalNotes"
              rows={3}
              defaultValue={initial.internalNotes}
              className={inputClass}
            />
          </div>
        )}
      </Section>
      </div>
      {fold && afterDescription && <div className="order-1 col-span-full">{afterDescription}</div>}

      {state.error && (
        <p role="alert" className="text-sm text-danger col-span-full">
          {state.error === 'saveFailed' ? tc('saveFailed') : t(state.error)}
        </p>
      )}

    </form>
    {customerModal.open && (
      <NewCustomerModal
        prefillName={customerModal.prefill}
        onClose={() => setCustomerModal({ open: false, prefill: '' })}
        onCreated={handleCustomerCreated}
      />
    )}
    </>
  )
}

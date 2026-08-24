'use client'

import { useActionState, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Combobox } from '@/components/combobox'
import { MultiCombobox } from '@/components/multi-combobox'
import { CityPicker } from '@/components/city-picker'
import { NewCustomerModal } from './new-customer-modal'
import type { ProjectFormState } from './actions'
import { Select } from '@/components/ui/select'
import { btn } from '@/components/ui/button'

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
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
}: {
  label: string
  name: string
  defaultValue: string
  type?: string
  required?: boolean
  /** For date fields: earliest selectable day. */
  min?: string
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
    <fieldset className="sm:col-span-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {o.label}
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
  customers,
  employees,
  vehicles,
  categories,
  checklists,
  clientTypes,
  buildingTypes,
  showPrice,
  templateId,
  extraSection,
  customerAddresses = {},
}: {
  action: (prev: ProjectFormState, formData: FormData) => Promise<ProjectFormState>
  initial: ProjectFormValues
  cancelHref: string
  customers: Option[]
  employees: Option[]
  vehicles: Option[]
  categories: Option[]
  /** Active checklists to choose from. */
  checklists: Option[]
  /** Configurable lists from Settings. */
  clientTypes: Option[]
  buildingTypes: Option[]
  showPrice: boolean
  /** When creating from a template, its items are copied on save. */
  templateId?: string
  /** Rendered between "assignment" and "description" (e.g. template items). */
  extraSection?: ReactNode
  /** Addresses per customer id — for "same as customer address". */
  customerAddresses?: Record<string, CustomerAddress>
}) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const tStatus = useTranslations('status')
  const tCustomers = useTranslations('customers')
  const tEmployees = useTranslations('employees')
  const tVehicles = useTranslations('vehicles')
  const tChecklists = useTranslations('checklists')
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(action, {})

  const [vehicleIds, setVehicleIds] = useState<string[]>(initial.vehicleIds)
  const [checklistIds, setChecklistIds] = useState<string[]>(initial.checklistIds)
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

  return (
    <>
    <form action={formAction} className="max-w-3xl space-y-6">
      {templateId && <input type="hidden" name="templateId" value={templateId} />}
      <Section title={t('basicData')}>
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
                onCreateNew={(q) => setCustomerModal({ open: true, prefill: q })}
                createLabel={(q) => t('createCustomerOption', { name: q })}
              />
            </div>
            <button
              type="button"
              onClick={() => setCustomerModal({ open: true, prefill: '' })}
              title={tCustomers('newCustomer')}
              aria-label={tCustomers('newCustomer')}
              className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-lg text-muted hover:bg-surface-hover hover:text-foreground"
            >
              +
            </button>
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
        <CheckboxGroup
          legend={t('workCategories')}
          name="categoryIds"
          options={categories}
          selected={initial.categoryIds}
        />
        <div className="sm:col-span-2">
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

      <Section title={t('addressSection')}>
        <div className="sm:col-span-2">
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

      <Section title={t('planningSection')}>
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

      <Section title={t('assignmentSection')}>
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

      {extraSection}

      <Section title={t('descriptionSection')}>
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
      </Section>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error === 'saveFailed' ? tc('saveFailed') : t(state.error)}
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
          href={cancelHref}
          className={btn.outline}
        >
          {tc('cancel')}
        </Link>
      </div>
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

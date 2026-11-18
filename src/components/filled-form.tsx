'use client'

/**
 * A form on a project, filled in and signed — on the office's screen, or on
 * the tablet the site manager hands to the customer.
 *
 * While nobody has signed, the fields are open and saved with one button (and
 * before any signature, so nobody signs what is not stored). From the first
 * signature on they are read only: a signature stands for what was on the
 * sheet. The office can take a signature away to correct something; the form
 * is then signed again.
 *
 * A photo field takes pictures the way the site's own photos are taken: each
 * one goes onto the project as a file the moment it is chosen (drawn smaller
 * first), and the form keeps the file's id. Taking a photo off the form leaves
 * the file on the project.
 *
 * The sheet reads the way the paper does: fixed texts between the fields, a
 * unit or the rest of a sentence after a value, two half fields side by side,
 * and a signature box where the paper has it — whoever the form places nowhere
 * signs at the end.
 */

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Camera, Check, Download, FileText, Lock, PenLine, Plus, Trash2, X } from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { btn } from '@/components/ui/button'
import { SignaturePad } from '@/components/signature-pad'
import { saveForm, signForm, unsignForm } from '@/app/form-actions'
import { uploadProjectPhoto } from '@/lib/photo-upload'
import {
  FIELD_LONGTEXT_MAX,
  FIELD_TEXT_MAX,
  MAX_PHOTOS,
  MAX_ROWS,
  signaturePlaces,
  type FormField,
  type FormStatus,
  type FormValue,
  type FormValues,
} from '@/lib/forms'

export type FormSignatureView = {
  slot: number
  role: string
  name: string
  /** PNG, base64. */
  image: string
  /** When, already formatted. */
  when: string
}

const list = (value: FormValue | undefined): string[] => (Array.isArray(value) ? (value as string[]) : [])
const rows = (value: FormValue | undefined): string[][] => (Array.isArray(value) ? (value as string[][]) : [])

export function FilledFormEditor({
  formId,
  projectId,
  fields,
  values: initial,
  signers,
  signatures,
  status,
  intact,
  office,
}: {
  formId: string
  /** The project the form is on — where a photo field's pictures are filed. */
  projectId: string
  fields: FormField[]
  values: FormValues
  signers: string[]
  signatures: FormSignatureView[]
  status: FormStatus
  /** False when the content no longer fits a signature's digest. */
  intact: boolean
  /** The office may take a signature away again. */
  office: boolean
}) {
  const t = useTranslations('forms')
  const tc = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<FormValues>(initial)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signing, setSigning] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [drawn, setDrawn] = useState<string | null>(null)
  const [removing, setRemoving] = useState<FormSignatureView | null>(null)
  /** The photo field whose pictures are on their way up, and what went wrong with the last one. */
  const [uploading, setUploading] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const locked = signatures.length > 0
  const input =
    'mt-1 block w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-base focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-subtle disabled:text-foreground disabled:opacity-100'
  const cell =
    'block w-full rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-subtle disabled:text-foreground disabled:opacity-100'

  const set = (id: string, value: FormValue) => {
    setValues((v) => ({ ...v, [id]: value }))
    setDirty(true)
    setSaved(false)
  }

  const say = (code: string | undefined, missing?: string[]) =>
    setError(
      code === 'incomplete'
        ? t('errorIncomplete', { fields: (missing ?? []).join(', ') })
        : code === 'badNumber'
          ? t('errorNumber', { fields: (missing ?? []).join(', ') })
        : code === 'locked'
          ? t('errorLocked')
          : code === 'alreadySigned'
            ? t('errorAlreadySigned')
            : code === 'nameRequired'
              ? t('errorName')
              : code === 'badSignature'
                ? t('errorSignature')
                : code === 'notAllowed'
                  ? t('errorNotAllowed')
                  : tc('saveFailed')
    )

  const save = (then?: () => void) => {
    setError(null)
    startTransition(async () => {
      const result = await saveForm(formId, values)
      if (result.error) return say(result.error, result.missing)
      setDirty(false)
      setSaved(true)
      router.refresh()
      then?.()
    })
  }

  /** Nobody signs what is not stored: what was typed is saved first. */
  const openPad = (slot: number) => {
    const open = () => {
      setName('')
      setDrawn(null)
      setError(null)
      setSigning(slot)
    }
    if (dirty && !locked) save(open)
    else open()
  }

  const sign = () => {
    if (signing === null) return
    if (!name.trim()) return say('nameRequired')
    if (!drawn) return say('badSignature')
    setError(null)
    startTransition(async () => {
      const result = await signForm(formId, signing, name, drawn)
      if (result.error) return say(result.error, result.missing)
      setSigning(null)
      router.refresh()
    })
  }

  /** The chosen pictures onto the project, one after the other, each one's id onto the field as it lands. */
  const addPhotos = async (f: FormField, files: FileList | null) => {
    if (!files || files.length === 0) return
    setPhotoError(null)
    setUploading(f.id)
    let count = list(values[f.id]).length
    for (const file of Array.from(files)) {
      if (count >= MAX_PHOTOS) {
        setPhotoError(t('photoLimit', { max: MAX_PHOTOS }))
        break
      }
      const result = await uploadProjectPhoto(projectId, file, undefined, true)
      if ('error' in result) {
        setPhotoError(t('photoFailed'))
        continue
      }
      count++
      // Added to the field as it stands now: a photo taken off while the others were on their way stays off.
      setValues((v) => ({ ...v, [f.id]: [...list(v[f.id]), result.id] }))
      setDirty(true)
      setSaved(false)
    }
    setUploading(null)
    const el = fileInputs.current[f.id]
    if (el) el.value = ''
  }

  const places = signaturePlaces(fields, signers)

  /** One signer's box: the drawing and who signed, or the button to sign. */
  const signatureBox = (slot: number) => {
    const role = signers[slot]
    const signature = signatures.find((s) => s.slot === slot)
    return (
      <div key={slot} className="rounded-lg border border-border p-3">
        <p className="text-sm font-semibold">{role}</p>
        {signature ? (
          <>
            <div className="mt-2 flex h-24 items-end justify-center rounded-md bg-white p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/png;base64,${signature.image}`} alt={t('signatureOf', { name: signature.name })} className="max-h-full max-w-full object-contain" />
            </div>
            <p className="mt-2 text-sm">{signature.name}</p>
            <p className="text-xs text-muted">{t('signedAt', { when: signature.when })}</p>
            {office && (
              <button type="button" onClick={() => setRemoving(signature)} disabled={pending} className="mt-2 text-xs text-muted hover:text-danger hover:underline">
                {t('signatureRemove')}
              </button>
            )}
          </>
        ) : (
          <button type="button" onClick={() => openPad(slot)} disabled={pending || uploading !== null} className={`${btn.primary} mt-3 w-full gap-2`}>
            <PenLine className="h-4 w-4" aria-hidden />
            {t('sign')}
          </button>
        )}
      </div>
    )
  }

  /** A fixed text: its paragraphs as written, a line starting "• " or "- " as a point of a list. */
  const fixedText = (body: string) =>
    body.split('\n').map((line, i) => {
      const point = /^\s*[•\-–]\s+/.exec(line)
      if (point)
        return (
          <p key={i} className="flex gap-2 pl-1">
            <span aria-hidden>•</span>
            <span>{line.slice(point[0].length)}</span>
          </p>
        )
      return line.trim() ? <p key={i}>{line}</p> : <div key={i} className="h-2" />
    })

  const field = (f: FormField) => {
    // Half fields share a row on a wide screen; everything else spans it.
    const span = f.half ? '' : 'sm:col-span-2'
    if (f.type === 'heading') {
      return (
        <h2 key={f.id} className={`${span} border-b border-border pb-1 pt-3 text-base font-semibold first:pt-0`}>
          {f.label}
        </h2>
      )
    }
    if (f.type === 'pagebreak') return <hr key={f.id} className={`${span} border-dashed border-border`} />
    if (f.type === 'info') {
      return (
        <div key={f.id} className={`${span} space-y-1 text-sm leading-relaxed`}>
          {f.label && <p className="font-semibold">{f.label}</p>}
          {f.body && fixedText(f.body)}
        </div>
      )
    }
    if (f.type === 'signatures') {
      const slots = places.get(f.id) ?? []
      if (slots.length === 0) return null
      return (
        <div key={f.id} className={span}>
          {f.label && <p className="mb-2 text-sm font-semibold">{f.label}</p>}
          <div className="grid gap-4 sm:grid-cols-2">{slots.map(signatureBox)}</div>
          {!locked && <p className="mt-2 text-xs text-muted">{t('signaturesHint')}</p>}
        </div>
      )
    }
    const id = `field-${f.id}`
    const label = f.label ? (
      <>
        {f.label}
        {f.required && <span className="text-danger"> *</span>}
      </>
    ) : null
    if (f.type === 'checkbox') {
      return (
        <label key={f.id} htmlFor={id} className={`${span} flex items-start gap-3 py-1 text-base`}>
          <input
            id={id}
            type="checkbox"
            checked={values[f.id] === true}
            disabled={locked}
            onChange={(e) => set(f.id, e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
          />
          <span>{label}</span>
        </label>
      )
    }
    if (f.type === 'multi') {
      // Several answers at once, kept in the order the template names them.
      const chosen = list(values[f.id])
      const toggle = (option: string) =>
        set(
          f.id,
          (f.options ?? []).filter((o) => (o === option ? !chosen.includes(o) : chosen.includes(o)))
        )
      return (
        <div key={f.id} className={span}>
          {label && <p className="block text-sm font-medium">{label}</p>}
          <div className="mt-1 space-y-1.5">
            {(f.options ?? []).map((option) => (
              <label key={option} className="flex items-start gap-3 text-base">
                <input
                  type="checkbox"
                  checked={chosen.includes(option)}
                  disabled={locked}
                  onChange={() => toggle(option)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </div>
      )
    }
    if (f.type === 'table') {
      const columns = f.options ?? []
      const current = rows(values[f.id])
      // A table of the template's own rows: its words stand, only the gaps are written in, and it keeps its rows.
      const fixed = (r: number, c: number) => Boolean(f.rows?.[r]?.[c])
      const own = !locked && !f.rows
      const change = (r: number, c: number, text: string) => set(f.id, current.map((row, i) => (i === r ? row.map((v, j) => (j === c ? text : v)) : row)))
      return (
        <div key={f.id} className={span}>
          {label && <p className="block text-sm font-medium">{label}</p>}
          {current.length === 0 ? (
            <p className="mt-1 text-sm text-muted">{t('tableEmpty')}</p>
          ) : (
            <div className="mt-1 overflow-x-auto">
              <table className="w-full min-w-[24rem] border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column} className="px-2 text-left text-xs font-semibold text-muted">
                        {column}
                      </th>
                    ))}
                    {own && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {current.map((row, r) => (
                    <tr key={r}>
                      {columns.map((column, c) => (
                        <td key={column} className="align-top">
                          {fixed(r, c) ? (
                            <span className="block px-2 py-1.5">{row[c]}</span>
                          ) : (
                            <input
                              aria-label={`${column} ${r + 1}`}
                              value={row[c] ?? ''}
                              maxLength={FIELD_TEXT_MAX}
                              disabled={locked}
                              onChange={(e) => change(r, c, e.target.value)}
                              className={cell}
                            />
                          )}
                        </td>
                      ))}
                      {own && (
                        <td className="align-top">
                          <button
                            type="button"
                            onClick={() => set(f.id, current.filter((_, i) => i !== r))}
                            aria-label={t('tableRemoveRow')}
                            title={t('tableRemoveRow')}
                            className="flex h-9 w-8 items-center justify-center rounded-md text-muted hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {own && (
            <button
              type="button"
              disabled={current.length >= MAX_ROWS}
              onClick={() => set(f.id, [...current, columns.map(() => '')])}
              className={`${btn.outlineSm} mt-2 gap-1`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {t('tableAddRow')}
            </button>
          )}
        </div>
      )
    }
    if (f.type === 'photo') {
      const ids = list(values[f.id])
      const busy = uploading === f.id
      return (
        <div key={f.id} className={span}>
          <p className="block text-sm font-medium">{label}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {ids.map((docId) => (
              <div key={docId} className="relative">
                {/* The project's own file, served by the app; nothing to optimise. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${docId}`} alt="" className="h-24 w-24 rounded-md border border-border object-cover" />
                {!locked && (
                  <button
                    type="button"
                    onClick={() => set(f.id, ids.filter((x) => x !== docId))}
                    aria-label={t('photoRemove')}
                    title={t('photoRemove')}
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-muted hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            ))}
            {!locked && ids.length < MAX_PHOTOS && (
              <label
                className={`flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted hover:bg-surface-hover ${
                  busy ? 'pointer-events-none opacity-60' : ''
                }`}
              >
                <Camera className="h-5 w-5" aria-hidden />
                {busy ? t('photoUploading') : t('photoAdd')}
                <input
                  ref={(el) => {
                    fileInputs.current[f.id] = el
                  }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="sr-only"
                  onChange={(e) => void addPhotos(f, e.target.files)}
                />
              </label>
            )}
          </div>
          {photoError && uploading === null && (
            <p role="alert" className="mt-1 text-sm text-danger">
              {photoError}
            </p>
          )}
        </div>
      )
    }
    const value = typeof values[f.id] === 'string' ? (values[f.id] as string) : ''
    return (
      <div key={f.id} className={span}>
        {label && (
          <label htmlFor={id} className="block text-sm font-medium">
            {label}
          </label>
        )}
        {f.type === 'longtext' ? (
          <textarea
            id={id}
            rows={Math.min(10, Math.max(3, value.split('\n').length + 1))}
            maxLength={FIELD_LONGTEXT_MAX}
            value={value}
            disabled={locked}
            onChange={(e) => set(f.id, e.target.value)}
            className={`${input} resize-y`}
          />
        ) : f.type === 'choice' ? (
          <div className="mt-1 space-y-1.5">
            {(f.options ?? []).map((option) => (
              <label key={option} className="flex items-start gap-3 text-base">
                <input
                  type="radio"
                  name={id}
                  checked={value === option}
                  disabled={locked}
                  onChange={() => set(f.id, option)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <input
              id={id}
              type={f.type === 'date' ? 'date' : 'text'}
              inputMode={f.type === 'number' ? 'decimal' : undefined}
              maxLength={f.type === 'date' ? undefined : f.type === 'number' ? 24 : FIELD_TEXT_MAX}
              value={value}
              disabled={locked}
              onChange={(e) => set(f.id, e.target.value)}
              className={`${input} ${f.type === 'number' || f.type === 'date' ? 'max-w-xs tabular-nums' : ''}`}
            />
            {f.suffix && <span className="shrink-0 text-base text-muted">{f.suffix}</span>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* What state the sheet is in, and the sheet itself as a PDF */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            status === 'signed'
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
              : status === 'partly'
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                : 'bg-subtle text-muted'
          }`}
        >
          {status === 'signed' ? <Check className="h-3.5 w-3.5" aria-hidden /> : locked ? <Lock className="h-3.5 w-3.5" aria-hidden /> : null}
          {status === 'signed' ? t('statusSigned') : status === 'partly' ? t('statusPartly', { done: signatures.length, total: signers.length }) : t('statusDraft')}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a href={`/api/forms/${formId}/pdf`} target="_blank" className={`${btn.outlineSm} gap-1.5`}>
            <FileText className="h-4 w-4" aria-hidden />
            {t('pdfOpen')}
          </a>
          <a href={`/api/forms/${formId}/pdf?download=1`} className={`${btn.outlineSm} gap-1.5`}>
            <Download className="h-4 w-4" aria-hidden />
            {t('pdfDownload')}
          </a>
        </div>
      </div>
      {!intact && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {t('notIntact')}
        </p>
      )}
      {locked && <p className="text-sm text-muted">{office ? t('lockedHintOffice') : t('lockedHint')}</p>}

      <div className="grid gap-x-6 gap-y-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">{fields.map(field)}</div>

      {!locked && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => save()} disabled={pending || !dirty || uploading !== null} className={btn.primary}>
            {tc('save')}
          </button>
          {saved && !dirty && <span className="text-sm text-emerald-700 dark:text-emerald-400">{t('saved')}</span>}
          {dirty && <span className="text-sm text-muted">{t('unsaved')}</span>}
        </div>
      )}

      {/* The signatures the form places nowhere else: one box for each, under all fields */}
      {(places.get('end') ?? []).length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">{t('signatures')}</h2>
          <p className="mt-0.5 text-sm text-muted">{t('signaturesHint')}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">{(places.get('end') ?? []).map(signatureBox)}</div>
        </section>
      )}

      {error && signing === null && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {/* The pad, over everything: the whole screen belongs to the hand that signs */}
      {signing !== null && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6">
          <div role="dialog" aria-modal="true" aria-label={t('sign')} className="w-full max-w-2xl rounded-t-2xl border border-border bg-background p-5 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{signers[signing]}</h2>
                <p className="text-sm text-muted">{t('signHint')}</p>
              </div>
              <button type="button" onClick={() => setSigning(null)} aria-label={tc('cancel')} className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <label htmlFor="signer-name" className="mt-4 block text-sm font-medium">
              {t('signerName')} <span className="text-danger">*</span>
            </label>
            <input id="signer-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" className={input} />
            <div className="mt-4">
              <SignaturePad onChange={setDrawn} clearLabel={t('signatureClear')} hint={t('signHere')} />
            </div>
            {error && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setSigning(null)} className={btn.outline}>
                {tc('cancel')}
              </button>
              <button type="button" onClick={sign} disabled={pending || !drawn || !name.trim()} className={btn.primary}>
                {pending ? t('signing') : t('signConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={removing !== null}
        title={t('signatureRemoveTitle')}
        description={removing ? t('signatureRemoveBody', { role: removing.role, name: removing.name }) : ''}
        confirmLabel={t('signatureRemove')}
        cancelLabel={tc('cancel')}
        destructive
        pending={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing
          setRemoving(null)
          if (!target) return
          setError(null)
          startTransition(async () => {
            const result = await unsignForm(formId, target.slot)
            if (result.error) return say(result.error)
            router.refresh()
          })
        }}
      />
    </div>
  )
}

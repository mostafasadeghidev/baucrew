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
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Download, FileText, Lock, PenLine, X } from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { btn } from '@/components/ui/button'
import { SignaturePad } from '@/components/signature-pad'
import { saveForm, signForm, unsignForm } from '@/app/form-actions'
import { FIELD_LONGTEXT_MAX, FIELD_TEXT_MAX, type FormField, type FormStatus, type FormValues } from '@/lib/forms'

export type FormSignatureView = {
  slot: number
  role: string
  name: string
  /** PNG, base64. */
  image: string
  /** When, already formatted. */
  when: string
}

export function FilledFormEditor({
  formId,
  fields,
  values: initial,
  signers,
  signatures,
  status,
  intact,
  office,
}: {
  formId: string
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

  const locked = signatures.length > 0
  const input =
    'mt-1 block w-full rounded-md border border-border bg-background px-3 py-2.5 text-base focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-subtle disabled:text-foreground disabled:opacity-100'

  const set = (id: string, value: string | boolean) => {
    setValues((v) => ({ ...v, [id]: value }))
    setDirty(true)
    setSaved(false)
  }

  const say = (code: string | undefined, missing?: string[]) =>
    setError(
      code === 'incomplete'
        ? t('errorIncomplete', { fields: (missing ?? []).join(', ') })
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
      if (result.error) return say(result.error)
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

  const field = (f: FormField) => {
    if (f.type === 'heading') {
      return (
        <h2 key={f.id} className="border-b border-border pb-1 pt-3 text-base font-semibold first:pt-0">
          {f.label}
        </h2>
      )
    }
    const id = `field-${f.id}`
    const label = (
      <>
        {f.label}
        {f.required && <span className="text-danger"> *</span>}
      </>
    )
    if (f.type === 'checkbox') {
      return (
        <label key={f.id} htmlFor={id} className="flex items-start gap-3 py-1 text-base">
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
    const value = typeof values[f.id] === 'string' ? (values[f.id] as string) : ''
    return (
      <div key={f.id}>
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
        </label>
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
          <input
            id={id}
            type={f.type === 'date' ? 'date' : 'text'}
            maxLength={f.type === 'date' ? undefined : FIELD_TEXT_MAX}
            value={value}
            disabled={locked}
            onChange={(e) => set(f.id, e.target.value)}
            className={input}
          />
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

      <div className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm">{fields.map(field)}</div>

      {!locked && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => save()} disabled={pending || !dirty} className={btn.primary}>
            {tc('save')}
          </button>
          {saved && !dirty && <span className="text-sm text-emerald-700 dark:text-emerald-400">{t('saved')}</span>}
          {dirty && <span className="text-sm text-muted">{t('unsaved')}</span>}
        </div>
      )}

      {/* The signatures: one box for everybody the form names */}
      {signers.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-base font-semibold">{t('signatures')}</h2>
          <p className="mt-0.5 text-sm text-muted">{t('signaturesHint')}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {signers.map((role, slot) => {
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
                    <button type="button" onClick={() => openPad(slot)} disabled={pending} className={`${btn.primary} mt-3 w-full gap-2`}>
                      <PenLine className="h-4 w-4" aria-hidden />
                      {t('sign')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
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

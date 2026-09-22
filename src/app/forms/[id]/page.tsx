import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { ArrowLeft } from 'lucide-react'
import { isOffice, requireUser } from '@/lib/authz'
import { getBranding } from '@/lib/branding'
import { canWorkOn } from '@/lib/crew-access'
import { loadFilledForm } from '@/lib/forms-db'
import { BrandMark } from '@/components/brand-mark'
import { FilledFormEditor } from '@/components/filled-form'
import { DeleteFormButton } from './delete-form-button'

/**
 * One form of a project, on a page of its own: it is filled in and signed on
 * whatever is at hand — the office's screen, the site manager's tablet, a
 * phone — so it stands outside the office's frame, large and with nothing
 * around it that a customer holding the device could wander into.
 *
 * The office sees every form; the crew those of the projects it works on. A
 * form carries no prices.
 */
export default async function FormPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const [form, t, locale, branding] = await Promise.all([loadFilledForm(id), getTranslations('forms'), getLocale(), getBranding()])
  if (!form) notFound()
  // The office may take a signature away; a site manager fills in and signs like the crew, on their own sites.
  const office = isOffice(user)
  const staff = user.role !== 'EMPLOYEE'
  if (!(await canWorkOn(user, form.projectId))) redirect(staff ? '/projects' : '/my')

  const stamp = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' })
  const back = staff ? `/projects/${form.projectId}` : '/my'

  return (
    <div className="mx-auto min-h-screen max-w-3xl">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
        <Link href={back} className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {staff ? t('backToProject') : t('backToMy')}
        </Link>
        <BrandMark hasLogo={branding.hasLogo} name={branding.companyName} imgClassName="h-7" />
      </header>
      <main className="space-y-4 p-4 pb-16">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{form.title}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {form.project.number} — {form.project.name}
            </p>
          </div>
          {office && <DeleteFormButton formId={form.id} title={form.title} back={back} signed={form.signatures.length > 0} />}
        </div>
        <FilledFormEditor
          // A signature put on, or taken away, is another state of the whole
          // sheet, and the editor starts over with it. A save is not: the
          // editor holds what was typed, and starting over would close the
          // signature pad that the save was the first step of.
          key={form.signatures.map((s) => s.slot).join('-') || 'draft'}
          formId={form.id}
          fields={form.fields}
          values={form.values}
          signers={form.signers}
          signatures={form.signatures.map((s) => ({ slot: s.slot, role: s.role, name: s.name, image: s.image, when: stamp.format(s.signedAt) }))}
          status={form.status}
          intact={form.intact}
          office={office}
        />
      </main>
    </div>
  )
}

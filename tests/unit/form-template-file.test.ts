import { describe, expect, it } from 'vitest'
import { TEMPLATE_FILE_KIND, readTemplateFile, templateFile } from '@/lib/form-template-file'

const musterTemplate = {
  name: 'Musterprotokoll',
  description: 'Ein erfundenes Beispiel',
  fields: [
    { id: 'intro', type: 'info', label: '', body: 'Mustertext' },
    { id: 'site', type: 'text', label: 'Baustelle:', prefill: 'siteAddress' },
  ],
  signers: ['Auftraggeber', 'Auftragnehmer'],
  financial: true,
}

describe('form template files', () => {
  it('reads back what it writes', () => {
    const file = JSON.parse(JSON.stringify(templateFile([musterTemplate])))
    expect(file.kind).toBe(TEMPLATE_FILE_KIND)
    const read = readTemplateFile(file)
    expect(read).toEqual({ templates: [{ ...musterTemplate }], skipped: [] })
  })

  it('takes nothing that is not a file of templates, or from a newer version', () => {
    expect(readTemplateFile(null)).toEqual({ error: 'notAFile' })
    expect(readTemplateFile([musterTemplate])).toEqual({ error: 'notAFile' })
    expect(readTemplateFile({ kind: 'other', version: 1, templates: [] })).toEqual({ error: 'notAFile' })
    expect(readTemplateFile({ kind: TEMPLATE_FILE_KIND, version: 99, templates: [] })).toEqual({ error: 'newerVersion' })
  })

  it('skips a template without a name or a usable field, and puts the rest through the editor\'s rules', () => {
    const read = readTemplateFile({
      kind: TEMPLATE_FILE_KIND,
      version: 1,
      templates: [
        { name: '', fields: musterTemplate.fields },
        { name: 'Leer', fields: [{ type: 'video', label: 'Film' }] },
        { name: '  Muster  ', fields: [{ type: 'text', label: 'Ort', bogus: true }], signers: ['A', 'A', ''] },
      ],
    })
    expect(read).toEqual({
      templates: [{ name: 'Muster', description: null, fields: [{ id: 'f1', type: 'text', label: 'Ort' }], signers: ['A'], financial: false }],
      skipped: ['#1', 'Leer'],
    })
  })
})

import { describe, expect, it } from 'vitest'
// The one-off script that marks hand-made Wattro sites finished is plain Node
// (it runs inside the production container); its rules are tested here.
import * as script from '../../scripts/wattro-close-sites.mjs'

const site = (over: Record<string, unknown> = {}) => ({
  id: 45,
  human_id: 'P45',
  name: 'Muster Erika',
  finished: false,
  unfinished_deployment_count: 0,
  finished_deployment_count: 3,
  ...over,
})

describe('close script: which sites it leaves alone', () => {
  const none = new Set<string>()

  it('closes an open hand-made site with no machine on it', () => {
    expect(script.whyNotClose(site(), none)).toBeNull()
  })

  it('leaves a site with a machine on it', () => {
    expect(script.whyNotClose(site({ unfinished_deployment_count: 1 }), none)).toBe('1 machine is booked to it')
    expect(script.whyNotClose(site({ unfinished_deployment_count: 6 }), none)).toBe('6 machines are booked to it')
  })

  it('leaves a site when Wattro does not say how many machines are on it', () => {
    expect(script.whyNotClose(site({ unfinished_deployment_count: undefined }), none)).toMatch(/does not say/)
    expect(script.whyNotClose(site({ unfinished_deployment_count: null }), none)).toMatch(/does not say/)
    expect(script.whyNotClose(site({ unfinished_deployment_count: '0' }), none)).toMatch(/does not say/)
  })

  it('leaves a site one of the app\'s own projects is linked to', () => {
    expect(script.whyNotClose(site(), new Set(['45']))).toBe('a project here is linked to it')
    expect(script.whyNotClose(site(), new Set(['46']))).toBeNull()
  })

  it('leaves a site that is finished already, and one that is not there', () => {
    expect(script.whyNotClose(site({ finished: true }), none)).toBe('finished already')
    expect(script.whyNotClose(undefined, none)).toBe('no such site in Wattro')
  })
})

describe('close script: arguments and limits', () => {
  it('writes nothing unless --apply is given', () => {
    expect(script.parseArgs(['--numbers=P4,P6'])).toEqual({ numbers: ['P4', 'P6'], apply: false })
    expect(script.parseArgs(['--numbers=P4', '--apply'])).toEqual({ numbers: ['P4'], apply: true })
  })

  it('tidies the list: spaces, empties and repeats', () => {
    expect(script.parseArgs(['--numbers= P4, ,P6,P4,'])).toEqual({ numbers: ['P4', 'P6'], apply: false })
  })

  it('has no sites when none are given', () => {
    expect(script.parseArgs([])).toEqual({ numbers: [], apply: false })
  })

  it('caps one run at 15 sites', () => {
    expect(script.MAX_NUMBERS).toBe(15)
  })
})

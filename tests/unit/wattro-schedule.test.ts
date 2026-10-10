import { describe, expect, it } from 'vitest'
import { isSyncDue, syncIntervalMinutes } from '@/lib/wattro/schedule'

describe('syncIntervalMinutes', () => {
  it('runs every hour in production when nothing is set', () => {
    expect(syncIntervalMinutes(undefined, true)).toBe(60)
    expect(syncIntervalMinutes('  ', true)).toBe(60)
  })

  it('stays off on a development server unless asked to run', () => {
    expect(syncIntervalMinutes(undefined, false)).toBe(0)
    expect(syncIntervalMinutes('30', false)).toBe(30)
  })

  it('turns automatic runs off with 0', () => {
    expect(syncIntervalMinutes('0', true)).toBe(0)
  })

  it('raises a too short interval to the minimum and rounds', () => {
    expect(syncIntervalMinutes('1', true)).toBe(15)
    expect(syncIntervalMinutes('90.4', true)).toBe(90)
  })

  it('falls back to the hour for something unreadable', () => {
    expect(syncIntervalMinutes('hourly', true)).toBe(60)
    expect(syncIntervalMinutes('-5', true)).toBe(60)
  })
})

describe('isSyncDue', () => {
  const now = new Date('2026-10-06T12:00:00Z')
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000)

  it('runs when Wattro was never read', () => {
    expect(isSyncDue(null, now, 60)).toBe(true)
  })

  it('waits until the interval is up', () => {
    expect(isSyncDue(ago(30), now, 60)).toBe(false)
    expect(isSyncDue(ago(61), now, 60)).toBe(true)
  })

  it('does not skip an hour when the cron fires a little before the full hour', () => {
    expect(isSyncDue(ago(57), now, 60)).toBe(true)
    expect(isSyncDue(ago(54), now, 60)).toBe(false)
  })

  it('never runs when automatic runs are off', () => {
    expect(isSyncDue(null, now, 0)).toBe(false)
  })
})

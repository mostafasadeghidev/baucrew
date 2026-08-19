/**
 * A project is usually planned as a block of consecutive days. Editing one of
 * those days with a "to" date should shorten or extend the whole block, not
 * just add days — so we need to know which days belong to it.
 *
 * Consecutive tolerates a weekend gap (Friday → Monday) but stops at a real
 * pause, so a separate assignment a week later is never touched. Pure.
 */
const DAY = 86_400_000

function toUtc(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getTime()
}

/** Days of `planned` that form one block together with `start` (sorted ISO days). */
export function assignmentBlock(planned: string[], start: string, maxGapDays = 3): string[] {
  if (!planned.includes(start)) return [start]
  const sorted = [...new Set(planned)].sort()
  const block = [start]
  // forward
  let previous = start
  for (const day of sorted.filter((d) => d > start)) {
    if ((toUtc(day) - toUtc(previous)) / DAY > maxGapDays) break
    block.push(day)
    previous = day
  }
  // backward
  previous = start
  for (const day of sorted.filter((d) => d < start).reverse()) {
    if ((toUtc(previous) - toUtc(day)) / DAY > maxGapDays) break
    block.unshift(day)
    previous = day
  }
  return block
}

/** Last day of the block that contains `start`. */
export function blockEnd(planned: string[], start: string, maxGapDays = 3): string {
  const block = assignmentBlock(planned, start, maxGapDays)
  return block[block.length - 1]
}

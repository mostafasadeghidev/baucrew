import { db } from './db'
import { EXTRA_SKILLS_KEY, parseExtraSkills, serializeExtraSkills } from './extra-skills'

/** The skills written down before anybody has them. */
export async function getExtraSkills(): Promise<string[]> {
  try {
    const row = await db.appSetting.findUnique({ where: { key: EXTRA_SKILLS_KEY } })
    return parseExtraSkills(row?.value)
  } catch {
    return []
  }
}

export async function setExtraSkills(names: string[]): Promise<void> {
  const value = serializeExtraSkills(names)
  await db.appSetting.upsert({
    where: { key: EXTRA_SKILLS_KEY },
    update: { value },
    create: { key: EXTRA_SKILLS_KEY, value },
  })
}

import { db } from './db'
import { parseOptionList, type OptionEntry, type OptionList } from './option-lists'

/** All three option lists in one query (used by the project form and settings). */
export async function getOptionLists(): Promise<Record<OptionList, OptionEntry[]>> {
  try {
    const rows = await db.appSetting.findMany({
      where: { key: { in: ['clientTypes', 'buildingTypes', 'itemKinds', 'leadSources'] } },
    })
    const value = (key: OptionList) => rows.find((r) => r.key === key)?.value
    return {
      clientTypes: parseOptionList('clientTypes', value('clientTypes')),
      buildingTypes: parseOptionList('buildingTypes', value('buildingTypes')),
      itemKinds: parseOptionList('itemKinds', value('itemKinds')),
      leadSources: parseOptionList('leadSources', value('leadSources')),
    }
  } catch {
    return {
      clientTypes: parseOptionList('clientTypes', null),
      buildingTypes: parseOptionList('buildingTypes', null),
      itemKinds: parseOptionList('itemKinds', null),
      leadSources: parseOptionList('leadSources', null),
    }
  }
}

export async function getOptionList(list: OptionList): Promise<OptionEntry[]> {
  return (await getOptionLists())[list]
}

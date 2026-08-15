# Änderung: Mehrere Fahrzeuge pro Einsatz (Multi-Vehicle Schedule Entries)

**Datum:** 15.08.2026
**Grund:** Der Inhaber möchte im Einsatzplanungs-Dialog mehrere Fahrzeuge
pro Einsatz auswählen können (Live-Suche + Mehrfachauswahl).
**Vorher:** Ein Einsatz (`ScheduleEntry`) hatte genau ein optionales Fahrzeug
(`vehicleId`). **Nachher:** Ein Einsatz hat 0…n Fahrzeuge über die
Verknüpfungstabelle `ScheduleEntryVehicle` — analog zu den Mitarbeitern
(`ScheduleEntryEmployee`).

Dieses Dokument listet **jede** berührte Stelle, damit die Änderung bei
Bedarf sauber zurückgebaut werden kann.

---

## 1. Datenbank

### 1.1 `prisma/schema.prisma`

| Vorher | Nachher |
|---|---|
| `model ScheduleEntry { … vehicleId String? ; vehicle Vehicle? @relation(fields:[vehicleId], references:[id], onDelete: SetNull) … }` | Felder `vehicleId` + `vehicle` entfernt; neu: `vehicles ScheduleEntryVehicle[]` |
| `model Vehicle { … scheduleEntries ScheduleEntry[] }` | `scheduleEntries ScheduleEntryVehicle[]` |
| — | **Neues Modell** `ScheduleEntryVehicle { scheduleEntryId, vehicleId, @@id([scheduleEntryId, vehicleId]), @@index([vehicleId]) }` mit `onDelete: Cascade` in beide Richtungen |

### 1.2 Migration `prisma/migrations/20260815120000_schedule_entry_vehicles/migration.sql`

Handgeschrieben (nicht von `prisma migrate dev` generiert), damit die
vorhandenen Zuordnungen **erhalten** bleiben:

1. `CREATE TABLE "ScheduleEntryVehicle"` + Index + zwei Foreign Keys
2. `INSERT INTO "ScheduleEntryVehicle" SELECT id, "vehicleId" FROM "ScheduleEntry" WHERE "vehicleId" IS NOT NULL`
   → 47 bestehende Zuordnungen wurden übernommen
3. `ALTER TABLE "ScheduleEntry" DROP CONSTRAINT "ScheduleEntry_vehicleId_fkey"; DROP COLUMN "vehicleId"`

---

## 2. Geänderte Quelldateien

| Datei | Was geändert wurde |
|---|---|
| `src/lib/schedule-conflicts.ts` | `ConflictEntry` hat jetzt `vehicles: { vehicle }[]` statt `vehicleId`/`vehicle`. Konflikt-Erkennung iteriert über alle Fahrzeuge eines Einsatzes (Doppelbelegung + „nicht verfügbar“ pro Fahrzeug). |
| `src/app/(admin)/schedule/actions.ts` | `EntryInput.vehicleId: string` → `vehicleIds: string[]`; Zod-Schema `vehicleIds: z.array(...).max(20)`; `createScheduleEntry`/`updateScheduleEntry` schreiben `vehicles: { create: [...] }` bzw. `deleteMany + create`. |
| `src/app/(admin)/schedule/page.tsx` | `ENTRY_INCLUDE`: `vehicle: {select}` → `vehicles: { include: { vehicle: {select} } }`; `BoardEntry`-Mapping: `vehicleId`/`vehicleName` → `vehicles: {id,name}[]`; Wochen-Übersicht sammelt Fahrzeugnamen aus `entry.vehicles`. |
| `src/app/(admin)/schedule/schedule-board.tsx` | `BoardEntry`-Typ: `vehicleId`/`vehicleName` → `vehicles[]`; Karte zeigt Fahrzeugnamen kommagetrennt; Dialog: `<select>` → `<MultiCombobox>` mit State `vehicleIds: string[]`; sendet `vehicleIds` an die Actions; neuer Hook `useTranslations('vehicles')`. |
| `src/components/multi-combobox.tsx` | **Neue Datei.** Wiederverwendbare Mehrfachauswahl mit Live-Suche und Chips (kontrolliert über `value`/`onChange`). |
| `src/app/(admin)/dashboard/page.tsx` | Include `vehicle: true` → `vehicles: { include: { vehicle: true } }`; Zähler „Fahrzeuge heute“ über `flatMap(e.vehicles)`; Anzeige kommagetrennt. |
| `src/app/today/page.tsx` | Include auf `vehicles`; Sortierung `vehicle.name` → `startTime`; Kartentitel zeigt `"Götze Bus + Transporter"`. |
| `src/app/my/page.tsx` | Beide Queries auf `vehicles`; Anzeige kommagetrennt (heute + kommende Einsätze). |
| `src/app/(admin)/projects/[id]/page.tsx` | `scheduleEntries.include.vehicle` → `vehicles`; Liste „Geplante Einsätze“ zeigt alle Fahrzeuge. |
| `src/app/(admin)/employees/[id]/page.tsx` | Verschachteltes Include auf `vehicles`; Anzeige kommagetrennt. |
| `src/app/(admin)/vehicles/[id]/page.tsx` | `vehicle.scheduleEntries` ist jetzt die Verknüpfungstabelle: `where/orderBy` über `scheduleEntry: {…}`, Include `scheduleEntry: { include: … }`, Alias `const upcoming = vehicle.scheduleEntries.map(sv => sv.scheduleEntry)`. |
| `src/app/(admin)/vehicles/actions.ts` | Lösch-Schutz: `db.scheduleEntry.count({ vehicleId })` → `db.scheduleEntryVehicle.count({ vehicleId, scheduleEntry: { date ≥ heute } })`. |
| `src/lib/reports.ts` | `getYearUsage`: Select `vehicle` → `vehicles: { select: { vehicle } }`; Zählung iteriert über alle Fahrzeuge (Einsatztage pro Fahrzeug). |
| `src/app/(admin)/settings/backup/route.ts` | Backup exportiert zusätzlich Tabelle `scheduleEntryVehicles`. |
| `src/app/(admin)/settings/actions.ts` (`restoreBackup`) | `BACKUP_TABLES` enthält `scheduleEntryVehicles`; Wiederherstellung schreibt `db.scheduleEntryVehicle.createMany(...)` nach `scheduleEntryEmployee`. |
| `prisma/seed.ts` | `vehicleId: …` → `vehicles: { create: [{ vehicleId }] }`. |
| `src/generated/prisma/**` | Automatisch regeneriert (`npx prisma generate`) — nicht manuell bearbeiten. |

**Nicht geändert (nur indirekt betroffen):** `src/app/(admin)/reports/page.tsx` und
`src/app/(admin)/reports/export/route.ts` lesen weiterhin `usage.vehicles`
aus `lib/reports.ts` — die Signatur blieb gleich.

Übersetzungen: **keine neuen Schlüssel** nötig (der Dialog nutzt vorhandene
`schedule.vehicle`, `schedule.noVehicle`, `vehicles.noResults`).

---

## 3. Rückbau auf „ein Fahrzeug pro Einsatz“ (falls gewünscht)

Empfohlene Reihenfolge — **vorher Backup ziehen** (Einstellungen → Datensicherung).

### 3.1 Daten sichern, die verloren gehen würden
Bei Einsätzen mit mehr als einem Fahrzeug bleibt beim Rückbau nur **eines**
erhalten. Vorab prüfen:

```sql
SELECT "scheduleEntryId", count(*) FROM "ScheduleEntryVehicle"
GROUP BY 1 HAVING count(*) > 1;
```

### 3.2 Neue Migration (Rückbau) — z. B. `…_revert_single_vehicle/migration.sql`

```sql
ALTER TABLE "ScheduleEntry" ADD COLUMN "vehicleId" TEXT;

-- pro Einsatz das erste Fahrzeug zurückschreiben
UPDATE "ScheduleEntry" se
SET "vehicleId" = sub."vehicleId"
FROM (
  SELECT DISTINCT ON ("scheduleEntryId") "scheduleEntryId", "vehicleId"
  FROM "ScheduleEntryVehicle" ORDER BY "scheduleEntryId", "vehicleId"
) sub
WHERE sub."scheduleEntryId" = se.id;

ALTER TABLE "ScheduleEntry"
  ADD CONSTRAINT "ScheduleEntry_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE "ScheduleEntryVehicle";
```

### 3.3 `schema.prisma` zurück
- In `ScheduleEntry`: `vehicles ScheduleEntryVehicle[]` entfernen, wieder
  `vehicleId String?` + `vehicle Vehicle? @relation(fields:[vehicleId], references:[id], onDelete: SetNull)`
- In `Vehicle`: `scheduleEntries ScheduleEntry[]`
- Modell `ScheduleEntryVehicle` löschen
- `npx prisma generate`

### 3.4 Code (Tabelle in Abschnitt 2 rückwärts anwenden)
- Überall `vehicles: { include: { vehicle } }` → `vehicle: …`, Anzeige `entry.vehicle?.name`
- `schedule/actions.ts`: `vehicleIds: string[]` → `vehicleId: string` (Schema, Input-Typ, create/update)
- `schedule-board.tsx`: `MultiCombobox` durch das frühere `<select>` (oder eine einfache `Combobox`) ersetzen, State `vehicleId: string`
- `schedule-conflicts.ts`: `ConflictEntry` wieder mit `vehicleId`/`vehicle`
- `vehicles/actions.ts`: Lösch-Schutz wieder `db.scheduleEntry.count({ vehicleId })`
- `vehicles/[id]/page.tsx`: direkte Relation ohne `scheduleEntry`-Ebene
- `reports.ts`, `dashboard`, `today`, `my`, `projects/[id]`, `employees/[id]`, `seed.ts`: analog
- Backup/Restore: `scheduleEntryVehicles` aus Tabellenliste und Restore-Reihenfolge entfernen
- `src/components/multi-combobox.tsx` kann gelöscht werden, falls sonst ungenutzt

### 3.5 Prüfen
```bash
npm run typecheck && npx eslint src prisma && npm run build
```
Der Typecheck zeigt zuverlässig jede vergessene Stelle an — genau so wurde
auch die Hin-Änderung abgesichert.

---

## 4. Verifikation der Hin-Änderung (Stand 15.08.2026)
- Migration angewendet, 47 Zuordnungen übernommen ✓
- Typecheck + ESLint fehlerfrei ✓
- Mehrfach-Zuordnung (Götze Bus + Transporter) per Skript geschrieben und in
  allen Query-Formen (Board, Tagesansicht) gelesen ✓

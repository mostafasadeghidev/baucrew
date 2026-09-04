# CHANGE: Benutzerkonten auf der Mitarbeiterseite (2026-08-15)

## Was geändert wurde
Benutzerkonten von Mitarbeitern werden jetzt **auf der Mitarbeiterseite** verwaltet
(Haken „Benutzerkonto aktivieren“ → Benutzername/Passwort/Rolle/Finanzfreigabe;
bei bestehendem Konto: Rolle, Finanzfreigabe, neues Passwort, aktiv/inaktiv, Kennzeichen).
*Einstellungen* zeigt nur noch **Systemkonten ohne Mitarbeiter** (admin, buero, lager, manager)
plus eine schreibgeschützte Übersicht **„Konten mit erweiterten Rechten“** (Admins + Finanzfreigabe).
Die Mitarbeiterliste hat eine neue Spalte **Konto**.

Datenmodell unverändert (weiterhin ein `User`-Modell, `Employee.userId`). Keine Migration.

## Berührte Dateien
- `src/app/(admin)/employees/actions.ts` — neu: `createEmployeeAccount`, `updateEmployeeAccount` (Admin-only, Audit, Session-Invalidierung bei Passwortwechsel, Selbstschutz)
- `src/app/(admin)/employees/[id]/account-section.tsx` — neu (Client-Komponente)
- `src/app/(admin)/employees/[id]/page.tsx` — Account-Section eingebunden, `requireManagement()` für Viewer-Rolle, Zeile „Benutzerkonto“ aus Kontaktdaten entfernt
- `src/app/(admin)/employees/page.tsx` — Spalte „Konto“
- `src/app/(admin)/settings/page.tsx` — Benutzertabelle → Systemkonten (Filter `!employee`) + Übersicht privilegierter Konten
- `messages/{de,en}.json` — Keys `employees.account*`, `settings.usersUnlinked*`, `settings.privileged*`, `settings.linkedEmployeeCol`, `settings.openEmployee`
- `docs/BENUTZERHANDBUCH.md` — Abschnitte Mitarbeiter/Einstellungen

Unverändert gelassen (bewusst): `settings/users/new` und `settings/users/[id]` inkl. Mitarbeiter-Picker —
damit können Altkonten weiterhin nachträglich verknüpft werden.

## Rollback
1. Die 6 oben genannten Code-Dateien auf den Stand vor dieser Änderung zurücksetzen
   (`account-section.tsx` löschen; in `settings/page.tsx` wieder `users` statt `systemUsers` rendern
   und den Abschnitt „privileged“ entfernen; in `employees/[id]/page.tsx` die dl-Zeile „linkedUser“
   wiederherstellen und `AccountSection`/`requireManagement` entfernen; in `employees/page.tsx`
   Spalte/Include `user` entfernen).
2. Die neuen Übersetzungs-Keys können bleiben (unbenutzt) oder entfernt werden.
3. Keine DB-Schritte nötig — bereits über die Mitarbeiterseite angelegte Konten sind normale `User`-Zeilen
   und weiterhin unter *Einstellungen → Benutzer* editierbar.

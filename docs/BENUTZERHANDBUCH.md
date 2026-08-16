# BauCrew — Benutzerhandbuch

*Version 1.0 · Stand: 16. August 2026*

Dieses Handbuch erklärt alle Bereiche der Anwendung Schritt für Schritt — für die Geschäftsführung, das Büro, das Lager und die Mitarbeiter auf der Baustelle. Die Oberfläche ist Deutsch (Standard) oder Englisch; die Bezeichnungen im Handbuch entsprechen der deutschen Oberfläche.

---

## Inhalt

1. [Grundprinzip](#1-grundprinzip)
2. [Anmeldung, Rollen und Rechte](#2-anmeldung-rollen-und-rechte)
3. [Bedienung: Sprache, Design, Menü, Suche, Speichern](#3-bedienung-sprache-design-menü-suche-speichern)
4. [Übersicht (Dashboard)](#4-übersicht-dashboard)
5. [Kunden](#5-kunden)
6. [Projekte](#6-projekte)
7. [Arbeitsauftrag (Druck / PDF / QR-Code)](#7-arbeitsauftrag-druck--pdf--qr-code)
8. [Vorlagen](#8-vorlagen)
9. [Mitarbeiter und Benutzerkonten](#9-mitarbeiter-und-benutzerkonten)
10. [Fahrzeuge](#10-fahrzeuge)
11. [Lager: Werkzeug- und Materialkatalog](#11-lager-werkzeug--und-materialkatalog)
12. [Einsatzplanung (Wochenplan)](#12-einsatzplanung-wochenplan)
13. [Tagesvorbereitung — Bildschirm im Lager](#13-tagesvorbereitung--bildschirm-im-lager)
14. [Mein Bereich — für Mitarbeiter](#14-mein-bereich--für-mitarbeiter)
15. [Berichte](#15-berichte)
16. [Einstellungen](#16-einstellungen)
17. [Typische Abläufe im Alltag](#17-typische-abläufe-im-alltag)
18. [Häufige Fragen](#18-häufige-fragen)
19. [Für den Administrator: Installation, Update, Sicherung](#19-für-den-administrator-installation-update-sicherung)

---

## 1. Grundprinzip

**Alles wird nur einmal eingegeben.** Das Projekt ist der zentrale Datensatz: Kunde, Baustellenadresse, Team, Fahrzeug, Werkzeug und Material, Termine, Auftragswert. Aus diesem einen Datensatz entstehen automatisch

- der Wochenplan (Einsatzplanung),
- der Bildschirm im Lager (was heute gepackt werden muss),
- der Arbeitsauftrag zum Ausdrucken,
- der Bereich für die Mitarbeiter (wer arbeitet heute wo),
- die Berichte und der Excel-Export.

Wird etwas geändert — z. B. ein Einsatz wegen Regen verschoben — sind alle Stellen sofort aktuell. Nichts muss doppelt gepflegt werden, nichts kann auseinanderlaufen.

---

## 2. Anmeldung, Rollen und Rechte

![Anmeldung](screenshots/01-login.png)

Anmeldung mit **Benutzername** und **Passwort**. Die Sitzung bleibt 30 Tage bestehen; „Abmelden“ oben rechts beendet sie sofort. Nach zu vielen Fehlversuchen ist die Anmeldung kurz gesperrt.

### Rollen

| | Administrator | Büro / Verwaltung | Mitarbeiter |
|---|---|---|---|
| Kunden, Projekte, Mitarbeiter, Fahrzeuge, Lager, Einsatzplanung, Vorlagen | ✓ | ✓ | – |
| **Auftragswerte, Umsätze, Kundenumsätze** | ✓ | nur mit Freigabe „Finanzdaten sichtbar“ | **niemals** |
| Projekte löschen | ✓ | – | – |
| Benutzerkonten anlegen / ändern / löschen | ✓ | – | – |
| Einstellungen (Systemkonten, Logo, Backup, Import, Kategorien) | ✓ | – | – |
| Mein Bereich, Tagesvorbereitung, Arbeitsauftrag | ✓ | ✓ | ✓ (nur eigene / anstehende Einsätze) |

Preise sind für Mitarbeiter nicht nur ausgeblendet, sondern werden gar nicht erst an ihr Gerät übertragen. Auch der Arbeitsauftrag enthält bewusst keine Preise und keine internen Notizen.

### Konten nach der Installation

| Benutzer | Rolle | Verwendung |
|---|---|---|
| `admin` | Administrator | Geschäftsführung — sieht und darf alles |
| `buero` | Büro / Verwaltung | Büro, ohne Preise (Freigabe möglich) |
| `lager` | Mitarbeiter | gemeinsames Konto für den Bildschirm im Lager |

Konten für Mitarbeiter werden **auf der Mitarbeiterseite** angelegt (Kapitel 9). Ein persönliches Administrator-Konto mit eigenem Namen anlegen und `admin` danach löschen ist möglich — siehe Kapitel 16.

> **Wichtig:** Alle Anfangs-Passwörter vor dem echten Betrieb ändern.

---

## 3. Bedienung: Sprache, Design, Menü, Suche, Speichern

- **Sprache:** oben rechts **DE | EN**. Deutsch ist Standard; die Auswahl gilt pro Gerät.
- **Design:** Symbol neben der Sprache → hell, dunkel oder Systemeinstellung.
- **Menü:** links; auf dem Handy über ☰ oben links.
- **Suche:** Alle Suchfelder filtern **sofort beim Tippen** — kein Suchen-Knopf. Auswahlfelder (Kunde, Projekt, Fahrzeug, Werkzeug, Ort …) sind ebenfalls durchsuchbar: einfach anfangen zu tippen. Wo es sinnvoll ist, kann direkt aus dem Feld ein neuer Eintrag angelegt werden („… als neuen Kunden anlegen“).
- **Listen** zeigen 20 Einträge pro Seite; unten kann geblättert werden. Filter setzen die Seite automatisch zurück.
- **Speichern:** Formulare, die zu einer Detailseite führen (Projekt, Kunde, Mitarbeiter, Fahrzeug …), öffnen diese nach dem Speichern. Formulare, die auf derselben Seite bleiben (Einstellungen, Benutzerkonto, Vorlage), bestätigen mit einem kurzen grünen **„✓ Gespeichert“** neben dem Knopf, das nach wenigen Sekunden verschwindet.
- **Dialogfenster** schließen nur über ✕ oder Abbrechen — nicht durch Klicken daneben — damit nichts versehentlich verloren geht.

---

## 4. Übersicht (Dashboard)

![Übersicht](screenshots/02-dashboard.png)

Die Startseite beantwortet die Tagesfragen auf einen Blick:

- **Kennzahlen** (anklickbar): laufende / geplante Projekte, Mitarbeiter und Fahrzeuge heute im Einsatz, Kunden.
- **⚠ Konflikte diese Woche:** Mitarbeiter oder Fahrzeuge, die am selben Tag mit überschneidenden Zeiten doppelt eingeplant sind, oder Fahrzeuge, die nicht verfügbar sind. Gelb = Handlungsbedarf, ✓ = alles frei.
- **Wetter:** Regenwarnungen (≥ 60 % Regenwahrscheinlichkeit, bis 16 Tage im Voraus) für Einsätze mit Außenarbeiten (Außenfassade, WDVS, Gerüstbau).
- **Bereitstellung heute:** Fortschritt der Lagervorbereitung je heutigem Einsatz („2 von 4 gepackt · 1 fehlt“).
- **Projekte mit offener Zuordnung:** anstehende Projekte ohne Team oder ohne Fahrzeug.
- **Heutige Einsätze:** Uhrzeit, Projekt, Kunde, Fahrzeug, Team.

---

## 5. Kunden

![Kunden](screenshots/07-kunden.png)

Name, Firma, Ansprechpartner, Telefon, E-Mail, Adresse, Notizen. Die Kundenseite zeigt alle Projekte des Kunden. Kunden mit Projekten können nicht gelöscht werden.

![Kunde anlegen — Ort wählen](screenshots/25-kunde-neu-ort.png)

**Ort richtig erfassen:** Das Feld *Ort* schlägt beim Tippen echte Orte in Deutschland vor (mit PLZ und Bundesland). Wählen Sie den Ort **aus der Liste** — dann wird er einheitlich geschrieben, die PLZ ergänzt (falls leer) und die Position gespeichert. Darunter erscheint **„✓ Ort erkannt — Wetterdaten verfügbar“**. Freier Text ist erlaubt, aber ohne Treffer steht **„⚠ Ort nicht gefunden“** und für Projekte an dieser Adresse ist keine Wetterwarnung möglich. Ein sauber erfasster Kunde spart Arbeit: seine Adresse wird beim Anlegen eines Projekts übernommen (Kapitel 6.2).

Neue Kunden können auch direkt aus dem Projektformular angelegt werden (Kundenfeld → „… als neuen Kunden anlegen“).

---

## 6. Projekte

### 6.1 Projektliste

![Projektliste](screenshots/03-projekte-liste.png)

Reiter nach **Status** (Alle · Anfrage · Angebot · Beauftragt · Geplant · In Ausführung · Abgeschlossen · Abgerechnet · Bezahlt · Storniert) mit Anzahl, darunter Live-Suche nach Nummer, Name, Kunde, Ort. Auftragswerte erscheinen nur mit Finanzfreigabe. Der Knopf **Vorlagen** führt zu den Projektvorlagen.

### 6.2 Neues Projekt anlegen

![Projekt anlegen](screenshots/04-projekt-neu.png)

- **Aus Vorlage erstellen** (oben): Vorlage wählen → Name, Kategorie und die empfohlene Werkzeug-/Materialliste sind vorbelegt.
- **Grunddaten:** Projektname, Kunde (Live-Suche, neuer Kunde direkt anlegbar), Status, Auftragsart, Objektart, **Bezeichnung der Arbeit** (mehrere Kategorien), **Subunternehmer (SUB)** — SUB-Projekte werden in den Berichten getrennt ausgewiesen.
- Die Projektnummer (`2026-0031`) wird automatisch vergeben.

![Baustellenadresse — wie Kundenadresse](screenshots/23-projekt-adresse.png)

- **Baustellenadresse:** Sobald ein Kunde mit Adresse gewählt ist und die Felder noch leer sind, wird **„Wie Kundenadresse“** automatisch angehakt: Straße, PLZ, Ort und Telefon kommen vom Kunden (grau, nicht editierbar); nur der **Ansprechpartner vor Ort** bleibt frei. Haken entfernen = andere Baustellenadresse: die Felder werden geleert und sind frei editierbar; Haken wieder setzen holt die Kundenadresse zurück. Hat der Kunde keine Adresse, ist der Haken gesperrt. Beim *Bearbeiten* eines Projekts ist der Haken standardmäßig aus, damit vorhandene Adressen nicht überschrieben werden.

![Ort mit Vorschlägen](screenshots/30-projekt-ort-vorschlaege.png)

- **Ort:** wie beim Kunden — aus der Liste wählen, dann „✓ Ort erkannt“. Nur so sind Wetterwarnungen für dieses Projekt möglich.
- **Termine und Preis:** Beginn/Ende geplant und tatsächlich, **Auftragswert** (nur mit Finanzfreigabe sichtbar). *Ende (tatsächlich)* wird später für die Auswertung „Plan vs. Ist“ genutzt.
- **Zuordnung:** Baustellenverantwortlicher, Fahrzeug, Mitarbeiter (Team). Diese Werte werden beim Planen von Einsätzen vorbelegt.

![Empfohlene Werkzeuge und Materialien aus der Vorlage](screenshots/24-projekt-vorlage-artikel.png)

- **Werkzeug und Material:** zunächst zugeklappt mit Anzahl — ohne Vorlage leer, mit Vorlage vorbelegt („Empfohlene Werkzeuge und Materialien“). Aufklappen, um Artikel hinzuzufügen (Suche + Menge) oder zu entfernen (✕). Genau diese Liste wird mit dem Projekt gespeichert; sie kann später auf der Projektseite weiter gepflegt werden.
- **Beschreibung** (erscheint auf dem Arbeitsauftrag) und **Interne Notizen** (nur Verwaltung, nie auf dem Arbeitsauftrag).

### 6.3 Projektseite

![Projektseite](screenshots/05-projekt-detail.png)

- Kopf: Nummer, Name, **Status als Auswahl** — direkt umschaltbar (z. B. Geplant → In Ausführung), ohne das Formular zu öffnen.
- Karten: Übersicht (Kunde, Kategorien, SUB, Auftragswert), Adresse, Termine, Zuordnung, Beschreibung/Notizen.
- **Werkzeug und Material:** Liste für dieses Projekt (Artikel, Menge, Status *Erforderlich / Gepackt / Fehlt*). Hier hinzufügen oder entfernen — die Liste gilt für alle Einsätze des Projekts und erscheint im Lager und auf dem Arbeitsauftrag.
- **Geplante Einsätze** mit Datum, Uhrzeit, Team, Fahrzeugen. **+ Einsatz planen** öffnet das Einsatzfenster mit Team, Fahrzeug und Uhrzeiten aus dem Projekt vorbelegt (Kapitel 12.2).
- **Arbeitsauftrag** (Druckersymbol) und **Bearbeiten**; Löschen nur für Administratoren.

---

## 7. Arbeitsauftrag (Druck / PDF / QR-Code)

![Arbeitsauftrag](screenshots/06-arbeitsauftrag.png)

Der Arbeitsauftrag ist die A4-Seite fürs Fahrzeug und die Baustelle — im Aufbau wie das bisherige Papierformular: Firmenlogo, Projektnummer, Kunde, Baustellenadresse und Telefon, Ansprechpartner, Termine, Baustellenverantwortlicher, Fahrzeuge, Team, Bezeichnung der Arbeit (angekreuzt), Werkzeug- und Materialliste als Checkliste, Beschreibung, Unterschriftsfelder. **Keine Preise, keine internen Notizen.**

- Öffnen: Projektseite → Druckersymbol, Einsatzkarte im Wochenplan → Druckersymbol, Tagesvorbereitung, Mein Bereich. Der Auftrag öffnet im gleichen Fenster; **← Zurück** führt zur vorherigen Seite.
- **Drucken / PDF:** Knopf oben oder Strg+P; „Als PDF speichern“ im Druckdialog.
- **QR-Code** oben rechts: mit dem Handy scannen → derselbe Arbeitsauftrag öffnet sich (Anmeldung erforderlich).
- Mitarbeiter sehen nur Aufträge ihrer eigenen Projekte bzw. von Einsätzen zwischen gestern und in 7 Tagen.

---

## 8. Vorlagen

![Vorlagen](screenshots/17-vorlagen.png)

*Projekte → Vorlagen.* Eine Vorlage hat Bezeichnung, Kategorie, Beschreibung und eine **empfohlene Werkzeug- und Materialliste** (Artikel mit Menge). Typische Vorlagen: „Außenfassade streichen“, „Wohnung Innenanstrich“, „WDVS“.

- **Neue Vorlage** anlegen, speichern („✓ Gespeichert“), dann unten Artikel hinzufügen (Live-Suche + Menge) oder entfernen.
- Beim Anlegen eines Projekts die Vorlage wählen (Kapitel 6.2) — die Liste kann dort vor dem Speichern noch angepasst werden.
- Vorlagen können deaktiviert werden; deaktivierte erscheinen nicht mehr in der Auswahl.

---

## 9. Mitarbeiter und Benutzerkonten

![Mitarbeiter](screenshots/08-mitarbeiter.png)

Vorname, Nachname, Telefon, E-Mail, **Fähigkeiten** (mit Komma trennen, z. B. „Malern, WDVS“), aktiv/inaktiv, Notizen. Die Suche findet auch Teile einer Fähigkeit („fass“ → Fassade). Die Spalte **Konto** zeigt, wer sich anmelden kann.

Mitarbeiter, die Projekten oder Einsätzen zugeordnet sind, können nicht gelöscht werden — stattdessen auf **inaktiv** setzen (die Historie bleibt erhalten).

### 9.1 Mitarbeiterseite

Kontaktdaten, **kommende Einsätze**, alle Projekte und der Bereich **Benutzerkonto**.

### 9.2 Benutzerkonto eines Mitarbeiters (nur Administrator)

![Benutzerkonto](screenshots/21-mitarbeiter-konto.png)

**Konto anlegen:** Haken **„Benutzerkonto aktivieren“** → Benutzername (Kleinbuchstaben, Zahlen, Punkt, Minus, Unterstrich), Passwort (min. 8 Zeichen), Rolle (normalerweise *Mitarbeiter*), optional „Finanzdaten sichtbar“ → **Konto anlegen**. Ab sofort kann sich der Mitarbeiter am Handy anmelden und sieht „Mein Bereich“.

**Bestehendes Konto:** Kennzeichen oben rechts (Benutzername, Rolle, ggf. „€ Finanzdaten sichtbar“, „Konto deaktiviert“). Im Formular ändern:
- **Rolle** — Mitarbeiter / Büro / Administrator,
- **Neues Passwort** — leer lassen, um es nicht zu ändern; ein neues Passwort meldet den Mitarbeiter auf allen anderen Geräten ab,
- **Finanzdaten sichtbar**,
- **Aktiv** — Haken entfernen sperrt die Anmeldung, ohne den Mitarbeiter oder seine Historie zu löschen (z. B. beim Ausscheiden),
- **Konto löschen** — entfernt das Konto endgültig; Protokolleinträge bleiben. Schutzregeln siehe Kapitel 16.

Nach **Speichern** erscheint „✓ Gespeichert“. Büro-Konten sehen den Bereich nur lesend.

---

## 10. Fahrzeuge

![Fahrzeuge](screenshots/09-fahrzeuge.png)

Name, Kennzeichen, Typ, Notizen, **Status** (Verfügbar · Im Einsatz · Werkstatt · Außer Betrieb) — auf der Fahrzeugseite direkt umschaltbar. Die Fahrzeugseite zeigt kommende Einsätze. Ein Fahrzeug, das nicht *Verfügbar* ist, aber eingeplant wird, erzeugt einen Konflikt-Hinweis. Fahrzeuge in Einsätzen können nicht gelöscht werden — auf *Außer Betrieb* setzen.

---

## 11. Lager: Werkzeug- und Materialkatalog

![Lager](screenshots/10-lager-katalog.png)

Der Katalog aller Werkzeuge (z. B. Leiter, Gerüst, Spritzgerät) und Materialien (Farbe, Grundierung, Folie …) mit Art, Kategorie, Einheit, optional Bestand/Mindestbestand/Lagerort. Live-Suche und Filter nach Art. Deaktivierte Artikel bleiben in alten Projekten erhalten, sind aber nicht mehr auswählbar. Aus diesem Katalog werden Projektlisten und Vorlagen bestückt.

---

## 12. Einsatzplanung (Wochenplan)

### 12.1 Wochenansicht

![Wochenansicht](screenshots/11-einsatzplanung-woche.png)

Fünf Tagesspalten (Mo–Fr) mit Einsatzkarten: Projekt, Nummer, Kunde, Uhrzeit, Fahrzeuge, Team. Oben **Woche | Monat | Übersicht**, ← → sowie **Aktuelle Woche**.

- **Verschieben:** Karte mit der Maus auf einen anderen Tag ziehen; auf dem Handy/Tablet die Karte kurz gedrückt halten und ziehen.
- **+** in der Tagesspalte legt einen neuen Einsatz an diesem Tag an; Klick auf eine Karte öffnet sie zum Bearbeiten.
- **⚠ Konflikte in dieser Woche** (oben): Mitarbeiter/Fahrzeug am selben Tag mit überschneidenden Zeiten mehrfach eingeplant, oder Fahrzeug nicht verfügbar. Betroffene Karten sind gelb markiert. Konflikte sind **Warnungen** — die Planung bleibt möglich, die Verwaltung entscheidet.
- **Wetter:** Regenwarnungen für Einsätze mit Außenarbeiten und erkanntem Ort.
- Druckersymbol auf der Karte → Arbeitsauftrag.

### 12.2 Einsatz anlegen / bearbeiten

![Einsatzfenster](screenshots/12-einsatz-dialog.png)

- **Projekt** (Live-Suche) — bei Auswahl werden Team, Fahrzeug und Uhrzeiten aus dem Projekt vorbelegt.
- **Datum**, **Beginn**, **Ende**: ohne Zeiten gilt der Einsatz ganztägig; mit Zeiten werden Konflikte nur bei zeitlicher Überschneidung gemeldet (zwei Einsätze desselben Teams 07:00–12:00 und 12:30–16:30 sind kein Konflikt).
- **Fahrzeuge** (mehrere möglich, Live-Suche), **Mitarbeiter** (Ankreuzen), **Notiz**.
- **Werkzeug und Material:** die Projektliste, direkt hier bearbeitbar (gilt für alle Einsätze des Projekts).
- **Arbeitsauftrag** öffnen, **Löschen** des Einsatzes (nicht des Projekts).

### 12.3 Monatsansicht

![Monatsansicht](screenshots/13-einsatzplanung-monat.png)

Kalenderraster mit allen Einsätzen des Monats; Klick auf einen Tag wechselt in die Woche.

### 12.4 Übersicht (mehrere Wochen)

![Übersicht](screenshots/14-einsatzplanung-uebersicht.png)

Mehrere Wochen untereinander im Stil des bisherigen Papier-Wochenplans — für den Blick nach vorn und den Ausdruck.

---

## 13. Tagesvorbereitung — Bildschirm im Lager

![Tagesvorbereitung](screenshots/15-tagesvorbereitung.png)

*Menü → Lager → Tagesvorbereitung* bzw. direkt `/today`, gedacht für einen Bildschirm oder ein Tablet im Lager mit dem gemeinsamen Konto `lager` (nur Lesen der Planung, Abhaken erlaubt, keine Preise).

- Zeigt alle **heutigen Einsätze** (Datum wechselbar) mit Team, Fahrzeugen und der **Packliste**.
- Große Schaltflächen je Artikel: **Gepackt** ✓ oder **Fehlt** ⚠; Fortschritt je Einsatz („3 von 5“). Der Status ist sofort auf dem Dashboard und im Mitarbeiterbereich sichtbar.
- Aktualisiert sich selbst; **Arbeitsauftrag** je Einsatz druckbar.

---

## 14. Mein Bereich — für Mitarbeiter

![Mein Bereich](screenshots/20-mein-bereich-mobil.png)

Was ein Mitarbeiter nach der Anmeldung am Handy sieht (Rolle *Mitarbeiter*):

- **Heute** (Standard) mit Blättern zu gestern / morgen, **Kommende Einsätze** und **Nächster Einsatz**.
- Je Einsatz: Uhrzeit, Projekt, Kunde, **Adresse mit „In Karten öffnen“**, **Anrufen** (Baustelle/Kunde), Fahrzeug, Team, Baustellenverantwortlicher, Hinweise, **Werkzeug und Material** mit Packstatus, **Arbeitsauftrag**.
- Große Schrift, große Schaltflächen — für die Bedienung mit dem Daumen. **Keine Preise**, keine internen Notizen.
- Voraussetzung: dem Benutzerkonto ist ein Mitarbeiter zugeordnet (Kapitel 9.2).

---

## 15. Berichte

![Berichte — Übersicht](screenshots/16-berichte.png)

**Zeitraum:** oben rechts Jahr und Zeitraum wählen — *Ganzes Jahr*, ein **Quartal**, ein **Halbjahr** oder ein **Monat**. Die Auswahl gilt für alle Reiter, den **Excel-Export** und den Druck. **Drucken / PDF** druckt den aktuellen Reiter ohne Menü — so entsteht z. B. eine Monatsübersicht mit einem Klick.

**Übersicht:** Umsatz des Zeitraums (bei „Ganzes Jahr“ und laufendem Jahr: bis zum aktuellen Monat) mit Veränderung zum **gleichen Zeitraum des Vorjahres**, SUB-Anteil, **Offener Auftragsbestand** in drei Stufen — *Beauftragt (sicher)* · *In Ausführung* · *Geplant / offen* (unabhängig vom Zeitraum) — und das **Monatsdiagramm**: blau = laufendes Jahr (dunkel eigene Leute, hell SUB), grau = Vorjahr; der gewählte Zeitraum ist hervorgehoben. Gibt es Datenprobleme, erscheint darunter ein Hinweis mit Anzahl.

**Umsatz:** der Monatsplanumsatz als Monatskarten mit allen Projekten (eigene Leute und SUB getrennt), nur die Monate des Zeitraums.

![Berichte — Plan vs. Ist](screenshots/26-berichte-projekte.png)

**Projekte:** *Abgeschlossene Projekte — Plan vs. Ist*: geplante Arbeitstage (Mo–Fr zwischen geplantem Beginn und Ende), tatsächliche Einsatztage aus der Einsatzplanung, Personentage (Summe der eingeplanten Mitarbeiter) und **€ pro Personentag** (Auftragswert ÷ Personentage — der beste Hinweis auf die Wirtschaftlichkeit, ohne Kosten erfassen zu müssen). *Verzug (Ende)* vergleicht das tatsächliche mit dem geplanten Ende (nur, wenn im Projekt „Ende (tatsächlich)“ eingetragen ist). Die Durchschnittszeile ist bei € pro Personentag gewichtet (Gesamtwert ÷ Gesamt-Personentage). Daneben die Projekte nach Status.

![Berichte — Kunden](screenshots/27-berichte-kunden.png)

**Kunden:** Kunden nach Umsatz im Zeitraum mit Anteil (Balken); über 30 % Anteil erscheint die Warnung „hohe Abhängigkeit von einem Kunden“. Rechts die Liste **Kunden ohne Projekt seit über 12 Monaten** — sortiert nach dem letzten Projekt, als Anlass für einen Anruf.

![Berichte — Auslastung](screenshots/28-berichte-auslastung.png)

**Auslastung:** Mitarbeiter und Fahrzeuge in **Prozent** = Einsatztage ÷ Arbeitstage (Mo–Fr) des Zeitraums, bei laufendem Zeitraum bis heute. Unter 50 % gelb, über 90 % grün.

![Berichte — Datenqualität](screenshots/29-berichte-datenqualitaet.png)

**Datenqualität:** Punkte, die die Zahlen verfälschen — jeder Eintrag ist ein Link zum Korrigieren:
- Projekte *In Ausführung* ohne Einsatz in den nächsten 14 Tagen,
- abgeschlossene Projekte **ohne Auftragswert** (fehlen im Umsatz!),
- Projekte ohne Ort (keine Wetterwarnung möglich),
- Projekte, deren Ort nicht auffindbar ist (Tippfehler — Ort aus der Liste wählen),
- Artikel, die aktuell in mehreren Projekten fehlen.

Preise, Umsätze und Kundenumsätze erscheinen nur mit Finanzfreigabe. **Excel-Export:** vier Blätter — Monatsplanumsatz, Auslastung, Plan vs Ist, Kunden — für den gewählten Zeitraum.

---

## 16. Einstellungen

![Einstellungen](screenshots/18-einstellungen.png)

Nur für Administratoren.

### Systemkonten (ohne Mitarbeiter)
Konten, die keinem Mitarbeiter gehören: Verwaltung (`admin`), Büro (`buero`), Lagerbildschirm (`lager`). Anlegen/bearbeiten: Benutzername, Passwort (min. 8 Zeichen), Rolle, **Finanzdaten sichtbar**, aktiv/inaktiv, **Konto löschen**. Konten von Mitarbeitern werden auf der jeweiligen Mitarbeiterseite verwaltet (Kapitel 9). Ein Passwortwechsel meldet den Benutzer auf allen anderen Geräten ab.

**Schutzregeln beim Löschen** (gelten überall): Das Konto, mit dem Sie gerade angemeldet sind, kann nicht gelöscht werden — abmelden, mit einem anderen Administrator anmelden, dann löschen. Das **letzte aktive Administrator-Konto** kann nie gelöscht werden — zuerst ein weiteres anlegen (oder einem bestehenden Konto die Rolle Administrator geben). So lässt sich z. B. `admin` durch ein Konto mit eigenem Namen ersetzen: neues Administrator-Konto anlegen → abmelden → mit dem neuen Konto anmelden → `admin` löschen.

### Konten mit erweiterten Rechten
Übersicht **aller** Konten, die Administrator sind oder Finanzdaten sehen dürfen — Systemkonten und Mitarbeiter. So sieht die Geschäftsführung auf einen Blick, wer Preise und Umsätze einsehen kann; „Zum Mitarbeiter“ führt direkt zur Seite, auf der die Rechte geändert werden.

### Firmenname und Logo
Der Name erscheint überall (Menü, Anmeldung, Arbeitsauftrag, Browser-Titel). Logo hochladen (PNG/JPG/WebP, max. 1 MB) oder entfernen — ohne Logo wird der Firmenname angezeigt. Beide Formulare bestätigen mit „✓ Gespeichert“.

### Datensicherung
- **Backup herunterladen (JSON):** alle Daten in einer Datei (Projekte, Kunden, Preise, Mitarbeiter, Fahrzeuge, Werkzeug, Einsätze, Benutzer, Logo, Änderungsprotokoll). Sicher aufbewahren — die Datei enthält vertrauliche Daten.
- **Backup wiederherstellen:** ersetzt **alle** aktuellen Daten durch die Datei. Danach müssen sich alle neu anmelden. Nicht rückgängig zu machen — vorher ein aktuelles Backup herunterladen.

### Import aus Trello
![Import](screenshots/19-import-trello.png)

Einmaliger Import bestehender Trello-Boards: In Trello *Menü ⋯ → Print, export and share → Export as JSON*, Datei hier hochladen, je Trello-Liste einen Projektstatus zuordnen, **Import starten**. Ergebnis: neue Projekte und Kunden (erstes Wort des Kartentitels = Kunde); bereits vorhandene Projekte werden übersprungen.

### Arbeitskategorien
Kategorien (Malern, Putz, WDVS, Gerüstbau …) umbenennen, deaktivieren, neue hinzufügen — sie erscheinen im Projektformular und auf dem Arbeitsauftrag. Jede Zeile hat einen eigenen Speichern-Knopf („✓ Gespeichert“).

---

## 17. Typische Abläufe im Alltag

**Neuer Auftrag kommt herein**
1. Projekte → Neues Projekt (ggf. aus Vorlage). Kunde tippen — falls neu, direkt anlegen (Ort aus der Liste wählen).
2. „Wie Kundenadresse“ prüfen; Ansprechpartner vor Ort, Termine, Preis, Team, Fahrzeug eintragen. Speichern.
3. Auf der Projektseite Werkzeug/Material prüfen, **+ Einsatz planen** → Tage festlegen (Team/Fahrzeug sind vorbelegt).
4. Fertig: Wochenplan, Lager, Arbeitsauftrag und Mitarbeiterbereich sind aktuell.

**Morgens im Büro**
Übersicht prüfen: Konflikte? Wetter? Ist im Lager alles gepackt? Offene Zuordnungen? → Einsatzplanung, Druckersymbol auf der Karte → Arbeitsauftrag drucken.

**Es regnet — Einsatz verschieben**
Einsatzplanung → Karte auf einen anderen Tag ziehen (oder Klick → Datum ändern). Konflikte werden sofort angezeigt. Team und Lager sehen die Änderung sofort.

**Im Lager**
Tagesvorbereitung am Bildschirm → Artikel abhaken, fehlende markieren → Arbeitsauftrag drucken oder QR-Code mit dem Handy scannen.

**Mitarbeiter unterwegs**
Mein Bereich → Adresse „In Karten öffnen“, bei Bedarf anrufen, Packliste prüfen, Arbeitsauftrag ansehen.

**Projekt abgeschlossen**
Projektseite → Status auf *Abgeschlossen*, „Ende (tatsächlich)“ und Auftragswert prüfen — sonst fehlt das Projekt im Umsatz und in „Plan vs. Ist“ (Berichte → Datenqualität erinnert daran).

**Neuer Mitarbeiter mit Handy-Zugang**
1. Mitarbeiter → Neuer Mitarbeiter (Name, Telefon, Fähigkeiten). Speichern.
2. Mitarbeiterseite: **Benutzerkonto aktivieren** → Benutzername + Passwort → Konto anlegen.
3. Zugangsdaten mitteilen; der Mitarbeiter meldet sich am Handy an.

**Mitarbeiter scheidet aus**
Mitarbeiterseite → Benutzerkonto: Haken **Aktiv** entfernen → Speichern (Anmeldung gesperrt). Mitarbeiter selbst auf **inaktiv** setzen — Projekte und Einsätze der Vergangenheit bleiben erhalten.

**Monatsende**
Berichte → Zeitraum = Monat → Übersicht drucken (PDF) und Excel-Export ablegen. Reiter Datenqualität leeren.

**Quartal / Halbjahr**
Berichte → Zeitraum = Quartal oder Halbjahr → Übersicht (Vergleich zum Vorjahr), Kunden (Abhängigkeit, ruhende Kunden), Auslastung (unter 50 % / über 90 %).

**Regelmäßig**
Einstellungen → Backup herunterladen (mindestens wöchentlich, vor Updates immer).

---

## 18. Häufige Fragen

**Warum sehe ich keinen Preis?** Ihr Konto hat keine Finanzfreigabe. Der Administrator kann sie auf Ihrer Mitarbeiterseite bzw. unter *Einstellungen → Systemkonten* setzen.

**Warum erscheint keine Wetterwarnung?** Nur wenn das Projekt einen **erkannten Ort** hat („✓ Ort erkannt“ — aus der Liste gewählt oder eindeutig geschrieben), eine Außen-Kategorie (Außenfassade, WDVS, Gerüstbau) trägt, der Einsatz innerhalb der nächsten 16 Tage liegt und die Regenwahrscheinlichkeit ≥ 60 % ist. *Berichte → Datenqualität* listet Projekte mit unauffindbarem Ort.

**Die Kundenadresse wurde nicht übernommen.** Der Haken „Wie Kundenadresse“ wird nur automatisch gesetzt, wenn die Adressfelder leer sind und der Kunde eine Adresse hat. Haken manuell setzen oder beim Kunden die Adresse nachtragen.

**Ein Mitarbeiter/Fahrzeug lässt sich nicht löschen.** Weil noch Projekte oder Einsätze zugeordnet sind — stattdessen auf inaktiv / Außer Betrieb setzen.

**Zwei Einsätze desselben Teams an einem Tag werden als Konflikt gemeldet.** Beiden Einsätzen Beginn **und** Ende geben; überschneiden sich die Zeiten nicht, verschwindet die Warnung.

**Ich kann mein eigenes Konto nicht löschen / herabstufen.** Absicht: Mit einem anderen Administrator-Konto anmelden und von dort ändern. Das letzte aktive Administrator-Konto ist immer geschützt.

**Wer hat etwas geändert?** Jede Änderung (Status, Termine, Packstatus, Passwörter …) wird mit Benutzer und Zeitpunkt protokolliert. Am Lagerbildschirm erscheint das gemeinsame Konto `lager`; wer namentlich erfasst werden soll, meldet sich mit dem eigenen Konto am Handy an.

**Handy statt Computer?** Ja — Menü über ☰, alle Listen und die Einsatzplanung (Ziehen per Gedrückthalten) funktionieren auf dem Handy.

**Was passiert bei einer Vorlage, wenn ich Artikel entferne?** Nur die Liste des neuen Projekts ändert sich; die Vorlage bleibt unverändert.

---

## 19. Für den Administrator: Installation, Update, Sicherung

Die Anwendung läuft in Docker (App + PostgreSQL) auf einem eigenen Server oder VPS; keine Bindung an einen Anbieter.

**Installation (einmalig)**
```bash
git clone https://github.com/mostafasadeghidev/baucrew.git /opt/baucrew && cd /opt/baucrew
cp .env.example .env        # POSTGRES_PASSWORD und SESSION_SECRET setzen
docker compose up -d --build
```
Beim ersten Start werden die Datenbank angelegt, alle Migrationen ausgeführt und die Basisdaten (Konten `admin`/`buero`/`lager`, Arbeitskategorien, Werkzeugkatalog) automatisch erzeugt. Die App hört auf Port 3000 — davor einen Reverse-Proxy mit HTTPS (Beispiel Caddy in `DEPLOYMENT.md`).

**Update auf eine neue Version**
```bash
cd /opt/baucrew && git pull && docker compose up -d --build
```
Migrationen laufen automatisch; die Daten bleiben erhalten. Vorher ein Backup herunterladen.

**Sicherung**
Täglich per Cron `pg_dump` (Befehl in `DEPLOYMENT.md`) oder regelmäßig *Einstellungen → Backup herunterladen*. Kopien außerhalb des Servers aufbewahren.

**Sprachen**
Ausgeliefert werden Deutsch und Englisch. Weitere Sprachen für Tests lassen sich lokal ohne Codeänderung aktivieren (Datei `messages/<code>.json` + `NEXT_PUBLIC_EXTRA_LOCALES=<code>` in `.env`).

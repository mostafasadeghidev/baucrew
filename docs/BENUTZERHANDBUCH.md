# Benutzerhandbuch — Einsatz- und Projektverwaltung

*Stand: 15. August 2026*

Dieses Handbuch erklärt alle Bereiche der Anwendung Schritt für Schritt — für die Verwaltung (Büro), für das Lager und für die Mitarbeiter.

---

## Inhalt

1. [Grundprinzip](#1-grundprinzip)
2. [Anmeldung, Rollen und Rechte](#2-anmeldung-rollen-und-rechte)
3. [Bedienung: Sprache, Design, Menü, Suche](#3-bedienung-sprache-design-menü-suche)
4. [Übersicht (Dashboard)](#4-übersicht-dashboard)
5. [Kunden](#5-kunden)
6. [Projekte](#6-projekte)
7. [Arbeitsauftrag (Druck / PDF / QR-Code)](#7-arbeitsauftrag-druck--pdf--qr-code)
8. [Vorlagen](#8-vorlagen)
9. [Mitarbeiter](#9-mitarbeiter)
10. [Fahrzeuge](#10-fahrzeuge)
11. [Lager: Werkzeug- und Materialkatalog](#11-lager-werkzeug--und-materialkatalog)
12. [Einsatzplanung (Wochenplan)](#12-einsatzplanung-wochenplan)
13. [Tagesvorbereitung — Bildschirm im Lager](#13-tagesvorbereitung--bildschirm-im-lager)
14. [Mein Bereich — für Mitarbeiter](#14-mein-bereich--für-mitarbeiter)
15. [Berichte und Excel-Export](#15-berichte-und-excel-export)
16. [Einstellungen](#16-einstellungen)
17. [Typische Abläufe im Alltag](#17-typische-abläufe-im-alltag)
18. [Häufige Fragen](#18-häufige-fragen)

---

## 1. Grundprinzip

**Alles wird nur einmal eingegeben.** Ein Projekt ist der zentrale Datensatz: Kunde, Adresse, Team, Fahrzeug, Werkzeug/Material, Termine. Aus diesem einen Datensatz entstehen automatisch:

- der Wochenplan (Einsatzplanung),
- der Bildschirm im Lager (was heute gepackt werden muss),
- der Arbeitsauftrag zum Ausdrucken,
- der Bereich für die Mitarbeiter (wer arbeitet heute wo),
- die Berichte und der Excel-Export.

Wird etwas geändert (z. B. ein Einsatz wegen Regen verschoben), sind alle Stellen sofort aktuell — nichts muss doppelt gepflegt werden.

---

## 2. Anmeldung, Rollen und Rechte

![Anmeldung](screenshots/01-login.png)

Anmeldung mit **Benutzername** und **Passwort**. Die Sitzung bleibt 30 Tage bestehen; „Abmelden“ oben rechts beendet sie sofort. Nach zu vielen Fehlversuchen ist die Anmeldung kurz gesperrt.

### Rollen

| | Administrator | Büro / Verwaltung | Mitarbeiter |
|---|---|---|---|
| Kunden, Projekte, Mitarbeiter, Fahrzeuge, Lager, Einsatzplanung | ✓ | ✓ | – |
| **Preise (Auftragswert) und Umsatzberichte** | ✓ | nur mit Freigabe „Finanzdaten sichtbar“ | **niemals** |
| Projekte löschen | ✓ | – | – |
| Einstellungen (Benutzer, Logo, Backup, Import) | ✓ | – | – |
| Mein Bereich, Tagesvorbereitung, Arbeitsauftrag | ✓ | ✓ | ✓ (nur eigene / anstehende Einsätze) |

Preise sind für Mitarbeiter nicht nur ausgeblendet, sondern werden gar nicht erst an ihr Gerät übertragen. Auch der Arbeitsauftrag enthält bewusst keine Preise und keine internen Notizen.

### Vorhandene Konten (Erstinstallation)

| Benutzer | Rolle | Verwendung |
|---|---|---|
| `admin` | Administrator | Inhaber |
| `buero` | Büro / Verwaltung | Büro, ohne Preise |
| `lager` | Mitarbeiter | gemeinsames Konto für den Bildschirm im Lager |

> **Wichtig:** Alle Anfangs-Passwörter vor dem echten Betrieb ändern (Systemkonten unter *Einstellungen*, Mitarbeiterkonten auf der Mitarbeiterseite).

---

## 3. Bedienung: Sprache, Design, Menü, Suche

- **Sprache:** oben rechts **DE | EN** (Deutsch ist die Standardsprache).
- **Design:** Sonnen-/Mond-Symbol → hell, dunkel oder Systemeinstellung.
- **Menü:** links; auf dem Handy über das ☰-Symbol oben links.
- **Suche:** Alle Suchfelder filtern **sofort beim Tippen** — kein Suchen-Knopf nötig. Auswahlfelder (Kunde, Projekt, Fahrzeug, Werkzeug …) sind ebenfalls durchsuchbar: einfach anfangen zu tippen.
- **Listen** zeigen 20 Einträge pro Seite; unten kann geblättert werden.
- **Speichern:** Formulare, die auf derselben Seite bleiben (Einstellungen, Benutzerkonto eines Mitarbeiters), bestätigen mit einem kurzen grünen **„✓ Gespeichert“** neben dem Knopf; die Meldung verschwindet nach wenigen Sekunden von selbst. Alle anderen Formulare öffnen nach dem Speichern direkt die Detailseite.

---

## 4. Übersicht (Dashboard)

![Übersicht](screenshots/02-dashboard.png)

Die Startseite nach der Anmeldung beantwortet die Tagesfragen auf einen Blick:

- **Kennzahlen** (anklickbar): laufende / geplante Projekte, Mitarbeiter und Fahrzeuge heute im Einsatz, Kunden.
- **⚠ Konflikte diese Woche:** Mitarbeiter oder Fahrzeuge, die am selben Tag doppelt eingeplant sind. Gelb = Handlungsbedarf, ✓ = alles frei.
- **Wetter:** Regenwarnungen (≥ 60 %) für Außenarbeiten dieser Woche.
- **Bereitstellung heute:** Fortschritt der Lagervorbereitung je heutigem Einsatz („2 von 4 gepackt · 1 fehlt“).
- **Projekte mit offener Zuordnung:** anstehende Projekte ohne Team oder ohne Fahrzeug.
- **Heutige Einsätze:** Uhrzeit, Projekt, Kunde, Fahrzeug, Team.

---

## 5. Kunden

![Kunden](screenshots/07-kunden.png)

**Kunden → Neuer Kunde:** Name (Pflicht), Firma, Ansprechpartner, Telefon, E-Mail, Adresse, Notizen.

Die Kundenseite zeigt alle Kontaktdaten und **alle Projekte dieses Kunden** mit Status. Ein Kunde kann nur gelöscht werden, wenn ihm keine Projekte zugeordnet sind.

**Tipp:** Kunden müssen nicht vorab angelegt werden — im Projektformular kann ein neuer Kunde direkt angelegt werden (siehe Kapitel 6).

---

## 6. Projekte

### 6.1 Projektliste

![Projektliste](screenshots/03-projekte-liste.png)

- **Status-Reiter** oben (Alle · Anfrage · Beauftragt · Geplant · In Ausführung · Abgeschlossen …) mit Anzahl.
- **Suche** nach Nummer, Name, Kunde, Ort, Straße.
- Projektnummern werden automatisch vergeben (`2026-0001`, `2026-0002` …).

### 6.2 Neues Projekt anlegen

![Projekt anlegen](screenshots/04-projekt-neu.png)

**Baustellenadresse:** Sobald ein Kunde gewählt ist und die Adressfelder leer sind, wird **„Wie Kundenadresse“** automatisch angehakt und Straße, PLZ, Ort und Telefon vom Kunden übernommen (grau, nicht editierbar); nur der *Ansprechpartner vor Ort* bleibt frei. Haken entfernen = andere Baustellenadresse: die Felder werden geleert und sind frei editierbar. Beim Bearbeiten eines Projekts ist der Haken standardmäßig aus (bestehende Adressen werden nicht überschrieben).

**Ort:** Das Feld *Ort* schlägt beim Tippen echte Orte vor (Deutschland). Wählen Sie aus der Liste — dann wird der Ort einheitlich geschrieben, die PLZ ggf. ergänzt und die Koordinaten gespeichert; darunter erscheint **„✓ Ort erkannt — Wetterdaten verfügbar“**. Bei freiem Text ohne Treffer steht **„⚠ Ort nicht gefunden“** — dann ist keine Wetterwarnung möglich. Dasselbe Feld gibt es beim Kunden; ein dort korrekt gewählter Ort wandert über „Wie Kundenadresse“ in die Projekte. Alte Projekte mit unauffindbarem Ort listet *Berichte → Datenqualität*.

**Projekte → Neues Projekt.** Optional zuerst oben **„Aus Vorlage erstellen“** wählen — dann sind Name, Kategorie, Beschreibung und die Werkzeug-/Materialliste schon ausgefüllt.

| Bereich | Felder |
|---|---|
| **Grunddaten** | Projektname*, Kunde* (durchsuchbar; unbekannter Name → „… als neuen Kunden anlegen“ oder **+**-Knopf öffnet ein Fenster zum Anlegen), Status, Auftragsart (Privat/Gewerblich), Objektart (Neubau/Altbau), Bezeichnung der Arbeit (mehrere möglich), Subunternehmer (SUB) |
| **Baustellenadresse** | Straße, PLZ, **Ort** (wichtig für die Wetterwarnung!), Telefon Baustelle, Ansprechpartner vor Ort |
| **Termine und Preis** | Beginn/Ende geplant und tatsächlich, **Auftragswert** (nur mit Finanzfreigabe sichtbar) |
| **Zuordnung** | Baustellenverantwortlicher, Fahrzeug, Mitarbeiter (Team) — alle durchsuchbar |
| **Beschreibung und Notizen** | Beschreibung (sichtbar für Mitarbeiter, auf dem Arbeitsauftrag), **Interne Notizen (nur Verwaltung)** |

### 6.3 Projektseite

![Projektseite](screenshots/05-projekt-detail.png)

Die zentrale Seite eines Projekts:

- **Status** direkt im Kopf ändern (farbiges Auswahlfeld) — ohne das Bearbeiten-Formular.
- Knöpfe **Arbeitsauftrag**, **Bearbeiten**, **Löschen** (nur Administrator).
- **Übersicht** und **Termine / Zuordnung**.
- **Werkzeug und Material:** Artikel hinzufügen (durchsuchbar, mit Menge), Status je Artikel (Benötigt / Gepackt / Fehlt), entfernen. Diese Liste erscheint auf dem Arbeitsauftrag und im Lager.
- **Geplante Einsätze:** alle Termine dieses Projekts. **„+ Einsatz planen“** öffnet direkt das Einsatzfenster — Team und Fahrzeug sind aus dem Projekt bereits vorbelegt.
- **Interne Notizen** (nur Verwaltung, gelb hinterlegt).

---

## 7. Arbeitsauftrag (Druck / PDF / QR-Code)

![Arbeitsauftrag](screenshots/06-arbeitsauftrag.png)

Der digitale Nachfolger des Papier-Arbeitsauftrags — gleicher Aufbau: Logo, Auftrag vom, Fahrzeug, Auftraggeber/Kunde, Anschrift, Telefon, Baustelleneinrichtung (Privat/Gewerblich/Neubau/Altbau), Bezeichnung der Arbeit (angekreuzt), Baustellenverantwortlicher, Mitarbeiter, Beginn, voraussichtliches Ende, Werkzeugliste/Materialliste, weitere Notizen.

- **Drucken / PDF:** öffnet den Druckdialog des Browsers; dort „Als PDF speichern“ wählen. Gedruckt wird immer schwarz auf weiß, ohne Menüs.
- **QR-Code** oben rechts: mit dem Handy scannen → derselbe Arbeitsauftrag öffnet sich auf dem Handy.
- **Zurück** führt immer zur vorherigen Seite (Einsatzplanung, Projekt …).
- Erreichbar von: Projektseite, jeder Karte in der Einsatzplanung (Drucker-Symbol), dem Einsatzfenster, der Tagesvorbereitung und „Mein Bereich“.

---

## 8. Vorlagen

![Vorlagen](screenshots/17-vorlagen.png)

**Projekte → Vorlagen.** Für wiederkehrende Arbeiten (z. B. „Außenfassade streichen“): Bezeichnung, Kategorie, Beschreibung und die **empfohlenen Werkzeuge und Materialien** mit Mengen.

Beim Anlegen eines Projekts „Aus Vorlage erstellen“ wählen → alles wird übernommen und kann anschließend frei angepasst werden.

---

**Projekt aus Vorlage anlegen:** Unter *Projekte → Neues Projekt* die Vorlage wählen. Der Bereich **Empfohlene Werkzeuge und Materialien** ist zunächst zugeklappt und zeigt die Anzahl; aufklappen, um vor dem Speichern Artikel zu entfernen oder weitere hinzuzufügen. Beim Speichern der Vorlage selbst erscheint kurz „✓ Gespeichert“.

---

## 9. Mitarbeiter

![Mitarbeiter](screenshots/08-mitarbeiter.png)

Vorname, Nachname, Telefon, E-Mail, **Fähigkeiten** (mit Komma trennen, z. B. „Malern, WDVS“), aktiv/inaktiv, Notizen. Suche findet auch Teile einer Fähigkeit („fass“ → Fassade).

Die Spalte **Konto** in der Liste zeigt, welche Mitarbeiter sich anmelden können (Benutzername; bei Büro-/Administratorrechten zusätzlich die Rolle).

### 9.1 Mitarbeiterseite
Die Mitarbeiterseite zeigt Kontaktdaten, **kommende Einsätze**, alle Projekte und den Bereich **Benutzerkonto**.

### 9.2 Benutzerkonto eines Mitarbeiters (nur Administrator)

![Benutzerkonto anlegen](screenshots/22-mitarbeiter-konto-anlegen.png)

**Konto anlegen:** Haken **„Benutzerkonto aktivieren“** setzen → Benutzername (Kleinbuchstaben, Zahlen, Punkt, Minus, Unterstrich), Passwort (min. 8 Zeichen), Rolle (normalerweise *Mitarbeiter*) und optional **„Finanzdaten sichtbar“** eingeben → **Konto anlegen**. Ab sofort kann sich der Mitarbeiter am Handy anmelden und sieht „Mein Bereich“.

![Benutzerkonto verwalten](screenshots/21-mitarbeiter-konto.png)

**Bestehendes Konto:** Oben rechts im Kasten stehen die Kennzeichen — Benutzername, Rolle und, falls freigegeben, **„€ Finanzdaten sichtbar“**; ein deaktiviertes Konto ist als „Konto deaktiviert“ markiert. Im Formular darunter lassen sich ändern:
- **Rolle** (Mitarbeiter / Büro / Administrator),
- **Neues Passwort** — leer lassen, um es nicht zu ändern; ein neues Passwort meldet den Mitarbeiter auf allen anderen Geräten ab,
- **Finanzdaten sichtbar**,
- **Aktiv** — Haken entfernen sperrt die Anmeldung, ohne den Mitarbeiter oder seine Historie zu löschen (z. B. beim Ausscheiden).

Nach **Speichern** erscheint kurz „✓ Gespeichert“. Büro-Konten (Rolle Büro / Verwaltung) sehen den Bereich nur lesend.

Mitarbeiter, die Projekten oder Einsätzen zugeordnet sind, können nicht gelöscht werden — stattdessen auf **inaktiv** setzen (die Historie bleibt erhalten).

---

## 10. Fahrzeuge

![Fahrzeuge](screenshots/09-fahrzeuge.png)

Bezeichnung, Kennzeichen, Typ, **Status** (Verfügbar / In Wartung / Außer Betrieb), aktiv, Notizen. Der Status kann auf der Fahrzeugseite direkt im Kopf geändert werden.

Wird ein Fahrzeug eingeplant, das **In Wartung** oder **Außer Betrieb** ist, warnt die Einsatzplanung.

---

## 11. Lager: Werkzeug- und Materialkatalog

![Lager](screenshots/10-lager-katalog.png)

**Lager** = alle Artikel, die das Unternehmen besitzt: Werkzeuge und Materialien mit Kategorie, Einheit, Bestand, Mindestbestand, Lagerort. Filter nach Art (Werkzeug/Material), Suche nach Bezeichnung/Kategorie/Lagerort.

Aus diesem Katalog werden Artikel den Projekten (und Vorlagen) zugeordnet. Der Knopf **Tagesvorbereitung** führt zum Lagerbildschirm (Kapitel 13).

---

## 12. Einsatzplanung (Wochenplan)

### 12.1 Wochenansicht

![Wochenansicht](screenshots/11-einsatzplanung-woche.png)

Fünf Spalten Montag–Freitag, eine Karte je Einsatz (Projekt, Nummer, Kunde, Uhrzeit, Fahrzeug, Team). Der heutige Tag ist hervorgehoben.

- **← Aktuelle Woche →**: Wochen wechseln. Ansicht umschalten: **Woche | Monat | Übersicht**.
- **+** in einer Spalte: neuen Einsatz an diesem Tag anlegen.
- **Klick auf eine Karte:** Einsatz bearbeiten / löschen.
- **Drucker-Symbol** auf der Karte: Arbeitsauftrag öffnen.
- **Verschieben per Ziehen (Drag & Drop):** Karte mit der Maus auf einen anderen Tag ziehen. Auf dem Handy/Tablet: Karte **kurz gedrückt halten** (ca. ¼ Sekunde), dann verschieben.
- **⚠ Konflikte:** gelber Kasten oben und ⚠ auf betroffenen Karten, wenn ein Mitarbeiter oder Fahrzeug am selben Tag doppelt eingeplant ist oder ein Fahrzeug nicht verfügbar ist. Das ist eine **Warnung** — die Entscheidung bleibt beim Planer.
- **🌧 Wetter-Hinweise:** Regenwahrscheinlichkeit ≥ 60 % für Außenarbeiten (Außenfassade, WDVS, Gerüstbau) — der Ort kommt aus der Baustellenadresse des Projekts.

### 12.2 Einsatz anlegen / bearbeiten

![Einsatzfenster](screenshots/12-einsatz-dialog.png)

| Feld | Bedeutung |
|---|---|
| **Projekt*** | durchsuchbar. Beim Auswählen werden **Team und Fahrzeug aus dem Projekt übernommen** — für diesen Tag anpassbar. |
| **Datum, Beginn, Ende** | Ohne Beginn und Ende gilt der Einsatz **ganztägig**. Mit Zeiten (z. B. 07:00–12:00 und 12:30–16:30) darf dasselbe Team am selben Tag zwei Einsätze haben, ohne Konflikt. |
| **Fahrzeug** | eines oder mehrere (Chips), durchsuchbar |
| **Mitarbeiter** | Häkchen |
| **Notiz** | kurzer Hinweis für diesen Tag |
| **Werkzeug und Material** | die Liste des Projekts — hier direkt bearbeitbar |

Dasselbe Projekt kann nur einmal pro Tag eingeplant werden.

### 12.3 Monatsansicht

![Monatsansicht](screenshots/13-einsatzplanung-monat.png)

Kalenderraster Montag–Freitag; jede Zeile eine Kalenderwoche (KW anklickbar → Wochenansicht). Bis zu drei Einsätze je Tag, „+N“ bei mehr, ⚠ bei Konflikten.

### 12.4 Übersicht (mehrere Wochen)

![Übersicht](screenshots/14-einsatzplanung-uebersicht.png)

Vier Wochen nebeneinander — wie der bisherige Papier-Wochenplan: je Projekt eine Zeile mit Wochentagsbereich („Mo–Mi“), Kunde, Fahrzeug, Anzahl der Konflikte. Klick auf eine Woche öffnet die Wochenansicht.

---

## 13. Tagesvorbereitung — Bildschirm im Lager

![Tagesvorbereitung](screenshots/15-tagesvorbereitung.png)

Für den Bildschirm/Touchscreen im Lager gedacht (große Schrift, große Tasten). Auf dem Bildschirm einmal mit dem Konto **`lager`** anmelden und **Tagesvorbereitung** öffnen (Menü *Lager → Tagesvorbereitung* oder Adresse `/today`).

Je Einsatz des Tages eine Karte: **Fahrzeug** groß, Beginn, **Team**, Projekt, Kunde, Adresse und die **Packliste**:

- Auf einen Artikel tippen → **✓ gepackt** (grün, durchgestrichen). Nochmal tippen → zurück.
- **Fehlt** → rot markieren.
- Fortschritt „2 von 4 gepackt“; sind alle gepackt: **✓ ALLES GEPACKT**.
- Knopf **Arbeitsauftrag** je Einsatz → Blatt ansehen und am Drucker im Lager ausdrucken.
- **← Heute →**: Vortag / Folgetag (z. B. abends schon für morgen packen).
- Die Seite aktualisiert sich automatisch jede Minute — Änderungen aus dem Büro erscheinen von selbst.

Der Status (Gepackt/Fehlt) ist überall derselbe: Projektseite, Arbeitsauftrag, Dashboard und „Mein Bereich“ zeigen ihn ebenfalls.

---

## 14. Mein Bereich — für Mitarbeiter

![Mein Bereich](screenshots/20-mein-bereich-mobil.png)

Mitarbeiter melden sich mit ihrem eigenen Konto an (am Handy) und sehen **Mein Bereich**:

- Begrüßung mit Namen, Datum, **← Heute →** zum Blättern (gestern / morgen).
- Je Einsatz: Projekt, Kunde, Uhrzeit, **Adresse mit „In Karten öffnen“** (Navigation), **Telefon mit Anruf-Knopf**, Verantwortlicher, Fahrzeug, Kollegen, Hinweise zum Auftrag, **Werkzeug/Material** mit Packstatus, Knopf **Arbeitsauftrag**.
- **Nächster Einsatz** unten — auch an freien Tagen.
- Oben rechts: Link zur **Tagesvorbereitung**, Sprache, Design, Abmelden.

Mitarbeiter sehen **keine Preise, keine internen Notizen und keine fremden Projekte** — nur eigene und aktuell anstehende Einsätze.

---

## 15. Berichte und Excel-Export

![Berichte](screenshots/16-berichte.png)

**Zeitraum:** oben rechts Jahr und Zeitraum wählen — *Ganzes Jahr*, ein **Quartal**, ein **Halbjahr** oder ein einzelner **Monat**. Die Auswahl gilt für alle Reiter, den Excel-Export und den Druck (**Drucken / PDF** druckt den aktuellen Reiter ohne Menü — so entsteht z. B. eine Monatsübersicht mit einem Klick).

Die Seite hat sechs Reiter:

- **Übersicht:** Umsatz des Zeitraums mit Veränderung zum gleichen Zeitraum des Vorjahres, SUB-Anteil, offener Auftragsbestand in drei Stufen (*Beauftragt (sicher)* · *In Ausführung* · *Geplant / offen*, unabhängig vom Zeitraum) und das Monatsdiagramm (blau = laufendes Jahr, dunkel eigene Leute / hell SUB; grau = Vorjahr; der gewählte Zeitraum ist hervorgehoben). Gibt es Datenprobleme, erscheint darunter ein Hinweis mit Anzahl.
- **Umsatz:** der Monatsplanumsatz als Monatskarten (nur die Monate des Zeitraums).
- **Projekte:** *Abgeschlossene Projekte — Plan vs. Ist*: geplante Arbeitstage (Mo–Fr zwischen geplantem Beginn und Ende), tatsächliche Einsatztage aus der Einsatzplanung, Personentage und **€ pro Personentag** (Auftragswert ÷ Personentage — der beste Hinweis auf die Wirtschaftlichkeit ohne Kostenerfassung); *Verzug (Ende)* nur, wenn im Projekt „Ende (tatsächlich)“ eingetragen ist. Die Durchschnittszeile ist bei € pro Personentag gewichtet. Daneben die Projekte nach Status.
- **Kunden:** Kunden nach Umsatz im Zeitraum mit Anteil (über 30 % = Warnung „hohe Abhängigkeit“) und die Liste **Kunden ohne Projekt seit über 12 Monaten** — sortiert nach dem letzten Projekt, als Anlass für einen Anruf.
- **Auslastung:** Mitarbeiter und Fahrzeuge in **Prozent** (Einsatztage ÷ Arbeitstage Mo–Fr des Zeitraums, bei laufendem Zeitraum bis heute). Unter 50 % gelb, über 90 % grün.
- **Datenqualität:** Punkte, die die Zahlen verfälschen — Projekte *In Ausführung* ohne Einsatz in den nächsten 14 Tagen, abgeschlossene Projekte **ohne Auftragswert** (fehlen im Umsatz!), Projekte ohne Ort (keine Wetterwarnung), Artikel, die in mehreren Projekten fehlen. Jeder Eintrag ist ein Link zum Korrigieren.

Preise und Kundenumsätze erscheinen nur mit Finanzfreigabe. **Excel-Export** enthält vier Blätter (Monatsplanumsatz, Auslastung, Plan vs Ist, Kunden) für den gewählten Zeitraum.

---

## 16. Einstellungen

![Einstellungen](screenshots/18-einstellungen.png)

Nur für Administratoren.

### Systemkonten (ohne Mitarbeiter)
Hier stehen nur Konten, die **keinem Mitarbeiter** gehören: Verwaltung (`admin`), Büro (`buero`) und der Lagerbildschirm (`lager`). Anlegen/bearbeiten: Benutzername, Passwort (min. 8 Zeichen), Rolle, **Finanzdaten sichtbar**, aktiv/inaktiv; **Konto löschen** entfernt ein Konto endgültig (Protokolleinträge bleiben). Zwei Schutzregeln: das Konto, mit dem Sie gerade angemeldet sind, kann nicht gelöscht werden (abmelden, mit einem anderen Administrator anmelden, dann löschen), und das letzte aktive Administrator-Konto kann nicht gelöscht werden — legen Sie zuerst ein neues an. So lässt sich z. B. `admin` durch ein Konto mit eigenem Namen ersetzen. Konten von Mitarbeitern werden **auf der jeweiligen Mitarbeiterseite** verwaltet (siehe Kapitel Mitarbeiter). Ein Passwortwechsel meldet den Benutzer auf allen anderen Geräten ab. Das eigene Konto kann nicht deaktiviert oder herabgestuft werden.

### Konten mit erweiterten Rechten
Eine Übersicht **aller** Konten, die Administrator sind oder Finanzdaten sehen dürfen — egal ob Systemkonto oder Mitarbeiter. So sieht der Geschäftsführer auf einen Blick, wer Preise und Umsätze einsehen kann. „Zum Mitarbeiter“ führt direkt zur Seite, auf der die Rechte geändert werden.

### Firmenname und Logo
Name erscheint überall (Menü, Anmeldung, Arbeitsauftrag, Browser-Titel). Logo hochladen (PNG/JPG/WebP, max. 1 MB) oder entfernen — ohne Logo wird der Firmenname angezeigt. Beide Formulare bestätigen mit „✓ Gespeichert“.

### Datensicherung
- **Backup herunterladen (JSON):** alle Daten in einer Datei (Projekte, Kunden, Preise, Mitarbeiter, Fahrzeuge, Werkzeug, Einsätze, Benutzer, Logo, Änderungsprotokoll). Sicher aufbewahren — die Datei enthält vertrauliche Daten.
- **Backup wiederherstellen:** ersetzt **alle** aktuellen Daten durch die Datei. Danach müssen sich alle neu anmelden. Nicht rückgängig zu machen — vorher ein aktuelles Backup herunterladen.

### Import aus Trello
![Import](screenshots/19-import-trello.png)

Einmaliger Import bestehender Trello-Boards: In Trello *Menü ⋯ → Print, export and share → Export as JSON*, Datei hier hochladen, je Trello-Liste einen Projektstatus zuordnen, **Import starten**. Ergebnis: neue Projekte und Kunden; bereits vorhandene Projekte werden übersprungen.

### Arbeitskategorien
Kategorien (Malern, Putz, WDVS, Gerüstbau …) umbenennen, deaktivieren, neue hinzufügen — sie erscheinen im Projektformular und auf dem Arbeitsauftrag. Jede Zeile hat einen eigenen **Speichern**-Knopf („✓ Gespeichert“); nach **Kategorie hinzufügen** werden die Eingabefelder für die nächste Kategorie geleert.

---

## 17. Typische Abläufe im Alltag

**Neuer Auftrag kommt herein**
1. Projekte → Neues Projekt (ggf. aus Vorlage). Kunde tippen — falls neu, direkt anlegen.
2. Adresse mit **Ort**, Termine, Preis, Team, Fahrzeug eintragen. Speichern.
3. Auf der Projektseite Werkzeug/Material prüfen, **+ Einsatz planen** → Tage festlegen (Team/Fahrzeug sind vorbelegt).
4. Fertig: Wochenplan, Lager, Arbeitsauftrag und Mitarbeiterbereich sind aktuell.

**Morgens im Büro**
Übersicht prüfen: Konflikte? Wetter? Ist im Lager alles gepackt? Offene Zuordnungen? → Einsatzplanung, Drucker-Symbol auf der Karte → Arbeitsauftrag drucken.

**Es regnet — Einsatz verschieben**
Einsatzplanung → Karte auf einen anderen Tag ziehen (oder Klick → Datum ändern). Konflikte werden sofort angezeigt. Team und Lager sehen die Änderung sofort.

**Im Lager**
Tagesvorbereitung am Bildschirm → Artikel abhaken, fehlende markieren → Arbeitsauftrag drucken oder QR-Code mit dem Handy scannen.

**Mitarbeiter unterwegs**
Mein Bereich → Adresse „In Karten öffnen“, bei Bedarf anrufen, Packliste prüfen, Arbeitsauftrag ansehen.

**Neuer Mitarbeiter mit Handy-Zugang**
1. Mitarbeiter → Neuer Mitarbeiter (Name, Telefon, Fähigkeiten). Speichern.
2. Auf der Mitarbeiterseite: **Benutzerkonto aktivieren** → Benutzername + Passwort → Konto anlegen.
3. Zugangsdaten mitteilen; der Mitarbeiter meldet sich am Handy an und sieht „Mein Bereich“.

**Mitarbeiter scheidet aus**
Mitarbeiterseite → Benutzerkonto: Haken **Aktiv** entfernen → Speichern (Anmeldung gesperrt). Mitarbeiter selbst auf **inaktiv** setzen — Projekte und Einsätze der Vergangenheit bleiben erhalten.

**Monatsende**
Berichte → Excel-Export.

**Regelmäßig**
Einstellungen → Backup herunterladen.

---

## 18. Häufige Fragen

**Warum sehe ich keinen Preis?** Ihr Konto hat keine Finanzfreigabe. Der Administrator kann sie auf Ihrer Mitarbeiterseite (bzw. unter *Einstellungen → Systemkonten*) setzen.

**Warum erscheint keine Wetterwarnung?** Nur wenn das Projekt einen **Ort** hat, eine Außen-Kategorie (Außenfassade, WDVS, Gerüstbau) trägt und die Regenwahrscheinlichkeit ≥ 60 % ist.

**Ein Mitarbeiter/Fahrzeug lässt sich nicht löschen.** Weil noch Projekte oder Einsätze zugeordnet sind — stattdessen auf inaktiv / Außer Betrieb setzen.

**Zwei Einsätze desselben Teams an einem Tag werden als Konflikt gemeldet.** Beiden Einsätzen Beginn **und** Ende geben (z. B. 07:00–12:00 und 12:30–16:30); überschneiden sich die Zeiten nicht, verschwindet die Warnung.

**Wer hat etwas geändert?** Jede Änderung (Status, Termine, Packstatus, Passwörter …) wird mit Benutzer und Zeitpunkt protokolliert. Am Lagerbildschirm erscheint das gemeinsame Konto `lager`; wer namentlich erfasst werden soll, meldet sich mit dem eigenen Konto am Handy an.

**Handy statt Computer?** Ja — Menü über ☰, alle Listen und die Einsatzplanung (Ziehen per Gedrückthalten) funktionieren auf dem Handy.

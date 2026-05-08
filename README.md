# Ticketverwaltung

Eine Web-App zur Verwaltung von Event- und Menü-Tickets.

## Funktionen

- Tickets erstellen, bearbeiten, suchen und löschen
- Ticketnummer, Vorname, Nachname, Telefonnummer, Tickettyp, Menü und Preis verwalten
- mehrere Tickets markieren und gesammelt löschen
- ausgewählte Tickets oder die komplette Liste als CSV-Datei exportieren
- Ticketdaten per CSV importieren
- Share-Link für geteilte Ticketlisten erstellen
- Read-only-Link für reine Ansicht
- Edit-Link für gemeinsames Bearbeiten
- automatische Synchronisierung geteilter Listen über Firebase
- Hinweisbenachrichtigungen und optionale Bestätigungsdialoge

## Aufrufen

```text
https://wickerm4n.github.io/ticketverwaltung/
```

## Teilen

Über das Teilen-Symbol im Header kann ein Link für die aktuelle Ticketliste erstellt werden.

- **Read-only:** andere Personen können die Liste ansehen, aber nicht ändern.
- **Editierbar:** andere Personen können Tickets hinzufügen, bearbeiten und löschen.

Geteilte Ticketlisten sind nur für Personen bestimmt, die den jeweiligen Share-Link erhalten haben.

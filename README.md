# Ticketverwaltung

Eine kleine Übersicht für Event- und Menü-Tickets in der RP-Community.

## Was kann das Tool?

- Tickets für ein Event eintragen und bearbeiten
- Namen, Telefonnummern, Ticketart, Menü und Preis speichern
- nach Personen oder Tickets suchen
- normale Tickets und VIP-Tickets unterscheiden
- sehen, wie viele Plätze schon vergeben sind
- Einnahmen automatisch zusammenrechnen
- Tickets einzeln oder gesammelt löschen
- die Liste als CSV-Datei exportieren
- vorhandene Ticketlisten aus einer CSV-Datei importieren

## Mehrere Events

Oben im Tool kann zwischen Events gewechselt werden. Jedes Event hat seine eigene Ticketliste.

Neue Events werden mit dem Plus-Button erstellt. Der Name kann direkt beim Erstellen vergeben und später über den Stift-Button geändert werden.

Ein Event kann auch aus der lokalen Auswahl gelöscht werden. Geteilte Links zu alten Events bleiben dabei weiterhin abrufbar.

## Teilen

Über das Teilen-Symbol kann ein Link für das aktuelle Event erstellt werden.

- **Read-only:** andere können die Liste nur ansehen.
- **Editierbar:** andere können Tickets hinzufügen, ändern und löschen.

Jedes Event hat einen eigenen Share-Link. Ein Link zu einem alten Event zeigt also weiterhin nur dieses alte Event und nicht die neuen Events.

## Lokal nutzen

Die `index.html` kann direkt per Doppelklick im Browser geöffnet werden. Dann funktionieren Ticket-Eingabe, Events, Suche, CSV-Import und CSV-Export vollständig lokal/offline über den Browser-Speicher.

Alternativ kann der Ordner über einen lokalen Webserver geöffnet werden, zum Beispiel über `http://localhost/...`. In diesem lokalen Entwicklungsmodus verwendet das Tool automatisch die aktuelle lokale Adresse als Basis-URL und erzwingt kein HTTPS-Upgrade.

Share-Links mit Firebase funktionieren nur, wenn Firebase erreichbar ist. Bei reinem `file://`-Start bleibt die App lokal nutzbar, Share/Firebase wird aber bewusst deaktiviert.

## Link

```text
https://wickerm4n.github.io/ticketverwaltung/
```

## Lokaler Modus / Share-Failsafe

Beim direkten lokalen Öffnen der `index.html` oder beim Start über `localhost`, `127.0.0.1` bzw. private LAN-Adressen ist der Share-Link-Button absichtlich deaktiviert. Die App bleibt lokal vollständig nutzbar, Share-Links sollen jedoch nur über die veröffentlichte GitHub-Pages-Seite erstellt werden.


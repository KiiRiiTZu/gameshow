# Gameshow V0.1

Ein kleiner Echtzeit-Prototyp für eine Gameshow mit:

- 1 Moderator
- 4 Spielern
- 2 Teams mit je maximal 2 Spielern
- individuellem Buzzer pro Spieler
- zentraler Punktewertung pro Team
- modularer Spielstruktur für spätere Minispiele
- Supabase Realtime Broadcast

## Projekt starten

Die Seite sollte über einen kleinen lokalen Webserver oder online gehostet werden, nicht direkt per `file://`.

### Lokal

Wenn Python installiert ist:

```bash
python -m http.server 8000
```

Dann im Browser:

```text
http://localhost:8000
```

## Ablauf

1. Moderator öffnet `host.html` bzw. klickt auf **Raum erstellen**.
2. Es wird ein zufälliger Raumcode erzeugt.
3. Spieler öffnen die Startseite auf ihren Geräten.
4. Sie geben den Raumcode ein, wählen Namen und Team.
5. Pro Team können maximal zwei Spieler beitreten.
6. Moderator klickt auf **Buzzer öffnen**.
7. Alle vier Spieler können buzzern.
8. Der Moderator-Browser akzeptiert nur den ersten eingegangenen Buzz.
9. Bei **Richtig** erhält das Team einen Punkt.

## Architektur

```text
Lobby / Raum
├── Teams
├── Spieler
├── Scores
└── aktuelles Spiel

Game Engine
└── Spiele
    ├── Buzzer (V0.1)
    ├── Deutschlandkarte (später)
    ├── Schätzen (später)
    └── ...
```

`js/games/game-engine.js` ist die Registry für Minispiele.
`js/games/buzzer.js` enthält ausschließlich die Buzzer-Spielregeln.
Lobby, Teams und Realtime sind davon getrennt.

## Wichtige Einschränkungen von V0.1

Der Moderator-Browser ist aktuell die autoritative Instanz. Das ist für einen privaten Prototypen gut geeignet, aber noch nicht die endgültige Produktionsarchitektur.

Noch nicht enthalten:

- persistente Datenbank
- Benutzer-Authentifizierung
- private Realtime-Channels
- serverseitige/transaktionale Buzzer-Entscheidung
- Wiederherstellung eines Raums nach Reload des Moderator-Browsers
- Schutz gegen manipulierte Client-Nachrichten

Für V0.2/V0.3 empfiehlt sich, Räume, Spieler, Teams, Matches und Ergebnisse in der Supabase-Datenbank zu modellieren und sicherheitskritische Aktionen serverseitig bzw. atomar abzuwickeln.

## Supabase

Die Browser-Konfiguration liegt in:

```text
js/config.js
```

Der verwendete Publishable Key ist ein Client-Key. Es darf dort niemals ein `service_role`- oder Secret-Key eingetragen werden.

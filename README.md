# Gameshow V3.0

Eine browserbasierte Multiplayer-Gameshow für einen Moderator und vier Spieler in zwei Teams. Räume, Spieler, Punkte und Spielzustände werden mit Supabase gespeichert und über Supabase Realtime synchronisiert.

Die Moderatoransicht ist so gebaut, dass sie sich für Zuschauer streamen lässt: Lösungen bleiben verborgen, bis der Moderator sie aufdeckt.

Die Wertung besteht aus zwei Ebenen. Jedes Spiel verwaltet seine eigene interne Wertung; für den Gesamtsieg erhält das Gewinnerteam anschließend genau einen Spielpunkt. Die Show ist ein Best of 7 und endet, sobald ein Team vier Spiele gewonnen hat.

Zwischen den Spielen dreht sich eine Ankündigungskarte, nach jedem gewonnenen Spiel gibt es eine Siegerehrung mit Konfetti, und der Moderator kann jederzeit eine Punkteübersicht einblenden.

## Ablauf der Show

| Nr. | Spiel | Modus |
|---|---|---|
| 1 | Mittelwert | 15 Fragen, 5 Rundensiege gewinnen |
| 2 | Thrifty | 7 Produkte, 4 Rundensiege gewinnen |
| 3 | Kartenwissen | 7 Fragen, 4 Kartenpunkte gewinnen |
| 4 | Begriffsmatch | 4 Kategorien, meiste Treffer gewinnen |
| 5 | Einordnen | 3 Listen, 2 Listensiege gewinnen |
| 6 | Da seh ich dich | 4 Runden, meiste Übereinstimmungen gewinnen |
| 7 | SET | Beispielrunde plus 9 Kartenrunden, 5 Punkte gewinnen |

Die Reihenfolge steht in `GAME_SEQUENCE` in `js/game-effects.js`.

### Spiel 1: Mittelwert

- Alle vier Spieler geben eine eigene Schätzung ab, jede nur für den Moderator sichtbar.
- Aus den beiden Antworten eines Teams wird der Mittelwert gebildet.
- Das Team mit der geringeren Abweichung gewinnt die Runde.
- Das erste Team mit fünf Rundensiegen gewinnt das Spiel.

### Spiel 2: Thrifty

- Sieben Produkte werden nacheinander gezeigt.
- Beide Spieler eines Teams bearbeiten einen gemeinsamen Euro-Tipp und eine live synchronisierte Team-Notiz.
- Tipp und Notiz sind nur für die beiden Teamspieler und den Moderator lesbar.
- Nach dem Einloggen beider Teams deckt der Moderator den echten Preis und die Abstände auf.
- Das nähere Team gewinnt die Runde; das erste Team mit vier Rundensiegen gewinnt das Spiel.

### Spiel 3: Kartenwissen

- Sieben Fragen führen zu Städten und Sehenswürdigkeiten in ganz Europa.
- Beide Spieler eines Teams teilen sich einen gemeinsamen Pin und können ihn bis zum Einloggen verschieben.
- Sobald beide Teams eingeloggt haben, sehen alle beide Pins; Ziel und Distanzen bleiben bis zur Auflösung verborgen.
- Die Luftlinie zwischen Team-Pin und Ziel wird in Kilometern berechnet.
- Das nähere Team erhält einen Kartenpunkt; das erste Team mit vier Punkten gewinnt das Spiel.

### Spiel 4: Begriffsmatch

- Vier Kategorien, in jeder schreibt ein Spieler pro Team zehn Begriffe auf (120 Sekunden).
- Anschließend versucht der Teampartner, dieselben Begriffe zu treffen (45 Sekunden je Team).
- Jede Übereinstimmung zählt einen Treffer. Die Rollen wechseln von Runde zu Runde.
- Bei Gleichstand nach vier Kategorien entscheidet ein Stechen zur Kategorie Kino (90 Sekunden).

### Spiel 5: Einordnen

- Drei vorbereitete Ranglisten, jede mit einem bereits gesetzten Anker.
- Die Teams ordnen abwechselnd einen Begriff relativ zu den bereits platzierten ein.
- Pro Zug laufen 90 Sekunden; danach entscheidet der Moderator zwischen Kulanz und Strafpunkt.
- Eine falsche Einordnung ist ein Kreuz; nach zwei Kreuzen verliert ein Team die Liste.
- Das erste Team mit zwei Listensiegen gewinnt das Spiel.

### Spiel 6: Da seh ich dich

- Vier Runden mit je vier Bildern.
- Zuerst ordnet Spieler 1 beider Teams Personen den Bildern zu, danach versucht Spieler 2 dieselbe Zuordnung.
- Die Spieler wählen selbst; die Zuordnungen sind bis zum Aufdecken verschlüsselt und nur für den Moderator lesbar.
- Jede Übereinstimmung innerhalb eines Teams zählt einen Punkt.
- Das Spiel endet vorzeitig, sobald ein Team mathematisch nicht mehr eingeholt werden kann. Bei Gleichstand entscheidet das Golden Image.

### Spiel 7: SET

- Zwölf nummerierte Karten zeigen Form, Farbe, Füllung und Anzahl in je drei Ausprägungen.
- Alle vier Spieler können buzzern; der erste gültige Buzz wird angenommen.
- Der Moderator markiert die drei genannten Karten und entscheidet anschließend richtig oder falsch.
- Richtig gibt einen Punkt für das antwortende Team, falsch einen Punkt für das Gegnerteam.
- Die erste Runde erklärt das Prinzip und zählt nicht; das erste Team mit fünf Punkten gewinnt.
- Zwischen den Runden drehen sich alle Karten um und werden mit der nächsten Vorlage neu aufgedeckt.

## Spiel auf der Bank

**Top 20** und **Buzzer Quiz** sind vollständig implementiert, gehören aber nicht zur aktiven Reihenfolge. Um eines davon wieder einzuhängen, muss es in `GAME_SEQUENCE` aufgenommen und der Spielwechsel verdrahtet werden.

## Lokal starten

Die App muss über einen Webserver geöffnet werden, nicht direkt per `file://` — sonst blockiert der Browser die ES-Module.

```bash
npm start
```

Danach `http://localhost:8000` im Browser öffnen. Der Server unter `scripts/dev-server.mjs` braucht keine Abhängigkeiten; ein beliebiger anderer Static-Server tut es genauso.

## Tests

```bash
npm test
```

Getestet werden die Spielregeln, der Raumzustand, die Verschlüsselung der privaten Teamkanäle und die Effekte. Die Ansichten `js/host.js` und `js/player.js` sind nicht abgedeckt.

## Supabase

Die Browser-Konfiguration befindet sich in `js/config.js`. Dort darf ausschließlich ein Publishable Key verwendet werden, niemals ein `service_role`- oder Secret-Key.

Für die geräteübergreifende Wiederherstellung müssen die beiden Migrationen aus `supabase/migrations/` einmal in ihrer Reihenfolge im SQL Editor ausgeführt werden. `game_state` speichert den Zustand des aktuellen Spiels; `game_results` hält fest, welches Team welches Spiel gewonnen hat und stellt damit die Punkteübersicht wieder her.

Ohne eine der Spalten bleibt die laufende Show funktionsfähig und der Moderator-Browser hält den jeweiligen Zustand lokal. Ein Wechsel auf ein anderes Moderator-Gerät kann diesen lokalen Stand jedoch nicht übernehmen.

## Projektstruktur

```text
index.html                      Startseite und Raumcode
host.html                       Moderatoransicht
player.html                     Spieleransicht
js/config.js                    Supabase-Zugangsdaten für den Browser
js/database.js                  Supabase-Datenzugriff
js/realtime.js                  Raumbezogene Broadcasts
js/room.js                      Gemeinsamer Raumzustand, Teams, Ergebnis-Historie
js/audio.js                     Buzzer-Sound samt Freischaltung
js/confetti.js                  Konfetti der Siegerehrung
js/game-effects.js              Übergangskarte, Siegerehrung, Punkteübersicht
js/moderator-score.js           Manuelle Punktekorrektur des Moderators
js/team-chat.js                 Privater Teamchat
js/private-channel-crypto.js    Verschlüsselte private Team-Payloads
js/europe-map-view.js           Interaktive SVG-Europakarte (von Kartenwissen genutzt)
js/ranking-motion.js            Flug-Animation bei Einordnen
js/games/game-engine.js         Registry der Minispiele
js/games/*.js                   Regeln und Fragen der einzelnen Spiele
scripts/dev-server.mjs          Abhängigkeitsfreier Server für die Entwicklung
supabase/migrations/            Versionierte Datenbankänderungen
tests/                          Regel-, Zustands- und Effekttests
```

## Noch offene Produktionshärtung

- Moderator-Authentifizierung und Rollenmodell. Aktuell ist Moderator, wer `host.html` öffnet.
- Strengere RLS-Policies. Die SELECT- und UPDATE-Policies auf `rooms` und `players` erlauben derzeit jedem alles; nur Löschen ist gesperrt.
- Private Realtime-Channels. Jeder im Raum kann beliebige Events senden, auch ein gefälschtes `room_state`.
- Atomare serverseitige Entscheidung des ersten Buzzers. Aktuell entscheidet die Zustellreihenfolge beim Moderator, also die Netzlatenz.
- Atomare serverseitige Durchsetzung der Teamkapazität.
- Alle Lösungen werden an die Clients ausgeliefert und sind in den Entwicklertools einsehbar.

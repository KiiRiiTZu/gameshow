# Gameshow V0.3

Eine browserbasierte Multiplayer-Gameshow für einen Moderator und vier Spieler in zwei Teams. Räume, Spieler, Punkte und Spielzustände werden mit Supabase gespeichert und über Supabase Realtime synchronisiert.

Die Wertung besteht aus zwei Ebenen: Jedes Spiel verwaltet seine eigene interne Wertung. Für den Gesamtsieg erhält das Gewinnerteam anschließend genau einen Spielpunkt.

## Enthaltene Spiele

### Spiel 1: Buzzer Quiz

- Der Moderator öffnet den Buzzer für eine Frage.
- Der erste gültige Buzz wird angenommen.
- Für eine richtige Antwort erhält das Team einen Quizpunkt.
- Das erste Team mit fünf Punkten gewinnt das Spiel.
- Das Gewinnerteam erhält einen Spielpunkt für die Gesamtwertung.
- Danach kann der Moderator Spiel 2 starten.

### Spiel 2: Top 20 (Best of 3)

- Gespielt werden drei vorbereitete Listen: Spotify-Stars, bevölkerungsreichste Länder und umsatzstärkste deutsche Unternehmen.
- Team Blau und Team Rot nennen abwechselnd einen Eintrag.
- Der Moderator wählt die passende vorbereitete Lösung aus und deckt sie auf; eine Texteingabe ist nicht mehr nötig.
- Ist die Antwort nicht dabei, trägt der Moderator ein Kreuz für das aktive Team ein.
- Nach drei Kreuzen verliert ein Team die aktuelle Runde.
- Das erste Team mit zwei Rundensiegen gewinnt das Spiel und erhält einen Spielpunkt für die Gesamtwertung.

## Lokal starten

Die App muss über einen Webserver geöffnet werden, nicht direkt per `file://`.

```bash
python -m http.server 8000
```

Danach `http://localhost:8000` im Browser öffnen.

## Supabase

Die Browser-Konfiguration befindet sich in `js/config.js`. Dort darf ausschließlich ein Publishable Key verwendet werden, niemals ein `service_role`- oder Secret-Key.

Für die Persistenz variabler Spielzustände muss die Migration aus
`supabase/migrations/202608120001_add_room_game_state.sql` einmal im Supabase SQL Editor ausgeführt werden.

Ohne diese Migration bleibt der Spielablauf funktionsfähig und der Moderator-Browser hält einen lokalen Recovery-Zustand. Eine geräteübergreifende Wiederherstellung des zweiten Spiels benötigt jedoch die Migration.

## Projektstruktur

```text
index.html                     Startseite und Raumcode
host.html                      Moderatoransicht
player.html                    Spieleransicht
js/database.js                 Supabase-Datenzugriff
js/realtime.js                 Raumbezogene Broadcasts
js/room.js                     Gemeinsamer Raumzustand
js/games/game-engine.js        Registry der Minispiele
js/games/buzzer.js             Regeln des Buzzer Quiz
js/games/spotify-top-artists.js Regeln des Top-20-Spiels
js/games/top-20-lists.js       Vorbereitete Lösungen für alle drei Runden
supabase/migrations/           Versionierte Datenbankänderungen
tests/                         Regeltests
```

## Tests

```bash
node --test tests/*.test.mjs
```

## Noch offene Produktionshärtung

- Moderator-Authentifizierung und Rollenmodell
- private Realtime-Channels und strengere RLS-Policies
- atomare serverseitige Entscheidung des ersten Buzzers
- atomare serverseitige Durchsetzung der Teamkapazität

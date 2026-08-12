# Gameshow V0.3

Eine browserbasierte Multiplayer-Gameshow für einen Moderator und vier Spieler in zwei Teams. Räume, Spieler, Punkte und Spielzustände werden mit Supabase gespeichert und über Supabase Realtime synchronisiert.

## Enthaltene Spiele

### Spiel 1: Buzzer Quiz

- Der Moderator öffnet den Buzzer für eine Frage.
- Der erste gültige Buzz wird angenommen.
- Für eine richtige Antwort erhält das Team einen Punkt.
- Das erste Team mit fünf Punkten gewinnt das Spiel.
- Danach kann der Moderator Spiel 2 starten.

### Spiel 2: Spotify Top 20

- Gesucht werden die 20 meistgestreamten Künstler auf Spotify 2026.
- Team Blau und Team Rot nennen abwechselnd einen Künstler.
- Der Moderator trägt einen Treffer auf dem richtigen Rang von 1 bis 20 ein.
- Ist die Antwort nicht dabei, trägt der Moderator ein Kreuz für das aktive Team ein.
- Das erste Team mit drei Kreuzen verliert das Spiel.

Die zugrunde liegende Künstlerliste wird nicht automatisch validiert. Der Moderator arbeitet mit einer separaten Lösungsliste und entscheidet über Treffer und Rang.

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
js/games/spotify-top-artists.js Regeln des Spotify-Spiels
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

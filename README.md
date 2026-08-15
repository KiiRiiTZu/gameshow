# Gameshow V1.0

Eine browserbasierte Multiplayer-Gameshow für einen Moderator und vier Spieler in zwei Teams. Räume, Spieler, Punkte und Spielzustände werden mit Supabase gespeichert und über Supabase Realtime synchronisiert.

Zwischen den Spielen erscheint eine automatisch drehende Ankündigungskarte.

Die Wertung besteht aus zwei Ebenen: Jedes Spiel verwaltet seine eigene interne Wertung. Für den Gesamtsieg erhält das Gewinnerteam anschließend genau einen Spielpunkt. Die gesamte Gameshow ist ein Best of 5 und endet, sobald ein Team drei Spiele gewonnen hat.

## Enthaltene Spiele

### Spiel 1: Buzzer Quiz

- Der Moderator öffnet den Buzzer für eine Frage.
- Der erste gültige Buzz wird angenommen.
- Sobald der erste Buzz bestätigt ist, wird der Buzzer-Sound beim Moderator und bei allen verbundenen Spielern abgespielt.
- Der Moderator sieht die vorbereitete Frage vollständig, aber keine eingeblendete Antwort.
- Für eine richtige Antwort erhält das Team drei Quizpunkte.
- Bei einer falschen Antwort erhält das Gegnerteam einen Quizpunkt und der Buzzer wird für dieselbe Frage erneut geöffnet.
- Das erste Team mit 20 Punkten gewinnt das Spiel.
- Das Gewinnerteam erhält einen Spielpunkt für die Gesamtwertung.
- Danach kann der Moderator Spiel 2 starten.

### Spiel 2: Thrifty (Best of 9)

- Neun Amazon-Produkte werden nacheinander gezeigt.
- Beide Spieler eines Teams bearbeiten einen gemeinsamen Euro-Tipp und eine live synchronisierte Team-Notiz.
- Team-Tipp und Notiz sind nur für die beiden Teamspieler und den Moderator lesbar.
- Beide Spieler können den gemeinsamen Preis einloggen.
- Nach dem Einloggen beider Teams deckt der Moderator den echten Preis und die Abstände auf.
- Das nähere Team gewinnt die Runde; das erste Team mit fünf Rundensiegen gewinnt das Spiel.

### Spiel 3: Top 20 (Best of 3)

- Gespielt werden drei vorbereitete Listen: Spotify-Stars, bevölkerungsreichste Länder und umsatzstärkste deutsche Unternehmen.
- Team Blau und Team Rot nennen abwechselnd einen Eintrag.
- Beide Spieler eines Teams teilen sich eine verschlüsselte Live-Notiz, die zusätzlich der Moderator sieht.
- In der streambaren Moderatoransicht bleiben alle Lösungen verborgen. Der Moderator klickt nur auf den passenden Rang, um den hinterlegten Eintrag samt Wert aufzudecken.
- Ist die Antwort nicht dabei, trägt der Moderator ein Kreuz für das aktive Team ein.
- Nach zwei Kreuzen verliert ein Team die aktuelle Runde.
- Das erste Team mit zwei Rundensiegen gewinnt das Spiel und erhält einen Spielpunkt für die Gesamtwertung.

### Spiel 4: Kartenwissen (Best of 11)

- Elf vorbereitete Fragen führen zu Städten und Sehenswürdigkeiten in ganz Deutschland.
- Beide Spieler eines Teams teilen sich einen gemeinsamen Pin und können ihn bis zum Einloggen verschieben.
- Beide Teampartner können die gemeinsame Antwort einloggen.
- Sobald beide Teams eingeloggt haben, sehen alle Spieler beide Pins; Ziel und Distanzen bleiben bis zur Auflösung verborgen.
- Der Moderator sieht die Pins beider Teams in Echtzeit und deckt anschließend das Ziel auf.
- Die Luftlinie zwischen Team-Pin und Ziel wird in Kilometern berechnet.
- Das nähere Team erhält einen Kartenpunkt; das erste Team mit sechs Punkten gewinnt das Spiel.
- Das Gewinnerteam erhält einen Spielpunkt für die Gesamtwertung.

### Spiel 5: Da seh ich dich (4 Runden)

- Pro Runde spielt nur ein Team: Blau in Runde 1 und 3, Rot in Runde 2 und 4.
- Zuerst gibt Spieler 1 des aktiven Teams vier Zuordnungen vor, anschließend versucht Spieler 2 zu matchen.
- Nur der Moderator trägt die Namen über Dropdown-Felder ein; die Spieler sehen die Zuordnungen erst beim Aufdecken.
- Eine Person darf mehreren Bildern zugeordnet werden.
- Jede Übereinstimmung innerhalb eines Teams zählt einen Punkt.
- Das Spiel endet vorzeitig, sobald ein Team mathematisch nicht mehr eingeholt werden kann; andernfalls gewinnt nach vier Runden das Team mit den meisten Übereinstimmungen einen Spielpunkt.
- Nach dem letzten Spiel wird der Gesamtsieger der Gameshow angezeigt.

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

Ohne diese Migration bleibt der Spielablauf funktionsfähig und der Moderator-Browser hält einen lokalen Recovery-Zustand. Eine geräteübergreifende Wiederherstellung der späteren Spiele benötigt jedoch die Migration.

## Projektstruktur

```text
index.html                     Startseite und Raumcode
host.html                      Moderatoransicht
player.html                    Spieleransicht
js/database.js                 Supabase-Datenzugriff
js/realtime.js                 Raumbezogene Broadcasts
js/audio.js                    Gemeinsame Soundeffekte
js/room.js                     Gemeinsamer Raumzustand
js/games/game-engine.js        Registry der Minispiele
js/games/buzzer.js             Regeln des Buzzer Quiz
js/games/buzzer-questions.js   Vorbereitete Buzzer-Fragen
js/games/spotify-top-artists.js Regeln des Top-20-Spiels
js/games/top-20-lists.js       Vorbereitete Lösungen für alle drei Runden
js/games/germany-map.js        Fragen, Ziele, Distanz- und Spielregeln
js/germany-map-view.js         Interaktive SVG-Deutschlandkarte
js/games/matching-game.js      Regeln von Da seh ich dich
js/games/guess-the-price.js    Regeln von Thrifty
js/private-channel-crypto.js   Verschlüsselte private Team-Payloads
assets/audio/buzzer.mp3        Soundeffekt für den ersten gültigen Buzz
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

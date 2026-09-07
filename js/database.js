import { supabase } from "./supabase-client.js";

// Gelesen wird über Datenbankfunktionen, die den Raumcode verlangen, statt über
// die offen liegenden Tabellen. Solange die Migration
// 202609070001_add_room_read_functions.sql nicht eingespielt ist, fällt jeder
// Zugriff auf den bisherigen Direktweg zurück — so bleibt die App lauffähig,
// bevor die Datenbank umgestellt ist.
let supportsRoomFunctions = true;

function isMissingFunction(error) {
  return error?.code === "PGRST202" ||
    /could not find the function|does not exist/i.test(String(error?.message || ""));
}

function disableRoomFunctions() {
  if (!supportsRoomFunctions) return;
  supportsRoomFunctions = false;
  console.warn(
    "Supabase room functions are not installed yet; falling back to direct table access."
  );
}

export async function createRoom(roomCode) {
  if (supportsRoomFunctions) {
    const { data, error } = await supabase
      .rpc("create_room", { p_code: roomCode })
      .maybeSingle();

    if (!error) return data;
    if (!isMissingFunction(error)) throw error;
    disableRoomFunctions();
  }

  const { data, error } = await supabase
    .from("rooms")
    .insert({
      code: roomCode,
      status: "waiting",
      blue_score: 0,
      red_score: 0,
      current_game: "estimation-game",
      game_status: "not-started"
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function getRoomByCode(roomCode) {
  if (supportsRoomFunctions) {
    const { data, error } = await supabase
      .rpc("room_by_code", { p_code: roomCode })
      .maybeSingle();

    if (!error) return data;
    if (!isMissingFunction(error)) throw error;
    disableRoomFunctions();
  }

  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", roomCode)
    .maybeSingle();

  if (error) throw error;

  return data;
}

// Kein .select() mehr: der Rückgabewert wird nirgends gebraucht, und ein
// "returning" würde ein Leserecht auf die Tabelle verlangen, das später wegfällt.
export async function updateRoom(roomId, changes) {
  const { error } = await supabase
    .from("rooms")
    .update(changes)
    .eq("id", roomId);

  if (error) throw error;
}

export async function updateRoomGameState(roomId, gameState) {
  const { error } = await supabase
    .from("rooms")
    .update({ game_state: gameState })
    .eq("id", roomId);

  if (!error) return true;

  const missingColumn = error.code === "PGRST204" ||
    String(error.message || "").includes("game_state");

  if (missingColumn) return false;
  throw error;
}

/** Erwartet den Raumdatensatz: der Code adressiert die Funktion, die Id den Rückfallweg. */
export async function getPlayers(room) {
  if (supportsRoomFunctions && room?.code) {
    const { data, error } = await supabase
      .rpc("players_in_room", { p_code: room.code });

    if (!error) return data || [];
    if (!isMissingFunction(error)) throw error;
    disableRoomFunctions();
  }

  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("room_id", room?.id)
    .order("created_at");

  if (error) throw error;

  return data;
}

export async function savePlayer(player, roomId) {
  const { error } = await supabase
    .from("players")
    .upsert(
      {
        id: player.id,
        room_id: roomId,
        name: player.name,
        team: player.team
      },
      {
        onConflict: "id"
      }
    );

  if (error) throw error;
}

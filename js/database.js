import { supabase } from "./supabase-client.js";

export async function createRoom(roomCode) {
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      code: roomCode,
      status: "waiting",
      blue_score: 0,
      red_score: 0,
      current_game: "buzzer",
      game_status: "waiting"
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function getRoomByCode(roomCode) {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", roomCode)
    .maybeSingle();

  if (error) throw error;

  return data;
}

export async function updateRoom(roomId, changes) {
  const { data, error } = await supabase
    .from("rooms")
    .update(changes)
    .eq("id", roomId)
    .select()
    .single();

  if (error) throw error;

  return data;
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

export async function getPlayers(roomId) {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at");

  if (error) throw error;

  return data;
}

export async function savePlayer(player, roomId) {
  const { data, error } = await supabase
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
    )
    .select()
    .single();

  if (error) throw error;

  return data;
}

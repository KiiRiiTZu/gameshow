export const TEAM_CHAT_GAME_IDS = ["guess-the-price", "spotify-top-artists", "germany-map"];
export const TEAM_CHAT_TEXT_LIMIT = 500;

export function supportsTeamChat(gameId) {
  return TEAM_CHAT_GAME_IDS.includes(gameId);
}

export function createTeamChat(gameId = null) {
  return {
    gameId,
    blue: { messages: [], typing: {} },
    red: { messages: [], typing: {} }
  };
}

export function addTeamChatMessage(chat, team, sender, text, id, sentAt = Date.now()) {
  if (!chat?.[team] || !sender?.id) return false;
  const cleanText = String(text || "").trim().slice(0, TEAM_CHAT_TEXT_LIMIT);
  if (!cleanText) return false;

  chat[team].messages.push({
    id: String(id || `${sender.id}-${sentAt}`),
    senderId: sender.id,
    senderName: String(sender.name || "Spieler").slice(0, 20),
    text: cleanText,
    sentAt: Number(sentAt) || Date.now()
  });
  delete chat[team].typing[sender.id];
  return true;
}

export function setTeamChatTyping(chat, team, sender, isTyping, now = Date.now()) {
  if (!chat?.[team] || !sender?.id) return false;
  if (!isTyping) {
    const existed = Boolean(chat[team].typing[sender.id]);
    delete chat[team].typing[sender.id];
    return existed;
  }
  chat[team].typing[sender.id] = {
    playerId: sender.id,
    name: String(sender.name || "Spieler").slice(0, 20),
    expiresAt: now + 2500
  };
  return true;
}

export function getTeamChatView(chat, team, now = Date.now()) {
  const teamChat = chat?.[team] || { messages: [], typing: {} };
  return {
    gameId: chat?.gameId || null,
    team,
    messages: teamChat.messages.map((message) => ({ ...message })),
    typing: Object.values(teamChat.typing)
      .filter((entry) => entry.expiresAt > now)
      .map(({ playerId, name }) => ({ playerId, name }))
  };
}

export function clearExpiredTeamChatTyping(chat, now = Date.now()) {
  const expiredEntries = [];
  for (const team of ["blue", "red"]) {
    for (const [playerId, entry] of Object.entries(chat?.[team]?.typing || {})) {
      if (entry.expiresAt <= now) {
        expiredEntries.push({ team, playerId, name: entry.name });
        delete chat[team].typing[playerId];
      }
    }
  }
  return expiredEntries;
}

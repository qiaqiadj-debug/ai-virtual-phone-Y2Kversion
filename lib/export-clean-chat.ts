// lib/export-clean-chat.ts
// Export chat history as clean, training-friendly JSON.
// Only keeps useful fields: session, character, role, content, timestamp.

import { chatDb } from "./chat-db";
import type { ChatMessage, ChatSession, ChatContact } from "./chat-storage";

export type CleanMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
};

export type CleanSession = {
  sessionId: string;
  characterName: string;
  characterId?: string;
  messages: CleanMessage[];
};

export async function exportCleanChatHistory(): Promise<CleanSession[]> {
  const [messages, sessions, contacts] = await Promise.all([
    chatDb.messages.toArray(),
    chatDb.sessions.toArray(),
    chatDb.contacts.toArray(),
  ]);

  const contactMap = new Map(contacts.map(c => [c.id, c]));
  const sessionMap = new Map(sessions.map(s => [s.id, s]));

  const grouped = new Map<string, ChatMessage[]>();
  for (const msg of messages) {
    if (!msg.sessionId) continue;
    if (!grouped.has(msg.sessionId)) grouped.set(msg.sessionId, []);
    grouped.get(msg.sessionId)!.push(msg);
  }

  const result: CleanSession[] = [];

  for (const [sessionId, msgs] of grouped) {
    const session = sessionMap.get(sessionId);
    if (!session) continue;

    const contact = session.contactId ? contactMap.get(session.contactId) : undefined;
    const characterName = contact?.name || session.title || "Unknown";

    const cleanMessages: CleanMessage[] = msgs
      .filter(m => m.content && m.content.trim() && (m.role === "user" || m.role === "assistant" || m.role === "system"))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(m => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content.trim(),
        timestamp: m.createdAt,
      }));

    if (cleanMessages.length > 0) {
      result.push({
        sessionId,
        characterName,
        characterId: contact?.characterId,
        messages: cleanMessages,
      });
    }
  }

  // Sort sessions by last message time (newest first)
  result.sort((a, b) => {
    const aTime = a.messages[a.messages.length - 1]?.timestamp || "";
    const bTime = b.messages[b.messages.length - 1]?.timestamp || "";
    return bTime.localeCompare(aTime);
  });

  return result;
}

export function downloadCleanChatJson(data: CleanSession[]) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chat-history-clean-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

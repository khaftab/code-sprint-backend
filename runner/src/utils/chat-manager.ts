// In-memory message storage
const messageStore = new Map(); // roomId -> messages[]

// Maximum number of messages to store per room
const MAX_MESSAGES_PER_ROOM = 100;

type Message = {
  id: string;
  message: string;
  username: string;
  timestamp: string;
};

// Add a message to storage
export function storeMessage(roomId: string, message: Message) {
  if (!messageStore.has(roomId)) {
    messageStore.set(roomId, []);
  }

  const roomMessages = messageStore.get(roomId);
  roomMessages.push(message);

  // Keep only the most recent messages (limit to prevent memory issues)
  if (roomMessages.length > MAX_MESSAGES_PER_ROOM) {
    roomMessages.shift(); // Remove oldest message
  }

  return roomMessages;
}

// Get all messages for a room
export function getMessagesForRoom(roomId: string) {
  return messageStore.get(roomId) || [];
}

// Clear messages for a room (e.g., when last person leaves)
function clearRoomMessages(roomId: string) {
  messageStore.delete(roomId);
}

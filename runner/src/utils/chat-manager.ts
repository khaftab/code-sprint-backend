const messageStore = new Map(); // roomId -> messages[]

const MAX_MESSAGES_PER_ROOM = 100;

type Message = {
  id: string;
  message: string;
  username: string;
  timestamp: string;
};

export function storeMessage(roomId: string, message: Message) {
  if (!messageStore.has(roomId)) {
    messageStore.set(roomId, []);
  }

  const roomMessages = messageStore.get(roomId);
  roomMessages.push(message);

  if (roomMessages.length > MAX_MESSAGES_PER_ROOM) {
    roomMessages.shift(); // Remove oldest message
  }

  return roomMessages;
}

// Get all messages for a room
export function getMessagesForRoom(roomId: string) {
  return messageStore.get(roomId) || [];
}

// In-memory message storage
const snapshotStore = new Map(); // roomId -> messages[]

// Maximum number of messages to store per room
// const MAX_MESSAGES_PER_ROOM = 400;

type Snapshot = {
  added: any;
  updated: any;
  removed: any;
};

// Add a message to storage
export function storeSnapshot(roomId: string, snapshot: Snapshot) {
  if (!snapshotStore.has(roomId)) {
    snapshotStore.set(roomId, []);
  }

  const roomMessages = snapshotStore.get(roomId);
  roomMessages.push(snapshot);

  // Keep only the most recent messages (limit to prevent memory issues)
  // if (roomMessages.length > MAX_MESSAGES_PER_ROOM) {
  //   roomMessages.shift(); // Remove oldest message
  // }

  return roomMessages;
}

// Get all messages for a room
export function getSnapshots(roomId: string) {
  return snapshotStore.get(roomId) || [];
}

// Clear messages for a room (e.g., when last person leaves)
function clearSnapshots(roomId: string) {
  snapshotStore.delete(roomId);
}

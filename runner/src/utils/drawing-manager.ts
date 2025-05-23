const snapshotStore = new Map();

type Snapshot = {
  added: any;
  updated: any;
  removed: any;
};

export function storeSnapshot(roomId: string, snapshot: Snapshot) {
  if (!snapshotStore.has(roomId)) {
    snapshotStore.set(roomId, []);
  }

  const roomMessages = snapshotStore.get(roomId);
  roomMessages.push(snapshot);

  return roomMessages;
}

export function getSnapshots(roomId: string) {
  return snapshotStore.get(roomId) || [];
}

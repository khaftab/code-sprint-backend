import { Socket, Server } from "socket.io";
import { USER_CONNECTION_STATUS, User } from "../types/user";
import { SocketEvent, SocketId } from "../types/socket";
import { FileManager } from "../utils/file-manager";
import path from "path";
import { fileWatcherService, FileWatcher } from "../utils/file-watcher";
import { getMessagesForRoom, storeMessage } from "../utils/chat-manager";
import { getSnapshots, storeSnapshot } from "../utils/drawing-manager";
// import { fileWatcherService } from "../server";
let userSocketMap: User[] = [];
export const handleCollabConnection = (socket: Socket, io: Server) => {
  // const fileWatcher = new FileWatcher(io);
  // Handle user actions
  // Function to get all users in a room
  function getUsersInRoom(roomId: string): User[] {
    return userSocketMap.filter((user) => user.roomId == roomId);
  }

  // Function to get room id by socket id
  function getRoomId(socketId: SocketId): string | null {
    const roomId = userSocketMap.find((user) => user.socketId === socketId)?.roomId;

    if (!roomId) {
      // console.error("Room ID is undefined for socket ID:", socketId);
      return null;
    }
    return roomId;
  }

  function getUserBySocketId(socketId: SocketId): User | null {
    const user = userSocketMap.find((user) => user.socketId === socketId);
    if (!user) {
      console.error("User not found for socket ID:", socketId);
      return null;
    }
    return user;
  }

  socket.on(SocketEvent.JOIN_REQUEST, async ({ roomId, username }) => {
    console.log("join request", { roomId, username });

    // Check if username exists
    const isUsernameExist = getUsersInRoom(roomId).filter((u) => u.username === username);
    console.log("username exist", isUsernameExist);

    if (isUsernameExist.length > 0) {
      io.to(socket.id).emit(SocketEvent.USERNAME_EXISTS);
      return;
    }

    // Add user to room
    const user = {
      username,
      roomId,
      status: USER_CONNECTION_STATUS.ONLINE,
      cursorPosition: 0,
      typing: false,
      socketId: socket.id,
      currentFile: null,
    };
    userSocketMap.push(user);
    socket.join(roomId);

    // Notify other users
    socket.broadcast.to(roomId).emit(SocketEvent.USER_JOINED, { user });
    const users = userSocketMap.filter((u) => u.roomId === roomId);

    // Accept join request
    io.to(socket.id).emit(SocketEvent.JOIN_ACCEPTED, { user, users });

    // Get and send file watcher instance
    const fw = fileWatcherService(io);

    try {
      // Make sure watcher is running (for file changes), but we'll use direct structure delivery
      if (!fw.watcher) {
        // Start watcher with ignoreInitial: true (set in the updated implementation)
        await fw.startWatching();
      }

      // Always build and send the complete file structure directly
      console.log("Building file structure for new user");
      const fileStructure = await fw.buildInitialFileStructure();
      io.to(socket.id).emit(SocketEvent.SYNC_FILE_STRUCTURE, { fileStructure });
    } catch (error) {
      console.error("Error setting up file system for user:", error);
      socket.emit(SocketEvent.ERROR, {
        message: "Error setting up file system",
      });
    }

    // Send message history
    const messages = getMessagesForRoom(roomId);
    if (messages.length > 0) {
      console.log("sending history", messages);
      io.to(socket.id).emit(SocketEvent.MESSAGE_HISTORY, messages);
    }
  });

  socket.on("disconnecting", () => {
    console.log("User disconnected", socket.id);

    const user = getUserBySocketId(socket.id);
    console.log("Disconnected user", user?.username);

    if (!user) return;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.USER_DISCONNECTED, { user });
    userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id);
    socket.leave(roomId);
  });

  // Handle file actions
  // socket.on(
  //   SocketEvent.SYNC_FILE_STRUCTURE,
  //   ({ fileStructure, openFiles, activeFile, socketId }) => {
  //     console.log("Syncfile is called");
  //     // called when someone joins to the room if there is already poeple in there.
  //     console.log(fileStructure);

  //     io.to(socketId).emit(SocketEvent.SYNC_FILE_STRUCTURE, {
  //       fileStructure,
  //       openFiles,
  //       activeFile,
  //     });
  //   }
  // );

  socket.on(SocketEvent.DIRECTORY_CREATED, async ({ parentDirId, newDirectory }) => {
    try {
      await FileManager.createDirectory(parentDirId, newDirectory);
      const roomId = getRoomId(socket.id);
      if (!roomId) return;
      socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_CREATED, {
        parentDirId,
        newDirectory,
      });
    } catch (error) {
      socket.emit(SocketEvent.ERROR, {
        message: "Error creating directory",
      });
    }
  });

  socket.on(SocketEvent.DIRECTORY_UPDATED, ({ dirId, children }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_UPDATED, {
      dirId,
      children,
    });
  });

  socket.on(SocketEvent.DIRECTORY_RENAMED, async ({ dirId, newDirName }) => {
    console.log("Renaming directory", dirId, newDirName);
    try {
      await FileManager.renameItem(dirId, newDirName);
      const roomId = getRoomId(socket.id);
      if (!roomId) return;
      socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_RENAMED, {
        dirId,
        newName: newDirName,
      });
    } catch (error) {
      socket.emit("error", {
        message: "Error renaming directory",
      });
    }
  });

  socket.on(SocketEvent.DIRECTORY_DELETED, async ({ dirId }) => {
    try {
      await FileManager.deleteItem(dirId);
      const roomId = getRoomId(socket.id);
      if (!roomId) return;
      socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_DELETED, { dirId });
    } catch (error) {
      socket.emit(SocketEvent.ERROR, {
        message: "Error deleting directory",
      });
    }
  });

  socket.on(SocketEvent.FILE_CREATED, async ({ parentDirId, newFile }) => {
    try {
      await FileManager.createFile(parentDirId, newFile);

      const roomId = getRoomId(socket.id);
      if (!roomId) return;
      socket.broadcast.to(roomId).emit(SocketEvent.FILE_CREATED, { parentDirId, newFile });
    } catch (error) {
      socket.emit(SocketEvent.ERROR, {
        message: "Error creating file",
      });
    }
  });

  socket.on(SocketEvent.FILE_UPDATED, async ({ fileId, newContent }) => {
    try {
      // Mark update as coming from editor to prevent feedback loop
      fileWatcherService(io).setUpdateSource("editor");

      // Update file content through the file manager
      await FileManager.updateFileContent(fileId, newContent);

      // Broadcast to other users in the room
      const roomId = getRoomId(socket.id);
      if (!roomId) return;

      socket.broadcast.to(roomId).emit(SocketEvent.FILE_UPDATED, {
        fileId,
        newContent,
        from: "editor",
      });
    } catch (error) {
      socket.emit(SocketEvent.ERROR, {
        message: "Error updating file",
      });
    }
  });

  socket.on(SocketEvent.FILE_RENAMED, async ({ fileId, newName }) => {
    try {
      await FileManager.renameItem(fileId, newName);

      const roomId = getRoomId(socket.id);
      if (!roomId) return;
      socket.broadcast.to(roomId).emit(SocketEvent.FILE_RENAMED, {
        fileId,
        newName,
      });
    } catch (error) {
      socket.emit(SocketEvent.ERROR, {
        message: "Error renaming file",
      });
    }
  });

  socket.on(SocketEvent.FILE_DELETED, async ({ fileId }) => {
    try {
      await FileManager.deleteItem(fileId);

      const roomId = getRoomId(socket.id);
      if (!roomId) return;
      socket.broadcast.to(roomId).emit(SocketEvent.FILE_DELETED, { fileId });
    } catch (error) {
      socket.emit(SocketEvent.ERROR, {
        message: "Error deleting file",
      });
    }
  });

  // Handle user status
  socket.on(SocketEvent.USER_OFFLINE, ({ socketId }) => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socketId) {
        return { ...user, status: USER_CONNECTION_STATUS.OFFLINE };
      }
      return user;
    });
    const roomId = getRoomId(socketId);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.USER_OFFLINE, { socketId });
  });

  socket.on(SocketEvent.USER_ONLINE, ({ socketId }) => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socketId) {
        return { ...user, status: USER_CONNECTION_STATUS.ONLINE };
      }
      return user;
    });
    const roomId = getRoomId(socketId);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.USER_ONLINE, { socketId });
  });

  // Handle chat actions
  socket.on(SocketEvent.SEND_MESSAGE, ({ message }) => {
    console.log("Sending message", message.message);

    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    storeMessage(roomId, message);
    socket.broadcast.to(roomId).emit(SocketEvent.RECEIVE_MESSAGE, { message });
  });

  // Handle cursor position
  socket.on(SocketEvent.TYPING_START, ({ cursorPosition, currentFile }) => {
    console.log("Typing start", { cursorPosition, currentFile });

    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socket.id) {
        return { ...user, typing: true, cursorPosition, currentFile };
      }
      return user;
    });
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.TYPING_START, { user });
  });

  socket.on(SocketEvent.TYPING_PAUSE, () => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socket.id) {
        return { ...user, typing: false };
      }
      return user;
    });
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.TYPING_PAUSE, { user });
  });

  socket.on(SocketEvent.REQUEST_DRAWING, () => {
    console.log("Requesting drawing data is called");

    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.REQUEST_DRAWING, { socketId: socket.id });
  });

  socket.on(SocketEvent.DRAWING_READY, (d) => {
    console.log("Drawing ready", { d });
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    const snapshots = getSnapshots(roomId);

    // Send message history to the newly joined user
    if (snapshots.length > 0) {
      console.log("sending history", snapshots.length);
      io.to(socket.id).emit(SocketEvent.SYNC_DRAWING, {
        snapshots,
      });
    }
  });

  socket.on(SocketEvent.DRAWING_UPDATE, ({ snapshot }) => {
    console.log("Drawing update", { snapshot });

    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DRAWING_UPDATE, {
      snapshot,
    });
    storeSnapshot(roomId, snapshot);
  });
};

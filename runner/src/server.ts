import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { Server } from "socket.io";
import http from "http";
import { handleCollabConnection } from "./socket-handlers/collab-handler";
import { handleTerminalConnection } from "./socket-handlers/terminal-handler";
import { User } from "./types/user";
import { fileWatcherService } from "./utils/file-watcher";
import { SocketEvent } from "./types/socket";
import { FileManager } from "./utils/file-manager";

dotenv.config();

const app = express();
app.use(express.json());
// app.use(cors({ origin: "http://localhost:5174", credentials: true }));

app.use((req, res, next) => {
  const path = req.path;
  const method = req.method;
  console.log(`[${new Date().toISOString()}] ${method} request to ${path}`);
  next();
});

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const SOCKET_PATH = process.env.SOCKET_PATH || "";
const ORIGINS = process.env.ORIGINS?.split(",") || [];
// will work if single origin is passed

if (process.env.NODE_ENV === "production" && (!SOCKET_PATH || !ORIGINS)) {
  console.error("SOCKET_PATH and ORIGINS environment variables must be set.");
  process.exit(1);
}

console.log(`Socket path: ${SOCKET_PATH}`);
console.log(`Origins: ${ORIGINS}`);

const io = new Server(server, {
  path: `/${SOCKET_PATH}`,
  cors: {
    origin: "*",
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
});

// Shared state

const ptys = new Map<string, any>();

// const fileWatcher = new FileWatcher(io);

// Start watching for file changes immediately
// fileWatcherService(io).startWatching();
FileManager.createIndexFile();

io.on("connection", (socket) => {
  // Initialize collaboration handler
  handleCollabConnection(socket, io);
  handleTerminalConnection(socket, ptys);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
// docker build -t runner-prod -f .\Dockerfile.prod .

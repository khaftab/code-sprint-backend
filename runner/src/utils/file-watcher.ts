import { Server, Socket } from "socket.io";
import * as chokidar from "chokidar";
import fs from "fs/promises";
import path from "path";
// @ts-ignore
import { v4 as uuidv4 } from "uuid";
import { SocketEvent } from "../types/socket";
import { FileManager } from "./file-manager";
import { FileSystem } from "../types/file";

export class FileWatcher {
  private io: Server;
  public watcher: chokidar.FSWatcher | null = null;
  private isInitialScanCompleted = false;
  // Check if initial scan is complete
  public isInitialScanComplete(): boolean {
    return this.isInitialScanCompleted;
  }
  // Track the source of file updates to prevent feedback loops
  private updateSource: "terminal" | "editor" | "init" = "init";

  constructor(io: Server) {
    this.io = io;
  }

  // Start watching the workspace directory
  public async startWatching(): Promise<void> {
    if (this.watcher) {
      return; // Already watching
    }

    console.log(`Starting file watcher for ${FileManager.WORKSPACE_ROOT}`);

    return new Promise((resolve, reject) => {
      this.watcher = chokidar.watch(FileManager.WORKSPACE_ROOT, {
        persistent: true,
        ignoreInitial: true, // Don't process existing files via events
        ignored: /(^|[\/\\])\../, // Ignore dot files
        depth: 99,
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 100,
        },
      });

      // Process events
      this.watcher
        .on("add", (filePath) => this.handleFileAdd(filePath))
        .on("change", (filePath) => this.handleFileChange(filePath))
        .on("unlink", (filePath) => this.handleFileDelete(filePath))
        .on("addDir", (dirPath) => this.handleDirAdd(dirPath))
        .on("unlinkDir", (dirPath) => this.handleDirDelete(dirPath))
        .on("ready", () => {
          console.log("Initial scan complete, ready for changes");
          this.isInitialScanCompleted = true;
          resolve(); // Resolve the promise when initial scan is complete
        })
        .on("error", (error) => {
          console.error("Watcher error:", error);
          reject(error); // Reject the promise on error
        });
    });
  }

  // Stop watching
  public stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.isInitialScanCompleted = false;
      console.log("File watcher stopped");
    }
  }

  // Set update source to track who's making changes
  public setUpdateSource(source: "terminal" | "editor" | "init"): void {
    this.updateSource = source;
  }

  // Get all connected socket IDs in a room
  private getSocketsInRoom(roomId: string): string[] {
    const room = this.io.sockets.adapter.rooms.get(roomId);
    return room ? Array.from(room) : [];
  }

  // Handle file creation or initial detection
  private async handleFileAdd(filePath: string): Promise<void> {
    console.log(`File added: ${filePath}`);
    // do not include executable files
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(fileName);

    if (!fileExtension) return; // Skip files without an extension
    if (fileExtension === ".class") return; // Skip executable files

    try {
      const relativePath = path.relative(FileManager.WORKSPACE_ROOT, filePath);
      if (relativePath === "") return; // Skip workspace root

      // Get parent directory
      const parentDir = path.dirname(filePath);
      const parentRelativePath = path.relative(FileManager.WORKSPACE_ROOT, parentDir);

      // Get or create IDs
      let parentDirId = this.findIdForPath(parentRelativePath) as string;

      if (!parentDirId) {
        parentDirId = parentRelativePath === "" ? "root" : uuidv4();
        FileManager.registerPath(parentDirId, parentRelativePath);
      }

      let fileId = this.findIdForPath(relativePath) as string;
      if (!fileId) {
        fileId = uuidv4();
        FileManager.registerPath(fileId, relativePath);
      }

      // Read file content
      const content = await fs.readFile(filePath, "utf8");
      const fileName = path.basename(filePath);

      const newFile = {
        id: fileId,
        name: fileName,
        type: "file",
        content,
      };

      // Broadcast to all rooms
      this.broadcastToAllRooms(SocketEvent.FILE_CREATED, {
        parentDirId,
        newFile,
      });
    } catch (err) {
      console.error(`Error handling file add for ${filePath}:`, err);
    }
  }

  // Handle directory creation or initial detection
  private async handleDirAdd(dirPath: string): Promise<void> {
    console.log(`Directory added: ${dirPath}`);

    try {
      const relativePath = path.relative(FileManager.WORKSPACE_ROOT, dirPath);
      if (relativePath === "") return; // Skip workspace root

      // Get parent directory
      const parentDir = path.dirname(dirPath);
      const parentRelativePath = path.relative(FileManager.WORKSPACE_ROOT, parentDir);

      // Get or create IDs
      let parentDirId = this.findIdForPath(parentRelativePath) as string;
      if (!parentDirId) {
        parentDirId = parentRelativePath === "" ? "root" : uuidv4();
        FileManager.registerPath(parentDirId, parentRelativePath);
      }

      let dirId = this.findIdForPath(relativePath) as string;
      if (!dirId) {
        dirId = uuidv4();
        FileManager.registerPath(dirId, relativePath);
      }

      const dirName = path.basename(dirPath);

      const newDirectory = {
        id: dirId,
        name: dirName,
        type: "directory",
        children: [],
        isOpen: false,
      };

      // Broadcast to all rooms
      this.broadcastToAllRooms(SocketEvent.DIRECTORY_CREATED, {
        parentDirId,
        newDirectory,
      });
    } catch (err) {
      console.error(`Error handling directory add for ${dirPath}:`, err);
    }
  }

  // Handle file content changes
  private async handleFileChange(filePath: string): Promise<void> {
    console.log(`File changed - source: ${this.updateSource}`);

    try {
      // Skip if not the initial scan and source is editor
      if (this.isInitialScanCompleted && this.updateSource === "editor") {
        console.log("Skipping file update event from editor");
        this.updateSource = "init"; // Reset for next event
        return;
      }

      const relativePath = path.relative(FileManager.WORKSPACE_ROOT, filePath);
      const fileId = this.findIdForPath(relativePath);

      if (!fileId) {
        console.warn(`No ID found for changed file: ${relativePath}`);
        return;
      }

      const content = await fs.readFile(filePath, "utf8");

      // Broadcast file update
      this.broadcastToAllRooms(SocketEvent.FILE_UPDATED, {
        fileId,
        newContent: content,
        from: this.isInitialScanCompleted ? "terminal" : "init",
      });

      // Reset update source after handling
      if (this.isInitialScanCompleted) {
        this.updateSource = "init";
      }
    } catch (err) {
      console.error(`Error handling file change for ${filePath}:`, err);
    }
  }

  // Handle file deletion
  private async handleFileDelete(filePath: string): Promise<void> {
    try {
      // Skip initial scan events
      if (!this.isInitialScanCompleted) return;

      const relativePath = path.relative(FileManager.WORKSPACE_ROOT, filePath);
      const fileId = this.findIdForPath(relativePath);

      if (!fileId) {
        console.warn(`No ID found for deleted file: ${relativePath}`);
        return;
      }

      // Broadcast file deletion
      this.broadcastToAllRooms(SocketEvent.FILE_DELETED, {
        fileId,
      });

      // Remove ID mapping
      FileManager.unregisterPath(fileId);
    } catch (err) {
      console.error(`Error handling file deletion for ${filePath}:`, err);
    }
  }

  // Handle directory deletion
  private async handleDirDelete(dirPath: string): Promise<void> {
    try {
      // Skip initial scan events
      if (!this.isInitialScanCompleted) return;

      const relativePath = path.relative(FileManager.WORKSPACE_ROOT, dirPath);
      const dirId = this.findIdForPath(relativePath);

      if (!dirId) {
        console.warn(`No ID found for deleted directory: ${relativePath}`);
        return;
      }

      // Broadcast directory deletion
      this.broadcastToAllRooms(SocketEvent.DIRECTORY_DELETED, {
        dirId,
      });

      // Find and unregister all IDs for paths under this directory
      const allMappings = FileManager.getAllMappings();
      const prefix = relativePath + "/";

      for (const [id, path] of allMappings) {
        if (path === relativePath || path.startsWith(prefix)) {
          FileManager.unregisterPath(id);
        }
      }
    } catch (err) {
      console.error(`Error handling directory deletion for ${dirPath}:`, err);
    }
  }

  // Broadcast an event to all rooms
  private broadcastToAllRooms(event: SocketEvent, data: any): void {
    this.io.emit(event, data);
  }

  // Find ID for a path by checking if any registered path matches
  private findIdForPath(relativePath: string): string | null {
    const allMappings = FileManager.getAllMappings();
    for (const [id, path] of allMappings) {
      if (path === relativePath) {
        return id;
      }
    }
    return null;
  }

  // Build initial file structure for client sync
  public async buildInitialFileStructure(): Promise<any> {
    const rootStructure: FileSystem = {
      id: "root",
      name: "workspace",
      type: "directory",
      children: [],
      isOpen: false,
    };

    try {
      rootStructure.children = await this.scanDirectory(FileManager.WORKSPACE_ROOT);
      return rootStructure;
    } catch (err) {
      console.error("Error building initial file structure:", err);
      return rootStructure;
    }
  }

  // Helper to scan directory contents recursively
  private async scanDirectory(dirPath: string): Promise<any[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const items = [];

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(FileManager.WORKSPACE_ROOT, fullPath);

        // Skip dotfiles
        if (entry.name.startsWith(".")) continue;

        // Get or create ID for this path
        let itemId = this.findIdForPath(relativePath) as string;
        if (!itemId) {
          itemId = uuidv4();
          FileManager.registerPath(itemId, relativePath);
        }

        if (entry.isDirectory()) {
          const children = await this.scanDirectory(fullPath);
          items.push({
            id: itemId,
            name: entry.name,
            type: "directory",
            children,
            isOpen: false,
          });
        } else {
          const content = await fs.readFile(fullPath, "utf8");
          items.push({
            id: itemId,
            name: entry.name,
            type: "file",
            content,
          });
        }
      }

      return items;
    } catch (err) {
      console.error(`Error scanning directory ${dirPath}:`, err);
      return [];
    }
  }
}

// Singleton pattern for FileWatcher
let instance: FileWatcher | null = null;

export const fileWatcherService = (io: Server): FileWatcher => {
  if (!instance) {
    instance = new FileWatcher(io);
  }
  return instance;
};

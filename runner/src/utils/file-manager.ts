import fs from "fs/promises";
import path from "path";

// Workspace root path
export const WORKSPACE_ROOT = "/home/devx/workspace";

// Map for ID to path conversions
const idToPathMap = new Map();

// Initialize the root path mapping
idToPathMap.set("root", "");

export class FileManager {
  static WORKSPACE_ROOT = WORKSPACE_ROOT;

  static getAbsolutePath(itemId: string) {
    const relativePath = idToPathMap.get(itemId);
    if (!relativePath && itemId !== "root") {
      console.error(`Path not found for ID: ${itemId}`);
      return null;
    }
    return path.join(WORKSPACE_ROOT, relativePath || "");
  }

  // Get the relative path from an ID
  static getRelativePath(itemId: string) {
    return idToPathMap.get(itemId) || "";
  }

  // create a index.js file in the root directory on startup
  static async createIndexFile() {
    await this.createFile("root", {
      id: "PrimeCheck",
      name: "PrimeCheck.java",
      type: "file",
      content: `public class PrimeCheck {
    public static boolean isPrime(int n) {
        if (n <= 1) return false;
        for (int i = 2; i <= Math.sqrt(n); i++) {
            if (n % i == 0) return false;
        }
        return true;
    }

    public static void main(String[] args) {
        int number = 29;
        if (isPrime(number)) {
            System.out.println(number + " is a prime number");
        } else {
            System.out.println(number + " is not a prime number");
        }
    }
}
// Supported languages: Bash (.sh), C, C++, Go, Java, JavaScript, Python, Ruby.`,
    });
  }

  // Register a new path-to-ID mapping
  static registerPath(id: string, relativePath: string) {
    idToPathMap.set(id, relativePath);
  }

  // Unregister a path mapping
  static unregisterPath(id: string) {
    if (idToPathMap.has(id)) {
      idToPathMap.delete(id);
    }
  }

  // Create a directory
  static async createDirectory(parentId: string, dirItem: any) {
    try {
      const parentPath = idToPathMap.get(parentId) || "";
      const dirRelativePath = path.join(parentPath, dirItem.name);
      const dirAbsolutePath = path.join(WORKSPACE_ROOT, dirRelativePath);

      await fs.mkdir(dirAbsolutePath, { recursive: true });

      // Register new directory with its ID
      this.registerPath(dirItem.id, dirRelativePath);

      return dirRelativePath;
    } catch (err) {
      console.error(`Error creating directory ${dirItem.name}:`, err);
      throw err;
    }
  }

  // Create a file
  static async createFile(parentId: string, fileItem: any) {
    try {
      const parentPath = idToPathMap.get(parentId) || "";
      const fileRelativePath = path.join(parentPath, fileItem.name);
      const fileAbsolutePath = path.join(WORKSPACE_ROOT, fileRelativePath);

      await fs.writeFile(fileAbsolutePath, fileItem.content || "");

      // Register new file with its ID
      this.registerPath(fileItem.id, fileRelativePath);
      console.log(idToPathMap, "Id to path MApping");

      return fileRelativePath;
    } catch (err) {
      console.error(`Error creating file ${fileItem.name}:`, err);
      throw err;
    }
  }

  // Update file content
  static async updateFileContent(fileId: string, newContent: string) {
    try {
      const filePath = this.getAbsolutePath(fileId);
      if (!filePath) throw new Error(`File ID not found: ${fileId}`);

      await fs.writeFile(filePath, newContent);
      return true;
    } catch (err) {
      console.error(`Error updating file ${fileId}:`, err);
      throw err;
    }
  }

  // Rename directory or file
  static async renameItem(itemId: string, newName: string) {
    try {
      const oldRelativePath = idToPathMap.get(itemId);
      if (!oldRelativePath) throw new Error(`Item ID not found: ${itemId}`);

      const oldAbsolutePath = path.join(WORKSPACE_ROOT, oldRelativePath);
      const parentDir = path.dirname(oldRelativePath);
      const newRelativePath = path.join(parentDir, newName);
      const newAbsolutePath = path.join(WORKSPACE_ROOT, newRelativePath);

      await fs.rename(oldAbsolutePath, newAbsolutePath);

      // Update the path mapping for this item
      this.registerPath(itemId, newRelativePath);

      // Check if it's a directory and update all child paths
      const stats = await fs.stat(newAbsolutePath);
      if (stats.isDirectory()) {
        // Update all paths that start with the old directory path
        for (const [id, path] of Array.from(idToPathMap.entries())) {
          if (path !== oldRelativePath && path.startsWith(oldRelativePath + "/")) {
            // Replace the directory prefix with the new name
            const updatedPath = path.replace(oldRelativePath, newRelativePath);
            idToPathMap.set(id, updatedPath);
          }
        }
      }

      return newRelativePath;
    } catch (err) {
      console.error(`Error renaming item ${itemId}:`, err);
      throw err;
    }
  }

  // Delete directory or file
  static async deleteItem(itemId: string) {
    try {
      const itemPath = this.getAbsolutePath(itemId);
      if (!itemPath) throw new Error(`Item ID not found: ${itemId}`);

      const stats = await fs.stat(itemPath);

      if (stats.isDirectory()) {
        await fs.rm(itemPath, { recursive: true, force: true });
      } else {
        await fs.unlink(itemPath);
      }

      // Remove the ID mapping
      this.unregisterPath(itemId);

      return true;
    } catch (err) {
      console.error(`Error deleting item ${itemId}:`, err);
      throw err;
    }
  }

  // Get all ID to path mappings
  static getAllMappings() {
    return Array.from(idToPathMap.entries());
  }

  // Check if a path exists in the file system
  static async pathExists(relativePath: string) {
    try {
      const fullPath = path.join(WORKSPACE_ROOT, relativePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  // Ensure directory exists
  static async ensureDirectory(relativePath: string) {
    const fullPath = path.join(WORKSPACE_ROOT, relativePath);
    await fs.mkdir(fullPath, { recursive: true });
    return fullPath;
  }
}

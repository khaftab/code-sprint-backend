import path from "path";

export class PathValidator {
  static isValidPath(userPath: string) {
    const resolved = path.resolve("/home/devx/workspace", userPath);
    return resolved.startsWith("/home/devx/workspace");
  }
}

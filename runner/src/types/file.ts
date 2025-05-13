export interface FileSystem {
  id: string;
  name: string;
  type: "file" | "directory";
  children?: FileSystem[];
  content?: string;
  isOpen?: boolean;
}

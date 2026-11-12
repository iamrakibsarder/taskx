// Browser APIs used for timer screenshots that TypeScript's DOM types don't include yet.
// File System Access (Chrome/Edge) and ImageCapture (Chrome/Edge).

type FsPermissionMode = { mode?: 'read' | 'readwrite' };

interface FileSystemHandle {
  queryPermission?(d?: FsPermissionMode): Promise<PermissionState>;
  requestPermission?(d?: FsPermissionMode): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker?(o?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }): Promise<FileSystemDirectoryHandle>;
}

// TS knows ImageCapture but not grabFrame() (Chrome/Edge have it).
interface ImageCapture {
  grabFrame(): Promise<ImageBitmap>;
}

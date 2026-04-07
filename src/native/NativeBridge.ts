/**
 * Native Bridge — Abstraction layer for platform-specific native operations.
 *
 * In the full implementation, this would use JSI (JavaScript Interface) to call
 * into native modules for:
 * - SWC-based AST parsing (Rust native module)
 * - File system traversal (native OS APIs)
 * - File watching (FSEvents/inotify/ReadDirectoryChangesW)
 * - SHA-256 hashing
 *
 * This implementation provides a fetch-based bridge that communicates with
 * a local analysis server, or can be swapped for a native module.
 */

export interface NativeBridgeInterface {
  readFile: (path: string) => Promise<string>;
  listFiles: (dir: string, extensions: string[]) => Promise<string[]>;
  readPackageJson: (path: string) => Promise<Record<string, any> | null>;
  fileHash: (path: string) => Promise<string>;
  fileSize: (path: string) => Promise<number>;
}

/**
 * Placeholder bridge implementation.
 * In production, swap this with a JSI native module or
 * a local Node.js sidecar process via HTTP.
 */
export function createJSBridge(): NativeBridgeInterface {
  return {
    readFile: async (_path: string): Promise<string> => {
      throw new Error(
        'NativeBridge.readFile requires a native module. ' +
        'Connect a JSI bridge or local analysis server.',
      );
    },

    listFiles: async (_dir: string, _extensions: string[]): Promise<string[]> => {
      throw new Error(
        'NativeBridge.listFiles requires a native module. ' +
        'Connect a JSI bridge or local analysis server.',
      );
    },

    readPackageJson: async (_path: string): Promise<Record<string, any> | null> => {
      throw new Error(
        'NativeBridge.readPackageJson requires a native module. ' +
        'Connect a JSI bridge or local analysis server.',
      );
    },

    fileHash: async (_path: string): Promise<string> => {
      throw new Error(
        'NativeBridge.fileHash requires a native module. ' +
        'Connect a JSI bridge or local analysis server.',
      );
    },

    fileSize: async (_path: string): Promise<number> => {
      throw new Error(
        'NativeBridge.fileSize requires a native module. ' +
        'Connect a JSI bridge or local analysis server.',
      );
    },
  };
}

/**
 * File Watcher Service — Monitors repository file changes for incremental re-analysis.
 *
 * In a full native implementation, this would use OS-level file watching
 * (FSEvents on macOS, ReadDirectoryChangesW on Windows, inotify on Linux)
 * via a native module. This implementation uses polling as a portable fallback.
 */
import type { Repository } from '../../types';

export interface FileChangeEvent {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  timestamp: number;
}

export type FileChangeCallback = (events: FileChangeEvent[]) => void;

interface WatcherState {
  repositoryId: string;
  path: string;
  callback: FileChangeCallback;
  intervalId: ReturnType<typeof setInterval> | null;
  fileSnapshots: Map<string, string>; // path -> hash
}

const watchers = new Map<string, WatcherState>();

const POLL_INTERVAL_MS = 5000; // 5 second polling interval

/**
 * Start watching a repository for file changes.
 * Uses polling as a portable fallback — native module would replace this.
 */
export function startWatching(
  repo: Repository,
  callback: FileChangeCallback,
  listFiles: (dir: string, extensions: string[]) => Promise<string[]>,
  fileHash: (path: string) => Promise<string>,
): void {
  if (watchers.has(repo.id)) {
    stopWatching(repo.id);
  }

  const state: WatcherState = {
    repositoryId: repo.id,
    path: repo.path,
    callback,
    intervalId: null,
    fileSnapshots: new Map(),
  };

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

  // Initial snapshot
  (async () => {
    try {
      const files = await listFiles(repo.path, extensions);
      for (const file of files) {
        try {
          const hash = await fileHash(file);
          state.fileSnapshots.set(file, hash);
        } catch {}
      }
    } catch {}
  })();

  // Start polling
  state.intervalId = setInterval(async () => {
    try {
      const files = await listFiles(repo.path, extensions);
      const currentFiles = new Set(files);
      const events: FileChangeEvent[] = [];

      // Check for new and modified files
      for (const file of files) {
        try {
          const hash = await fileHash(file);
          const prevHash = state.fileSnapshots.get(file);

          if (!prevHash) {
            events.push({ type: 'created', path: file, timestamp: Date.now() });
          } else if (prevHash !== hash) {
            events.push({ type: 'modified', path: file, timestamp: Date.now() });
          }
          state.fileSnapshots.set(file, hash);
        } catch {}
      }

      // Check for deleted files
      for (const [path] of state.fileSnapshots) {
        if (!currentFiles.has(path)) {
          events.push({ type: 'deleted', path, timestamp: Date.now() });
          state.fileSnapshots.delete(path);
        }
      }

      if (events.length > 0) {
        callback(events);
      }
    } catch {}
  }, POLL_INTERVAL_MS);

  watchers.set(repo.id, state);
}

/** Stop watching a repository */
export function stopWatching(repositoryId: string): void {
  const state = watchers.get(repositoryId);
  if (state?.intervalId) {
    clearInterval(state.intervalId);
  }
  watchers.delete(repositoryId);
}

/** Stop all active watchers */
export function stopAllWatchers(): void {
  for (const [id] of watchers) {
    stopWatching(id);
  }
}

/** Check if a repository is being watched */
export function isWatching(repositoryId: string): boolean {
  return watchers.has(repositoryId);
}

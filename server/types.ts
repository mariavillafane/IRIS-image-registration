// Shared type definitions for the IRIS registration server.

/** Reference paths for an uploaded image and its generated renditions. */
export interface ImageFileRefs {
  /** Original file served through the static uploads handler. */
  url: string;
  path: string;
  webUrl: string;
  smallUrl: string;
  mediumUrl: string;
}

/** Metadata persisted next to each uploaded image (uploads/<project>/<file>.json). */
export interface UploadedImageMetadata {
  width?: number;
  height?: number;
  format?: string;
  space?: string;
  channels?: number;
  depth?: string;
  density?: number;
  isProgressive?: boolean;
  hasProfile?: boolean;
  hasAlpha?: boolean;
  files: ImageFileRefs;
  destination: string;
  size: number;
  uploaded: number;
  sizeStr: string;
  [key: string]: unknown;
}

/** Shape of `settings.json` as written by the client (subset used by the server). */
export interface ProjectSettings {
  id?: string;
  title?: string;
  workingImages?: { imageEntries?: unknown[]; [key: string]: unknown }[];
  [key: string]: unknown;
}

/**
 * Status lifecycle of a registration job:
 * "queued" | "started" | "success" | "error" | "stopped"
 */
export type TaskStatus = "queued" | "started" | "success" | "error" | "stopped";

/** A registration job, tracked in memory and persisted to `uploads/<jobId>/task.json`. */
export interface Task {
  id: string;
  projectId: string;
  title?: string;
  fixedImage?: unknown;
  images: number;
  datacubes: number;
  thumbnail: string;
  /** [completed, total] as reported by the Python script progress markers. */
  progress: [number | string, number | string];
  startTime: number;
  endTime: number;
  updated: number;
  message: string;
  status: TaskStatus | string;
  /** Timestamp (ms) once the job finished; falsy while queued/running. */
  done?: number;
}

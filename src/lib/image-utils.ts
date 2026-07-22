import imageCompression from "browser-image-compression";

export const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
export const MAX_SIZE = 20 * 1024 * 1024;
export const MAX_COUNT = 10;
export const MAX_EDGE = 2048;

export type PreparedImage = {
  id: string;
  name: string;
  status: "loading" | "ready" | "error";
  error?: string;
  /** Final file to upload (compressed once ready, otherwise the original). */
  file: File;
  originalFile: File;
  /** Instant object URL — available as soon as the file is picked. */
  previewUrl: string;
  width: number;
  height: number;
  size: number;
  mime: string;
  /** True while background compression is running. */
  compressing: boolean;
};

function readDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve({ width: el.naturalWidth, height: el.naturalHeight });
    el.onerror = () => reject(new Error("Invalid image"));
    el.src = url;
  });
}

/** Instant, synchronous-ish placeholder. Never blocks — no decoding, no compression. */
export function makePlaceholder(file: File): PreparedImage {
  const previewUrl = URL.createObjectURL(file);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    status: "loading",
    file,
    originalFile: file,
    previewUrl,
    width: 0,
    height: 0,
    size: file.size,
    mime: file.type,
    compressing: false,
  };
}

export function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return `Unsupported type: ${file.type || "unknown"}`;
  if (file.size > MAX_SIZE) return `${file.name} exceeds 20MB`;
  return null;
}

/** Decode dimensions off the main render path. Fast (<50ms typical). */
export async function decodePreview(item: PreparedImage): Promise<Partial<PreparedImage>> {
  try {
    const dims = await readDimensions(item.previewUrl);
    return { width: dims.width, height: dims.height, status: "ready" };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "Decode failed" };
  }
}

/** Heavy work — runs in a Web Worker via browser-image-compression. */
export async function compressInBackground(item: PreparedImage): Promise<Partial<PreparedImage>> {
  // Don't recompress GIFs (would lose animation)
  if (item.mime === "image/gif") return { compressing: false };
  try {
    const compressed: File = await imageCompression(item.originalFile, {
      maxWidthOrHeight: MAX_EDGE,
      maxSizeMB: 3,
      useWebWorker: true,
      initialQuality: 0.85,
      fileType: item.mime === "image/png" ? "image/png" : "image/jpeg",
    });
    const outFile: File = compressed instanceof File
      ? compressed
      : new File([compressed], item.originalFile.name, { type: compressed.type });
    const newUrl = URL.createObjectURL(outFile);
    URL.revokeObjectURL(item.previewUrl);
    return {
      file: outFile,
      previewUrl: newUrl,
      size: outFile.size,
      mime: outFile.type,
      compressing: false,
    };
  } catch {
    // Fall back to original file — still uploadable.
    return { compressing: false };
  }
}

export function extForMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

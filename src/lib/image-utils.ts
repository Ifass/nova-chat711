import imageCompression from "browser-image-compression";

export const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
export const MAX_SIZE = 20 * 1024 * 1024;
export const MAX_COUNT = 10;
export const MAX_EDGE = 2048;

export type PreparedImage = {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  size: number;
  mime: string;
};

async function readDimensions(file: File | Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Invalid image"));
      el.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error(`Unsupported type: ${file.type}`);
  if (file.size > MAX_SIZE) throw new Error(`${file.name} exceeds 20MB`);
  // Don't recompress GIFs (would lose animation)
  const shouldCompress = file.type !== "image/gif";
  const out = shouldCompress
    ? await imageCompression(file, {
        maxWidthOrHeight: MAX_EDGE,
        maxSizeMB: 3,
        useWebWorker: true,
        initialQuality: 0.85,
        fileType: file.type === "image/png" ? "image/png" : "image/jpeg",
      })
    : file;
  const dims = await readDimensions(out);
  const outFile = out instanceof File ? out : new File([out], file.name, { type: out.type });
  return {
    id: crypto.randomUUID(),
    file: outFile,
    previewUrl: URL.createObjectURL(outFile),
    width: dims.width,
    height: dims.height,
    size: outFile.size,
    mime: outFile.type,
  };
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

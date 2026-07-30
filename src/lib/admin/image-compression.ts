export type CompressedImage = {
  file: File;
  originalBytes: number;
  optimizedBytes: number;
};

export async function compressUiImage(
  file: File,
  options: { maxSide?: number; quality?: number; fallbackName?: string } = {},
): Promise<CompressedImage> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("unsupported_image_type");
  }

  if (typeof createImageBitmap !== "function") {
    return { file, originalBytes: file.size, optimizedBytes: file.size };
  }

  const bitmap = await createImageBitmap(file);
  try {
    const maxSide = options.maxSide ?? 1920;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("image_compression_failed");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", options.quality ?? 0.84),
    );
    if (!blob || blob.size >= file.size * 0.97) {
      return { file, originalBytes: file.size, optimizedBytes: file.size };
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || options.fallbackName || "image";
    const optimized = new File([blob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: file.lastModified,
    });
    return { file: optimized, originalBytes: file.size, optimizedBytes: optimized.size };
  } finally {
    bitmap.close();
  }
}

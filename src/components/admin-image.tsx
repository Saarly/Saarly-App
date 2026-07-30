"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

type AdminImageProps = {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
  preserveOriginal?: boolean;
  style?: CSSProperties;
};

function canOptimize(src: string) {
  if (src.startsWith("/")) return true;
  try {
    const hostname = new URL(src).hostname.toLowerCase();
    return hostname.endsWith(".supabase.co") || hostname.endsWith(".vercel.app") || hostname === "saarly.app" || hostname.endsWith(".saarly.app");
  } catch {
    return false;
  }
}

export function AdminImage({
  src,
  alt,
  className,
  width = 960,
  height = 540,
  sizes = "(max-width: 768px) 100vw, 640px",
  priority = false,
  preserveOriginal = false,
  style,
}: AdminImageProps) {
  return (
    <Image
      className={className}
      style={style}
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      quality={preserveOriginal ? undefined : 82}
      priority={priority}
      {...(!priority ? { loading: "lazy" as const } : {})}
      unoptimized={preserveOriginal || !canOptimize(src)}
    />
  );
}

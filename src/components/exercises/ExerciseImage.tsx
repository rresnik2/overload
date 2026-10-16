import Image from "next/image";
import { CATALOG_IMAGE_BASE, catalogImageUrl } from "@/lib/catalog-images";

/**
 * One exercise photo (free-exercise-db, hosted on GitHub raw). Explicit size and lazy. Catalog photos go through the Next image
 * optimizer (about 70 KB JPEG originals become a few KB of WebP at the card's size, cached by the server and by the service worker,
 * see src/app/sw.ts); a custom exercise's own URL is not in `images.remotePatterns`, so it is served as is. Props only.
 */
export interface ExerciseImageProps {
  /** Dataset path ("Barbell_Squat/0.jpg") or an absolute URL (custom exercises). */
  path: string;
  alt: string;
  priority?: boolean;
  className?: string;
  /** How wide the photo is drawn, for choosing a file size. The default is the library grid: one column on a phone, two, then three. */
  sizes?: string;
}

const GRID_SIZES = "(min-width: 64rem) 22rem, (min-width: 40rem) 45vw, 92vw";

export function ExerciseImage({ path, alt, priority = false, className, sizes = GRID_SIZES }: ExerciseImageProps) {
  const src = catalogImageUrl(path);
  return <Image src={src} alt={alt} width={400} height={300} sizes={sizes} unoptimized={!src.startsWith(CATALOG_IMAGE_BASE)} loading={priority ? "eager" : "lazy"} className={className} />;
}

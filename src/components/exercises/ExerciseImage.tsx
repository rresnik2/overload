import Image from "next/image";
import { catalogImageUrl } from "@/lib/catalog-images";

/** One exercise photo (free-exercise-db, hosted on GitHub raw). Explicit size, lazy, not routed through the image optimizer. Props only. */
export interface ExerciseImageProps {
  /** Dataset path ("Barbell_Squat/0.jpg") or an absolute URL (custom exercises). */
  path: string;
  alt: string;
  priority?: boolean;
  className?: string;
}

export function ExerciseImage({ path, alt, priority = false, className }: ExerciseImageProps) {
  return <Image src={catalogImageUrl(path)} alt={alt} width={400} height={300} unoptimized loading={priority ? "eager" : "lazy"} className={className} />;
}

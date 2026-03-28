import { cn, getFileIcon } from "@/lib/utils";
import Image from "next/image";

interface Props {
  type: string;
  extension: string;
  url?: string;
  imageClassName?: string;
  className?: string;
}

/**
 * Thumbnail renderer for file cards and search results.
 *
 * Why we special-case images:
 * - For true image types we render the actual file URL for a rich preview.
 * - For non-images (or SVGs) we render an icon to avoid broken previews and to keep layout stable.
 *
 * Performance note:
 * - Next.js `Image` provides optimized loading and prevents layout shift, which matters in dense grids.
 */
const Thumbnail = ({
  type,
  extension,
  url = ``,
  imageClassName,
  className,
}: Props) => {
  const isImage = type === "image" && extension !== `svg`;

  return (
    <figure className={cn("thumbnail", className)}>
      <Image
        src={isImage ? url : getFileIcon(extension, type)}
        alt="thumbnail"
        width={100}
        height={100}
        className={cn(
          "size-8 object-contain",
          imageClassName,
          isImage && "thumbnail-image"
        )}
      />
    </figure>
  );
};

export default Thumbnail;

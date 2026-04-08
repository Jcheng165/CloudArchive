import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Shared utility layer for CloudArchive.
 *
 * Why this module matters in a storage platform:
 * - **Consistent UX**: file size, timestamps, and icons must render identically across grids/search/modals.
 * - **Performance**: URL construction for Appwrite previews/downloads is centralized and reusable.
 * - **Security boundaries**: we only expose safe, public Appwrite identifiers via `NEXT_PUBLIC_*` env vars;
 *   admin secrets never appear in this module.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Serialization helper used to return Appwrite SDK results from Server Actions.
 *
 * Why:
 * - Appwrite SDK responses may contain non-serializable prototypes; Server Actions require structured clones.
 * - This keeps server/client boundaries predictable without leaking SDK internals into UI components.
 */
export const parseStringify = (value: unknown) =>
  JSON.parse(JSON.stringify(value));

/** Local preview URL for optimistic upload thumbnails (revocation handled by browser lifecycle). */
export const convertFileToUrl = (file: File) => URL.createObjectURL(file);

/**
 * Human-readable file size formatting.
 *
 * UX:
 * - Storage platforms are quota-driven; showing consistent units helps users self-manage usage.
 */
export const convertFileSize = (sizeInBytes: number, digits?: number) => {
  if (sizeInBytes < 1024) {
    return sizeInBytes + " Bytes"; // Less than 1 KB, show in Bytes
  } else if (sizeInBytes < 1024 * 1024) {
    const sizeInKB = sizeInBytes / 1024;
    return sizeInKB.toFixed(digits || 1) + " KB"; // Less than 1 MB, show in KB
  } else if (sizeInBytes < 1024 * 1024 * 1024) {
    const sizeInMB = sizeInBytes / (1024 * 1024);
    return sizeInMB.toFixed(digits || 1) + " MB"; // Less than 1 GB, show in MB
  } else {
    const sizeInGB = sizeInBytes / (1024 * 1024 * 1024);
    return sizeInGB.toFixed(digits || 1) + " GB"; // 1 GB or more, show in GB
  }
};

export const calculatePercentage = (sizeInBytes: number) => {
  const totalSizeInBytes = 2 * 1024 * 1024 * 1024; // 2GB in bytes
  const percentage = (sizeInBytes / totalSizeInBytes) * 100;
  return Number(percentage.toFixed(2));
};

/**
 * Coarse file type classification used for routing and iconography.
 *
 * Why this approach:
 * - Keeps Appwrite documents normalized by storing a `type` category, which makes queries efficient
 *   (e.g., `/images`, `/documents`) without computing MIME logic on every request.
 */
export const getFileType = (fileName: string) => {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (!extension) return { type: "other", extension: "" };

  const documentExtensions = [
    "pdf",
    "doc",
    "docx",
    "txt",
    "xls",
    "xlsx",
    "csv",
    "rtf",
    "ods",
    "ppt",
    "odp",
    "md",
    "html",
    "htm",
    "epub",
    "pages",
    "fig",
    "psd",
    "ai",
    "indd",
    "xd",
    "sketch",
    "afdesign",
    "afphoto",
    "afphoto",
  ];
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"];
  const videoExtensions = ["mp4", "avi", "mov", "mkv", "webm"];
  const audioExtensions = ["mp3", "wav", "ogg", "flac"];

  if (documentExtensions.includes(extension))
    return { type: "document", extension };
  if (imageExtensions.includes(extension)) return { type: "image", extension };
  if (videoExtensions.includes(extension)) return { type: "video", extension };
  if (audioExtensions.includes(extension)) return { type: "audio", extension };

  return { type: "other", extension };
};

export const formatDateTime = (isoString: string | null | undefined) => {
  if (!isoString) return "—";

  const date = new Date(isoString);

  // Get hours and adjust for 12-hour format
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? "pm" : "am";

  // Convert hours to 12-hour format
  hours = hours % 12 || 12;

  // Format the time and date parts
  const time = `${hours}:${minutes.toString().padStart(2, "0")}${period}`;
  const day = date.getDate();
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = monthNames[date.getMonth()];

  return `${time}, ${day} ${month}`;
};

export const getFileIcon = (
  extension: string | undefined,
  type: FileType | string
) => {
  switch (extension) {
    // Document
    case "pdf":
      return "/assets/icons/file-pdf.svg";
    case "doc":
      return "/assets/icons/file-doc.svg";
    case "docx":
      return "/assets/icons/file-docx.svg";
    case "csv":
      return "/assets/icons/file-csv.svg";
    case "txt":
      return "/assets/icons/file-txt.svg";
    case "xls":
    case "xlsx":
      return "/assets/icons/file-document.svg";
    // Image
    case "svg":
      return "/assets/icons/file-image.svg";
    // Video
    case "mkv":
    case "mov":
    case "avi":
    case "wmv":
    case "mp4":
    case "flv":
    case "webm":
    case "m4v":
    case "3gp":
      return "/assets/icons/file-video.svg";
    // Audio
    case "mp3":
    case "mpeg":
    case "wav":
    case "aac":
    case "flac":
    case "ogg":
    case "wma":
    case "m4a":
    case "aiff":
    case "alac":
      return "/assets/icons/file-audio.svg";

    default:
      switch (type) {
        case "image":
          return "/assets/icons/file-image.svg";
        case "document":
          return "/assets/icons/file-document.svg";
        case "video":
          return "/assets/icons/file-video.svg";
        case "audio":
          return "/assets/icons/file-audio.svg";
        default:
          return "/assets/icons/file-other.svg";
      }
  }
};

// APPWRITE URL UTILS

type ImageTransformOptions = {
  width?: number;
  height?: number;
  gravity?:
    | "center"
    | "top-left"
    | "top"
    | "top-right"
    | "left"
    | "right"
    | "bottom-left"
    | "bottom"
    | "bottom-right";
  quality?: number;
  format?: "jpg" | "png" | "webp";
};

/**
 * Constructs an Appwrite file preview/view URL with optional transformations.
 *
 * Why we build URLs manually:
 * - Allows responsive thumbnails (width/height/quality/format) without proxying bytes through our server.
 * - Keeps UI fast and bandwidth efficient (critical for image-heavy grids).
 *
 * Reference: Appwrite Storage `getFileView` supports image transformations via query params.
 */
export const constructFileUrl = (
  bucketFileId: string,
  options?: ImageTransformOptions
) => {
  const base = `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${process.env.NEXT_PUBLIC_APPWRITE_BUCKET}/files/${bucketFileId}/view`;

  const params = new URLSearchParams({
    project: process.env.NEXT_PUBLIC_APPWRITE_PROJECT || "",
  });

  if (options?.width) params.set("width", String(options.width));
  if (options?.height) params.set("height", String(options.height));
  if (options?.gravity) params.set("gravity", options.gravity);
  if (options?.quality) params.set("quality", String(options.quality));
  if (options?.format) params.set("output", options.format);

  return `${base}?${params.toString()}`;
};

/**
 * Constructs an Appwrite download URL.
 *
 * Why this is a direct URL:
 * - Downloads can be large; opening a direct Appwrite endpoint avoids buffering content through Next.js,
 *   keeping the app server responsive and reducing memory pressure.
 */
export const constructDownloadUrl = (bucketFileId: string) => {
  return `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${process.env.NEXT_PUBLIC_APPWRITE_BUCKET}/files/${bucketFileId}/download?project=${process.env.NEXT_PUBLIC_APPWRITE_PROJECT}`;
};

// DASHBOARD UTILS
/**
 * Maps usage totals into UI-friendly dashboard summary cards.
 *
 * Why a derived model:
 * - Keeps the dashboard component simple and avoids duplicating routing/icon decisions.
 */
export const getUsageSummary = (totalSpace: any) => {
  return [
    {
      title: "Documents",
      size: totalSpace.document.size,
      latestDate: totalSpace.document.latestDate,
      icon: "/assets/icons/file-document-light.svg",
      url: "/documents",
    },
    {
      title: "Images",
      size: totalSpace.image.size,
      latestDate: totalSpace.image.latestDate,
      icon: "/assets/icons/file-image-light.svg",
      url: "/images",
    },
    {
      title: "Media",
      size: totalSpace.video.size + totalSpace.audio.size,
      latestDate:
        totalSpace.video.latestDate > totalSpace.audio.latestDate
          ? totalSpace.video.latestDate
          : totalSpace.audio.latestDate,
      icon: "/assets/icons/file-video-light.svg",
      url: "/media",
    },
    {
      title: "Others",
      size: totalSpace.other.size,
      latestDate: totalSpace.other.latestDate,
      icon: "/assets/icons/file-other-light.svg",
      url: "/others",
    },
  ];
};

export const getFileTypesParams = (type: string) => {
  switch (type) {
    case "documents":
      return ["document"];
    case "images":
      return ["image"];
    case "media":
      return ["video", "audio"];
    case "others":
      return ["other"];
    default:
      return ["document"];
  }
};

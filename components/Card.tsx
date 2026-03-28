import { convertFileSize } from "@/lib/utils";
import Link from "next/link";
import type { Models } from "node-appwrite";
import ActionDropdown from "./ActionDropdown";
import FormattedDateTime from "./FormattedDateTime";
import Thumbnail from "./Thumbnail";

type FileCardDoc = Models.Document & {
  url: string;
  type: string;
  extension: string;
  size: number;
  name: string;
  bucketFileId: string;
  starred?: boolean;
  owner?: {
    fullName?: string;
  };
};

/**
 * Non-selectable file card (single-file view pattern).
 *
 * Why this exists alongside `SelectableFileGrid`:
 * - Some pages/sections want a simple "open file" affordance with per-file actions,
 *   while others prefer a bulk-selection model.
 *
 * UX:
 * - Uses a real anchor (`Link`) to open the file in a new tab, keeping the dashboard context intact.
 * - Per-file actions are delegated to `ActionDropdown`, which calls Server Actions for secure mutation.
 */
const Card = ({ file }: { file: FileCardDoc }) => {
  return (
    <Link href={file.url} target="_blank" className="file-card">
      <div className="flex justify-between">
        <Thumbnail
          type={file.type}
          extension={file.extension}
          url={file.url}
          className="!size-20"
          imageClassName="!size-full"
        />

        <div className="flex flex-col items-end justify-between">
          <ActionDropdown file ={file}/>
          <p className="body-1">{convertFileSize(file.size)}</p>
        </div>
      </div>

      <div className="file-card-details">
        <p className="subtitle-2 line-clamp-1">{file.name}</p>
        <FormattedDateTime
          date={file.$createdAt}
          className="body-2 text-light-100"
        />

        <p className="caption line-clamp-1 text-light-200">
          BY: {file.owner?.fullName ?? "Unknown"}
        </p>
      </div>
    </Link>
  );
};

export default Card;

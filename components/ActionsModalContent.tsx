import { convertFileSize, formatDateTime } from "@/lib/utils";
import Image from "next/image";
import { Models } from "node-appwrite";
import FormattedDateTime from "./FormattedDateTime";
import Thumbnail from "./Thumbnail";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type ShareableFileDoc = Models.Document & {
  type: string;
  extension: string;
  url: string;
  name: string;
  size: number;
  owner?: { fullName?: string };
  users?: string[];
};

/**
 * Modal content primitives for per-file actions (details + sharing).
 *
 * Why this module exists:
 * - Keeps `ActionDropdown` focused on orchestration (what action to run) while this file
 *   owns the "enterprise UI" surfaces (audit-friendly metadata + share UX).
 * - Centralizes the share UX so single-file share and future bulk share can stay consistent
 *   in phrasing, validation patterns, and user expectations.
 *
 * Data model tie-in:
 * - Sharing is represented by an email-based access array (`file.users`) stored on the file document.
 *   This supports cross-account collaboration without requiring complex ACL UIs in early iterations.
 */
const ImageThumbnail = ({ file }: { file: ShareableFileDoc }) => (
  <div className="file-details-thumbnail">
    <Thumbnail type={file.type} extension={file.extension} url={file.url} />

    <div className="flex flex-col">
      <p className="subtitle-2 mb-1">{file.name}</p>
      <FormattedDateTime date={file.$createdAt} className="caption" />
    </div>
  </div>
);
const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex">
    <p className="file-details-label text-left">{label}</p>
    <p className="file-details-value text-left">{value}</p>
  </div>
);

/**
 * Read-only file metadata view.
 *
 * Engineering intent:
 * - Exposes the minimum useful fields for auditability (format, size, owner, last edit).
 * - Keeps formatting logic in `lib/utils.ts` so UI stays deterministic and locale-ready.
 */
export const FileDetails = ({ file }: { file: ShareableFileDoc }) => {
  return (
    <>
      <ImageThumbnail file={file} />
      <div className="space-y-4 px-2 pt-2">
        <DetailRow label="Format:" value={file.extension} />
        <DetailRow label="Size:" value={convertFileSize(file.size)} />
        <DetailRow label="Owner:" value={file.owner?.fullName ?? "Unknown"} />
        <DetailRow label="Last edit:" value={formatDateTime(file.$updatedAt)} />
      </div>
    </>
  );
};

interface Props {
  file: ShareableFileDoc;
  onInputChange: React.Dispatch<React.SetStateAction<string[]>>;
  onRemove: (email: string) => void;
}

/**
 * Share UX for a single file.
 *
 * Why comma-separated emails:
 * - Low friction for power users and matches common enterprise tools.
 *
 * Security boundary:
 * - This component only collects input; the actual permission mutation happens in Server Actions
 *   where we can enforce ownership and validate that the caller is allowed to share the file.
 */
export const ShareInput = ({ file, onInputChange, onRemove }: Props) => {
  const users = file.users ?? [];
  return (
    <>
      <ImageThumbnail file={file} />

      <div className="share-wrapper">
        <p className="subtitle-2 pl-1 text-light-100">
          Share file with other user
        </p>
        <Input
          type="email"
          placeholder="Enter email address"
          onChange={(e: { target: { value: string } }) =>
            onInputChange(e.target.value.trim().split(`,`))
          }
          className="share-input-field"
        />
        <div className="pt-4">
          <div className="flex justify-between">
            <p className="subtitle-2 text-light-100"> Shared with</p>
            <p className="subtitle-2 text-light-200">
              {users.length} users
            </p>
          </div>

          <ul className="pt-2">
            {users.map((email: string) => (
              <li
                key={email}
                className="flex items-center justify-between gap-2"
              >
                <p className="subtitle-2 ">{email}</p>
                <Button onClick={() => onRemove(email)} className ="share-remove-user">
                  <Image
                    src="/assets/icons/remove.svg"
                    alt="Remove"
                    width={24}
                    height={24}
                    className="remove-icon"
                  />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
};

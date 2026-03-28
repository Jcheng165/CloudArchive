"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { actionsDropdownItems } from "@/constants";
import {
  deleteFile,
  renameFile,
  toggleStarred,
  updateFileUsers,
} from "@/lib/actions/file.action";
import { constructDownloadUrl } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Models } from "node-appwrite";
import { useState } from "react";
import { FileDetails, ShareInput } from "./ActionsModalContent";

import { Button } from "./ui/button";
import { Input } from "./ui/input";

type ActionFileDoc = Models.Document & {
  type: string;
  name: string;
  extension: string;
  url: string;
  size: number;
  bucketFileId: string;
  starred?: boolean;
  owner?: { fullName?: string };
  users?: string[];
};

/**
 * Per-file action menu (rename, share, delete, download, details, star) for CloudArchive.
 *
 * Why this is a client component:
 * - Manages dropdown + modal state, form inputs, and loading indicators with immediate feedback.
 *
 * Why mutations still stay secure:
 * - Every destructive or authorization-sensitive operation calls a Server Action.
 *   Those actions use Node-Appwrite server-side and enforce:
 *   - **ownership** (only owners can rename/delete in most enterprise models)
 *   - **sharing rules** via an email-based `users` access array
 *
 * UX + reliability:
 * - We pass `path` so the server can `revalidatePath`, keeping lists consistent without manual refetch.
 * - Downloads use a constructed URL instead of streaming via the app server (keeps UI snappy).
 */
const ActionDropdown = ({ file }: { file: ActionFileDoc }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [action, setAction] = useState<ActionType | null>(null);
  const [name, setName] = useState(file.name);
  const [isLoading, setIsLoading] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const path = usePathname();

  const closeAllModals = () => {
    setIsModalOpen(false);
    setIsDropdownOpen(false);
    setAction(null);
    setName(file.name);
  };

  const handleAction = async () => {
    if (!action) return;
    setIsLoading(true);
    const actions = {
      rename: () =>
        renameFile({ fileId: file.$id, name, extension: file.extension, path }),

      share: () => updateFileUsers({ fileId: file.$id, emails, path }),
      delete: () =>
        deleteFile({ fileId: file.$id, path, bucketFileId: file.bucketFileId }),
    };
    try {
      await actions[action.value as keyof typeof actions]();
      closeAllModals();
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStar = async () => {
    setIsLoading(true);
    try {
      await toggleStarred({
        fileId: file.$id,
        starred: !file.starred,
        path,
      });
    } finally {
      setIsLoading(false);
      setIsDropdownOpen(false);
    }
  };

  const handleRemoveUser = async (emailToRemove: string) => {
    const updatedEmails = emails.filter((e) => e !== emailToRemove);
    const success = await updateFileUsers({
      fileId: file.$id,
      emails: updatedEmails,
      path,
    });

    if (success) setEmails(updatedEmails);
    closeAllModals();
  };

  const renderDialogContent = () => {
    if (!action) return null;
    const { value, label } = action;
    return (
      <DialogContent className="shad-dialog button">
        <DialogHeader className="flex flex-col gap-3">
          <DialogTitle className="text-center text-light-100">
            {label}
          </DialogTitle>
          {value === "rename" && (
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          {value === `details` && <FileDetails file={file} />}
          {value === `share` && (
            <ShareInput
              file={file}
              onInputChange={setEmails}
              onRemove={handleRemoveUser}
            />
          )}
          {value === "delete" && (
            <p className="delete-confirmation">
              {" "}
              Are you sure you want to delete{``}
              <span className="delete-file-name">{file.name}</span> ?{" "}
            </p>
          )}
        </DialogHeader>
        {[`rename`, `delete`, `share`].includes(value) && (
          <DialogFooter className="flex flex-col gap-3 md:flex-row">
            <Button onClick={closeAllModals} className="modal-cancel-button">
              Cancel
            </Button>
            <Button onClick={handleAction} className="modal-submit-button">
              <p className="capitalize">{value}</p>
              {isLoading && (
                <Image
                  src="/assets/icons/loader.svg"
                  alt="loader"
                  width={24}
                  height={24}
                  className="animate-spin"
                />
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    );
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger
          className="shad-no-focus"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Image
            src="/assets/icons/dots.svg"
            alt="dots"
            width={34}
            height={34}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel className="max-w-[200px] truncate">
            {file.name}
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="shad-dropdown-item"
            onClick={handleToggleStar}
          >
            <div className="flex items-center gap-2">
              <Image
                src="/assets/icons/star.svg"
                alt={file.starred ? "Unstar" : "Star"}
                width={30}
                height={30}
              />
              {file.starred ? "Unstar" : "Star"}
            </div>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          {actionsDropdownItems.map((actionItem) => (
            <DropdownMenuItem
              key={actionItem.value}
              className="shad-dropdown-item"
              onClick={() => {
                setAction(actionItem);

                if (
                  ["rename", "share", "delete", "details"].includes(
                    actionItem.value
                  )
                ) {
                  setIsModalOpen(true);
                }
              }}
            >
              {actionItem.value === "download" ? (
                <Link
                  href={constructDownloadUrl(file.bucketFileId)}
                  download={file.name}
                  className="flex items-center gap-2"
                >
                  <Image
                    src={actionItem.icon}
                    alt={actionItem.label}
                    width={30}
                    height={30}
                  />
                  {actionItem.label}
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                  <Image
                    src={actionItem.icon}
                    alt={actionItem.label}
                    width={30}
                    height={30}
                  />
                  {actionItem.label}
                </div>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {renderDialogContent()}
    </Dialog>
  );
};

export default ActionDropdown;

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
import {
  deleteFilePermanently,
  restoreFile,
} from "@/lib/actions/file.action";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Models } from "node-appwrite";
import { useState } from "react";
import { Button } from "./ui/button";

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Trash-specific actions menu.
 *
 * Why this exists separately from `ActionDropdown`:
 * - Trash view has a different safety model: the only meaningful actions are **restore** or
 *   **permanent delete**, both of which have higher risk and therefore require confirmation.
 * - Surfacing the purge countdown aligns the UI with the retention policy enforced by the
 *   scheduled Appwrite Function (30-day purge), reducing "where did my file go?" ambiguity.
 */
const getPurgeCountdownLabel = (deletedAt: string | null | undefined) => {
  if (!deletedAt) return "Auto-delete: —";

  const purgeAt = new Date(new Date(deletedAt).getTime() + DAYS_30_MS);
  const diffMs = purgeAt.getTime() - Date.now();

  if (Number.isNaN(purgeAt.getTime())) return "Auto-delete: —";
  if (diffMs <= 0) return "Auto-delete: soon";

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);

  if (days > 0) return `Auto-delete in ${days}d ${hours}h`;
  return `Auto-delete in ${hours}h`;
};

type TrashFileDoc = Models.Document & {
  name: string;
  bucketFileId: string;
  deletedAt?: string | null;
};

/**
 * Action dropdown for trashed files.
 *
 * Security + integrity:
 * - Restore / delete are executed via Server Actions to keep Node-Appwrite admin privileges server-side.
 * - Permanent delete requires both the DB document ID and the Storage `bucketFileId` so the backend can
 *   delete the correct pair and avoid orphaned storage objects.
 */
const TrashActionDropdown = ({ file }: { file: TrashFileDoc }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [action, setAction] = useState<"restore" | "delete" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const path = usePathname();

  const closeAllModals = () => {
    setIsModalOpen(false);
    setAction(null);
  };

  const handleAction = async () => {
    if (!action) return;
    setIsLoading(true);

    try {
      if (action === "restore") {
        await restoreFile({ fileId: file.$id, path });
      } else {
        await deleteFilePermanently({
          fileId: file.$id,
          bucketFileId: file.bucketFileId,
          path,
        });
      }
      closeAllModals();
    } finally {
      setIsLoading(false);
    }
  };

  const label = action === "restore" ? "Restore file" : "Delete permanently";

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DropdownMenu>
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
          <p className="caption px-2 pb-2 text-light-200">
            {getPurgeCountdownLabel(file.deletedAt)}
          </p>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="shad-dropdown-item group flex items-center gap-2"
            onClick={() => {
              setAction("restore");
              setIsModalOpen(true);
            }}
          >
            <Image
              src="/assets/icons/restore.svg"
              alt="Restore"
              width={30}
              height={30}
              className="opacity-70 transition-opacity group-hover:opacity-100"
            />
            Restore
          </DropdownMenuItem>

          <DropdownMenuItem
            className="shad-dropdown-item group flex items-center gap-2 text-red-500 focus:text-red-500"
            onClick={() => {
              setAction("delete");
              setIsModalOpen(true);
            }}
          >
            <Image
              src="/assets/icons/delete.svg"
              alt="Delete permanently"
              width={30}
              height={30}
              className="opacity-70 transition-opacity group-hover:opacity-100"
            />
            Delete permanently
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {action && (
        <DialogContent className="shad-dialog button">
          <DialogHeader className="flex flex-col gap-3">
            <DialogTitle className="text-center text-light-100">
              {label}
            </DialogTitle>
            <p className="delete-confirmation">
              Are you sure you want to{" "}
              {action === "restore" ? "restore" : "permanently delete"}{" "}
              <span className="delete-file-name">{file.name}</span>?
            </p>
          </DialogHeader>

          <DialogFooter className="flex flex-col gap-3 md:flex-row">
            <Button onClick={closeAllModals} className="modal-cancel-button">
              Cancel
            </Button>
            <Button onClick={handleAction} className="modal-submit-button">
              <p className="capitalize">
                {action === "restore" ? "Restore" : "Delete"}
              </p>
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
        </DialogContent>
      )}
    </Dialog>
  );
};

export default TrashActionDropdown;
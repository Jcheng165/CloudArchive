"use client";

// Grid UI + selection state; server mutations live in `@/lib/actions/file.action` and `/api/files/bulk-download`.
import ActionDropdown from "@/components/ActionDropdown";
import BulkActionBar from "@/components/BulkActionBar";
import FormattedDateTime from "@/components/FormattedDateTime";
import Thumbnail from "@/components/Thumbnail";
import TrashActionDropdown from "@/components/TrashActionDropdown";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  bulkDeletePermanently,
  bulkRestore,
  bulkSoftDelete,
  bulkUpdateFileUsers,
  bulkUpdateStarred,
} from "@/lib/actions/file.action";
import { cn, convertFileSize } from "@/lib/utils";
import { Star } from "lucide-react";
import { usePathname } from "next/navigation";
import { Models } from "node-appwrite";
import { useMemo, useState } from "react";

// --- Trash-only helper (auto-delete countdown on cards) ---
/** Soft-delete retention window shown on trash cards (matches server purge policy). */
const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

/** Human-readable countdown until auto-purge for trashed files. */
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

// Shape of each file row from Appwrite + our queries (starred drives favorites UI).
type FileDoc = Models.Document & {
  url: string;
  type: string;
  extension: string;
  size: number;
  name: string;
  bucketFileId: string;
  starred?: boolean;
  deletedAt?: string | null;
  owner?: {
    fullName?: string;
  };
};

type Props = {
  /** File rows from server actions (includes `starred` when present in Appwrite). */
  files: FileDoc[];
  /** `"normal"` lists vs `"trash"` (different actions + purge labels). */
  variant: "normal" | "trash";
};

/**
 * Selectable file grid with bulk actions for CloudArchive (Documents, Favorites, Trash, etc.).
 *
 * **Client component** — holds selection map, loading flags, and coordinates the floating
 * `BulkActionBar`.
 *
 * **Bulk behavior**
 * - **Download**: `POST /api/files/bulk-download` → one ZIP (avoids multi-tab pop-up blocking).
 * - **Trash / restore / permanent delete / share / favorite**: server actions on `selectedIds`.
 * - **Favorite**: sets `starred` for all selected, or clears if every selected file is already starred
 *   (`bulkUpdateStarred`). Label on the bar: Favorite / Unfavorite.
 *
 * **Favorited UI**
 * - When `file.starred`, shows an amber **star** beside the name and (except on `/favorites`) a light ring on the card.
 *
 * **Safety**
 * - Mutations run via Server Actions; ownership / sharing rules enforced server-side.
 */
const SelectableFileGrid = ({ files, variant }: Props) => {
  const path = usePathname();
  const { toast } = useToast();

  // `selected` = map of file $id → checked (checkboxes on cards).
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);

  // --- Derived lists for bulk bar ---
  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  );

  const selectedFiles = useMemo(() => {
    const setIds = new Set(selectedIds);
    return files.filter((f) => setIds.has(f.$id));
  }, [files, selectedIds]);

  const allSelectedStarred = useMemo(
    () =>
      selectedFiles.length > 0 &&
      selectedFiles.every((f) => f.starred === true),
    [selectedFiles]
  );

  const toggle = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const clear = () => setSelected({});

  const selectAll = () => {
    const all: Record<string, boolean> = {};
    files.forEach((f) => {
      all[f.$id] = true;
    });
    setSelected(all);
  };

  // --- Bulk actions (all use `selectedIds` / `selectedFiles` + current `path` for revalidate) ---
  const bulkDownload = async () => {
    if (selectedIds.length === 0) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/files/bulk-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: selectedIds, variant }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: "Download failed",
          description: data.error ?? "Could not download files.",
          className: "error-toast",
        });
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        selectedIds.length === 1
          ? `${selectedFiles[0]?.name ?? "file"}.zip`.replace(/[/\\]/g, "_")
          : `cloudarchive-${selectedIds.length}-files.zip`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: "Download failed",
        description: "Something went wrong. Try again.",
        className: "error-toast",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const bulkTrash = async () => {
    setIsLoading(true);
    try {
      await bulkSoftDelete({ fileIds: selectedIds, path });
      clear();
    } finally {
      setIsLoading(false);
    }
  };

  const bulkRestoreSelected = async () => {
    setIsLoading(true);
    try {
      await bulkRestore({ fileIds: selectedIds, path });
      clear();
    } finally {
      setIsLoading(false);
    }
  };

  const bulkDelete = async () => {
    setIsLoading(true);
    try {
      await bulkDeletePermanently({
        files: selectedFiles.map((f) => ({
          fileId: f.$id,
          bucketFileId: f.bucketFileId,
        })),
        path,
      });
      clear();
    } finally {
      setIsLoading(false);
    }
  };

  const bulkShareSelected = async (emails: string[]) => {
    setIsLoading(true);
    try {
      await bulkUpdateFileUsers({ fileIds: selectedIds, emails, path });
      clear();
    } finally {
      setIsLoading(false);
    }
  };

  const bulkFavoriteSelected = async () => {
    setIsLoading(true);
    try {
      await bulkUpdateStarred({
        fileIds: selectedIds,
        starred: !allSelectedStarred,
        path,
      });
      clear();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* --- File cards (click = toggle selection; ⋮ menu = per-file actions) --- */}
      <section className="file-list">
        {files.map((file) => {
          const isSelected = !!selected[file.$id];

          return (
            <div key={file.$id} className="relative">
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "file-card w-full cursor-pointer text-left",
                  file.starred &&
                    variant === "normal" &&
                    path !== "/favorites" &&
                    "ring-2 ring-amber-400/45 ring-offset-2 ring-offset-light-400"
                )}
                onClick={() => toggle(file.$id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(file.$id);
                  }
                }}
              >
                <div className="flex justify-between">
                  <Thumbnail
                    type={file.type}
                    extension={file.extension}
                    url={file.url}
                    className="!size-20"
                    imageClassName="!size-full"
                  />

                  <div className="flex flex-col items-end justify-between">
                    {variant === "trash" ? (
                      <TrashActionDropdown file={file} />
                    ) : (
                      <ActionDropdown file={file} />
                    )}
                    <p className="body-1">{convertFileSize(file.size)}</p>
                  </div>
                </div>

                {/* Name row: optional star if `starred` (favorites hint) */}
                <div className="file-card-details">
                  <div className="flex min-w-0 items-start gap-2">
                    {file.starred && variant === "normal" && (
                      <span
                        className="mt-0.5 inline-flex shrink-0"
                        title="Favorited"
                        aria-label="Favorited"
                      >
                        <Star
                          className="size-[18px] fill-amber-400 text-amber-400"
                          strokeWidth={0}
                          aria-hidden
                        />
                      </span>
                    )}
                    <p className="subtitle-2 line-clamp-1 min-w-0 flex-1">
                      {file.name}
                    </p>
                  </div>
                  <FormattedDateTime
                    date={file.$createdAt}
                    className="body-2 text-light-100"
                  />

                  <p className="caption line-clamp-1 text-light-200">
                    BY: {file.owner?.fullName ?? "Unknown"}
                  </p>

                  {variant === "trash" && (
                    <p className="caption line-clamp-1 text-light-200">
                      {getPurgeCountdownLabel(file.deletedAt)}
                    </p>
                  )}
                </div>
              </div>

              {/* Checkbox overlay (separate from card click target to avoid double-toggle bugs) */}
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(file.$id);
                }}
                className="absolute left-4 top-4 size-8 rounded-full bg-white/90 p-0 shadow-drop-1 hover:bg-white"
              >
                <span
                  className={`flex size-6 items-center justify-center rounded-full border text-[14px] leading-[20px] font-semibold ${
                    isSelected
                      ? "border-brand bg-brand text-white"
                      : "border-light-300 bg-white text-transparent"
                  }`}
                >
                  ✓
                </span>
              </Button>
            </div>
          );
        })}
      </section>

      {/* --- Bottom bar: only when at least one file selected --- */}
      {selectedIds.length > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.length}
          variant={variant}
          onClear={clear}
          onSelectAll={selectAll}
          onTrash={variant === "normal" ? bulkTrash : undefined}
          onShare={variant === "normal" ? bulkShareSelected : undefined}
          onFavorite={variant === "normal" ? bulkFavoriteSelected : undefined}
          favoriteLabel={allSelectedStarred ? "Unfavorite" : "Favorite"}
          onRestore={variant === "trash" ? bulkRestoreSelected : undefined}
          onDeletePermanently={variant === "trash" ? bulkDelete : undefined}
          onDownload={bulkDownload}
          isLoading={isLoading}
        />
      )}
    </>
  );
};

export default SelectableFileGrid;


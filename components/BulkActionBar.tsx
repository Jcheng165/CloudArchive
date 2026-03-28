"use client";

// UI primitives: buttons, modal for “Share selected” email capture.
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useMemo, useState } from "react";

// Props from parent (`SelectableFileGrid`): which bulk actions exist depends on `variant` (normal vs trash).
type Props = {
  selectedCount: number;
  /** `"normal"` shows trash, share, favorite, download; `"trash"` shows restore, delete, download. */
  variant: "normal" | "trash";
  onClear: () => void;
  onSelectAll: () => void;
  onTrash?: () => void;
  onShare?: (emails: string[]) => Promise<void> | void;
  onRestore?: () => void;
  onDeletePermanently?: () => void;
  /** ZIP download via `POST /api/files/bulk-download` (parent implements `fetch` + blob save). */
  onDownload: () => void;
  /** Bulk favorite toggle — only on normal lists; omit on trash. */
  onFavorite?: () => void;
  /** Short label, e.g. `"Favorite"` / `"Unfavorite"`. */
  favoriteLabel?: string;
  isLoading?: boolean;
};

// Reused Tailwind chunks so Share / Favorite / Download look like one group (vs red destructive buttons).
/** Shared look for non-destructive bulk actions (Share, Favorite, Download). */
const secondaryActionClass =
  "h-9 shrink-0 gap-1.5 rounded-full border border-light-300 bg-white px-3 text-[13px] font-medium leading-tight text-light-100 shadow-none transition-colors hover:bg-light-400/35 focus-visible:ring-brand/30";

/** Primary selection controls (Select all / Clear). */
const selectionChipClass =
  "h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium shadow-none";

/**
 * Floating bulk command bar for `SelectableFileGrid`.
 *
 * **Layout**
 * - Wide bar (`max-w-5xl`) with selection chips (Select all / Clear) on the left.
 * - Actions on the right: **nowrap** + horizontal scroll on small screens so actions stay one row.
 *
 * **Styling**
 * - Secondary actions (Share, Favorite, Download): bordered white pills.
 * - Destructive primary: Trash (normal) / Delete (trash) use `bg-red`.
 *
 * **Share** opens a dialog to collect comma-separated emails, then calls `onShare`.
 */
const BulkActionBar = ({
  selectedCount,
  variant,
  onClear,
  onSelectAll,
  onTrash,
  onShare,
  onRestore,
  onDeletePermanently,
  onDownload,
  onFavorite,
  favoriteLabel = "Favorite",
  isLoading,
}: Props) => {
  // Share dialog: comma-separated emails → parsed list for `onShare`.
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [emailsText, setEmailsText] = useState("");

  const parsedEmails = useMemo(
    () =>
      emailsText
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean),
    [emailsText]
  );

  const canShare = parsedEmails.length > 0 && !!onShare && !isLoading;

  return (
    <>
      {/* --- Share modal (only opened from Share button) --- */}
      <Dialog open={isShareOpen} onOpenChange={setIsShareOpen}>
        <DialogContent className="shad-dialog button">
          <DialogHeader className="flex flex-col gap-3">
            <DialogTitle className="text-center text-light-100">
              Share selected files
            </DialogTitle>
            <p className="subtitle-2 text-center text-light-200">
              Add email addresses separated by commas. CloudArchive will grant access by
              adding them to each file’s `users` access list.
            </p>

            <Input
              type="email"
              placeholder="e.g. alex@company.com, dev@company.com"
              value={emailsText}
              onChange={(e) => setEmailsText(e.target.value)}
              className="share-input-field"
            />
          </DialogHeader>

          <DialogFooter className="flex flex-col gap-3 md:flex-row">
            <Button
              type="button"
              onClick={() => {
                setIsShareOpen(false);
                setEmailsText("");
              }}
              className="modal-cancel-button"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={async () => {
                if (!onShare) return;
                await onShare(parsedEmails);
                setIsShareOpen(false);
                setEmailsText("");
              }}
              className="modal-submit-button"
              disabled={!canShare}
            >
              Share
              {isLoading && (
                <Image
                  src="/assets/icons/loader.svg"
                  alt="loader"
                  width={24}
                  height={24}
                  className="ml-2 animate-spin"
                />
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Fixed bar: selection summary + all bulk action buttons --- */}
      <div
        className={cn(
          "fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 sm:bottom-5",
          "rounded-[20px] border border-light-300/70 bg-white/95 p-3 shadow-drop-3 backdrop-blur-sm sm:p-4"
        )}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          {/* Left: “N selected” + Select all / Clear */}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 sm:justify-start">
            <p className="subtitle-2 shrink-0 whitespace-nowrap text-light-100">
              <span className="font-semibold">{selectedCount}</span> selected
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={onSelectAll}
                className={cn(
                  selectionChipClass,
                  "bg-brand/12 text-brand hover:bg-brand/20"
                )}
              >
                Select all
              </Button>
              <Button
                type="button"
                onClick={onClear}
                className={cn(
                  selectionChipClass,
                  "bg-light-400/80 text-light-100 hover:bg-light-400"
                )}
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Right: actions row (scrolls horizontally on narrow screens so nothing wraps under another) */}
          <div
            className={cn(
              "flex min-w-0 flex-nowrap items-stretch justify-start gap-2 overflow-x-auto pb-0.5 lg:max-w-none lg:flex-1 lg:justify-end lg:pb-0 lg:pl-2",
              "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            )}
          >
            {/* Normal list: soft-delete */}
            {variant === "normal" && onTrash && (
              <Button
                type="button"
                onClick={onTrash}
                className="h-9 shrink-0 gap-1.5 rounded-full bg-red px-3 text-[13px] font-medium text-white shadow-none hover:bg-red/90"
                disabled={isLoading}
              >
                <Image
                  src="/assets/icons/trash-bin.svg"
                  alt=""
                  width={16}
                  height={16}
                  className="shrink-0 opacity-95"
                />
                Trash
              </Button>
            )}

            {/* Opens share dialog above */}
            {variant === "normal" && onShare && (
              <Button
                type="button"
                onClick={() => setIsShareOpen(true)}
                className={cn(secondaryActionClass)}
                disabled={isLoading}
              >
                <Image
                  src="/assets/icons/share.svg"
                  alt=""
                  width={16}
                  height={16}
                  className="shrink-0"
                />
                Share
              </Button>
            )}

            {variant === "normal" && onFavorite && (
              <Button
                type="button"
                onClick={onFavorite}
                className={cn(secondaryActionClass)}
                disabled={isLoading}
                title={favoriteLabel}
              >
                <Image
                  src="/assets/icons/star.svg"
                  alt=""
                  width={16}
                  height={16}
                  className="shrink-0"
                />
                {favoriteLabel}
              </Button>
            )}

            {/* Trash list: restore soft-deleted */}
            {variant === "trash" && onRestore && (
              <Button
                type="button"
                onClick={onRestore}
                className="h-9 shrink-0 gap-1.5 rounded-full bg-brand px-3 text-[13px] font-medium text-white shadow-none hover:bg-brand-100"
                disabled={isLoading}
              >
                <Image
                  src="/assets/icons/restore.svg"
                  alt=""
                  width={16}
                  height={16}
                  className="shrink-0"
                />
                Restore
              </Button>
            )}

            {/* Trash list: hard delete storage + DB */}
            {variant === "trash" && onDeletePermanently && (
              <Button
                type="button"
                onClick={onDeletePermanently}
                className="h-9 shrink-0 gap-1.5 rounded-full bg-red px-3 text-[13px] font-medium text-white shadow-none hover:bg-red/90"
                disabled={isLoading}
              >
                <Image
                  src="/assets/icons/delete.svg"
                  alt=""
                  width={16}
                  height={16}
                  className="shrink-0"
                />
                Delete
              </Button>
            )}

            {/* ZIP download API (always shown for both variants) */}
            <Button
              type="button"
              onClick={onDownload}
              className={cn(secondaryActionClass)}
              disabled={isLoading}
            >
              <Image
                src="/assets/icons/download.svg"
                alt=""
                width={16}
                height={16}
                className="shrink-0"
              />
              Download
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default BulkActionBar;

"use client";
import { MAX_FILE_SIZE } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/lib/actions/file.action";
import { cn, convertFileToUrl, getFileType } from "@/lib/utils";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import Thumbnail from "./Thumbnail";
import { Button } from "./ui/button";

interface Props {
  ownerId: string;
  accountId: string;
  className?: string;
}

/**
 * Drag-and-drop uploader for CloudArchive.
 *
 * Key decisions:
 * - **Client component for UX**: dropzone interaction, previews, and per-file progress affordances
 *   require immediate client-side state updates.
 * - **Server Action for upload**: the actual upload call (`uploadFile`) runs server-side to keep
 *   Node-Appwrite credentials private and to guarantee Storage+DB metadata integrity.
 * - **Preflight validation**: we enforce a 50MB limit before any network call, protecting user time
 *   and backend resources (important for multi-tenant platforms).
 *
 * UX model:
 * - Displays optimistic "Uploading" items immediately, then removes each item upon success.
 * - Uses local `URL.createObjectURL` previews (via `convertFileToUrl`) to keep thumbnails snappy.
 */
const FileUploader = ({ ownerId, accountId, className }: Props) => {
  const path = usePathname();
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);

  const removeFromQueue = (fileName: string) => {
    setFiles((prevFiles) => prevFiles.filter((f) => f.name !== fileName));
  };

  const validateSizeOrToast = useCallback((file: File) => {
    if (file.size <= MAX_FILE_SIZE) return true;

    removeFromQueue(file.name);
    toast({
      description: (
        <p className="body-2 text-white">
          <span className="font-semibold">{file.name}</span> is too large. Max file
          size is 50MB.
        </p>
      ),
      className: "error-toast",
    });
    return false;
  }, [toast]);

  const uploadOne = useCallback(
    async (file: File) => {
      if (!validateSizeOrToast(file)) return;

      const uploadedFile = await uploadFile({ file, ownerId, accountId, path });
      if (uploadedFile) removeFromQueue(file.name);
    },
    [ownerId, accountId, path, validateSizeOrToast]
  );

  /**
   * Upload pipeline: validate -> call server action -> clean up UI state.
   *
   * Why `Promise.all`:
   * - Enables concurrent uploads for better throughput on modern networks.
   * - UI stays responsive; failures for one file do not block others.
   */
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setFiles(acceptedFiles);

      await Promise.all(acceptedFiles.map(uploadOne));
    },
    [uploadOne]
  );

  const { getRootProps, getInputProps } = useDropzone({
    // `react-dropzone` expects a void handler; we intentionally "fire-and-forget"
    // and track completion via local state updates.
    onDrop: (acceptedFiles) => {
      void onDrop(acceptedFiles);
    },
  });

  // only remove the file that we click on
  const handleRemoveFile = (
    e: React.MouseEvent<HTMLImageElement, MouseEvent>,
    fileName: string
  ) => {
    e.stopPropagation();
    removeFromQueue(fileName);
  };

  return (
    <div {...getRootProps()} className="cursor-pointer">
      <input {...getInputProps()} />
      <Button type="button" className={cn("uploader-button")}>
        <Image
          src="/assets/icons/upload.svg"
          alt="upload"
          width={24}
          height={24}
        />
        <p>Upload</p>
      </Button>
      {files.length > 0 && (
        <ul className="uploader-preview-list">
          <h4 className="h4 text-light-100">Uploading</h4>

          {files.map((file, index) => {
            const { type, extension } = getFileType(file.name);

            return (
              <li
                key={`${file.name}-${index}`}
                className="uploader-preview-item"
              >
                <div className="flex items-center gap-3">
                  <Thumbnail
                    type={type}
                    extension={extension}
                    url={convertFileToUrl(file)}
                  />

                  <div className="preview-item-name">
                    {file.name}
                    <Image
                      src="/assets/icons/file-loader.gif"
                      width={80}
                      height={26}
                      alt="Loader"
                    />
                  </div>
                </div>

                <Image
                  src="/assets/icons/remove.svg"
                  width={24}
                  height={24}
                  alt="Remove"
                  onClick={(e) => handleRemoveFile(e, file.name)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default FileUploader;

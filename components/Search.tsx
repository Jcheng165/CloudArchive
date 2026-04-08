"use client";

import { useEffect, useState } from "react";

import FormattedDateTime from "@/components/FormattedDateTime";
import Thumbnail from "@/components/Thumbnail";
import { Input } from "@/components/ui/input";
import { getFiles } from "@/lib/actions/file.action";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Models } from "node-appwrite";
import { useDebounce } from "use-debounce";

type FileType = "document" | "image" | "video" | "audio" | "other";

type FileDoc = Models.Document & {
  type: FileType;
  extension: string;
  url: string;
  name: string;
};

const getTypesForFilter = (
  filter: "all" | "documents" | "images" | "media" | "others"
): FileType[] => {
  switch (filter) {
    case "documents":
      return ["document"];
    case "images":
      return ["image"];
    case "media":
      return ["video", "audio"];
    case "others":
      return ["other"];
    default:
      return [];
  }
};

/**
 * Global search bar with type filtering for CloudArchive.
 *
 * Why this is implemented as a client-side "command palette" style dropdown:
 * - **Fast UX**: debounce + lightweight results preview lets users jump directly to content.
 * - **Server-side authorization**: results come from a Server Action (`getFiles`) that applies
 *   ownership + share-based access rules (email array) before returning documents.
 *
 * Performance strategy:
 * - Debounced input prevents over-fetching while typing.
 * - Optional server-side filtering by `type` reduces payload size and keeps Appwrite queries selective.
 */
const Search = () => {
  const [query, setQuery] = useState("");
  const [contentFilter, setContentFilter] = useState<
    "all" | "documents" | "images" | "media" | "others"
  >("all");
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("query") || "";
  const [results, setResults] = useState<FileDoc[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const path = usePathname();
  const [debouncedQuery] = useDebounce(query, 300);

  /**
   * Fetch results when the debounced query changes.
   *
   * We also keep the URL query string in sync, which makes search states shareable/bookmarkable
   * without turning the UI into a full server-rendered search page.
   */
  useEffect(() => {
    const fetchFiles = async () => {
      if (debouncedQuery.length === 0) {
        setResults([]);
        setOpen(false);
        if (searchQuery) router.replace(path);
        return;
      }

      const types = getTypesForFilter(contentFilter);

      const files = await getFiles({ types, searchText: debouncedQuery });
      setResults(files.documents as FileDoc[]);
      setOpen(true);
    };

    fetchFiles();
  }, [debouncedQuery, contentFilter, path, router, searchQuery]);

  const handleClickItem = (file: FileDoc) => {
    setOpen(false);
    setResults([]);

    router.push(
      `/${file.type === "video" || file.type === "audio" ? "media" : file.type + "s"}?query=${query}`
    );
  };

  return (
    <div className="search">
      <div className="search-input-wrapper">
        <Image
          src="/assets/icons/search.svg"
          alt="Search"
          width={24}
          height={24}
        />
        <Input
          value={query}
          placeholder="Search..."
          className="search-input"
          onChange={(e) => setQuery(e.target.value)}
        />

        {/* Keep mobile header clean; show filter from md+ */}
        <div className="hidden md:block">
          <Select
            value={contentFilter}
            onValueChange={(value) =>
              setContentFilter(value as typeof contentFilter)
            }
          >
            <SelectTrigger className="ml-2 w-[130px] bg-dark-300 border-none text-light-100">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="documents">Documents</SelectItem>
              <SelectItem value="images">Images</SelectItem>
              <SelectItem value="media">Media</SelectItem>
              <SelectItem value="others">Others</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {open && (
          <ul className="search-result">
            {results.length > 0 ? (
              results.map((file) => (
                <button
                  type="button"
                  className="flex w-full items-center justify-between"
                  key={file.$id}
                  onClick={() => handleClickItem(file)}
                >
                  <div className="flex cursor-pointer items-center gap-4">
                    <Thumbnail
                      type={file.type}
                      extension={file.extension}
                      url={file.url}
                      className="size-9 min-w-9"
                    />
                    <p className="subtitle-2 line-clamp-1 text-light-100">
                      {file.name}
                    </p>
                  </div>

                  <FormattedDateTime
                    date={file.$createdAt}
                    className="caption line-clamp-1 text-light-200"
                  />
                </button>
              ))
            ) : (
              <p className="empty-result">No files found</p>
            )}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Search;

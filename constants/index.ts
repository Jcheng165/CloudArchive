/**
 * Product constants for CloudArchive.
 *
 * Why these live in one module:
 * - **Consistency**: navigation, dropdown actions, and platform limits should not be duplicated across UI.
 * - **Governance**: these values are part of the product contract (e.g., max upload size) and should be
 *   easy to audit and update in one place.
 */
export const navItems = [
  {
    name: "Dashboard",
    icon: "/assets/icons/dashboard.svg",
    url: "/",
  },
  {
    name: "Documents",
    icon: "/assets/icons/documents.svg",
    url: "/documents",
  },
  {
    name: "Images",
    icon: "/assets/icons/images.svg",
    url: "/images",
  },
  {
    name: "Media",
    icon: "/assets/icons/video.svg",
    url: "/media",
  },
  {
    name: "Others",
    icon: "/assets/icons/others.svg",
    url: "/others",
  },
  {
    name: "Favorites",
    icon: "/assets/icons/star.svg",
    url: "/favorites",
  },
  {
    name: "Trash",
    icon: "/assets/icons/trash-bin.svg",
    url: "/trash",
  },
];

export const actionsDropdownItems = [
  {
    label: "Rename",
    icon: "/assets/icons/edit.svg",
    value: "rename",
  },
  {
    label: "Details",
    icon: "/assets/icons/info.svg",
    value: "details",
  },
  {
    label: "Share",
    icon: "/assets/icons/share.svg",
    value: "share",
  },
  {
    label: "Download",
    icon: "/assets/icons/download.svg",
    value: "download",
  },
  {
    label: "Delete",
    icon: "/assets/icons/delete.svg",
    value: "delete",
  },
];

export const sortTypes = [
  {
    label: "Date created (newest)",
    value: "$createdAt-desc",
  },
  {
    label: "Created Date (oldest)",
    value: "$createdAt-asc",
  },
  {
    label: "Name (A-Z)",
    value: "name-asc",
  },
  {
    label: "Name (Z-A)",
    value: "name-desc",
  },
  {
    label: "Size (Highest)",
    value: "size-desc",
  },
  {
    label: "Size (Lowest)",
    value: "size-asc",
  },
];

export const avatarPlaceholderUrl =
  "https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg";

/**
 * Max upload size enforced at the UI boundary.
 *
 * Why we validate client-side:
 * - Saves user time and bandwidth.
 * - Reduces backend load and prevents oversized uploads from consuming Storage quotas.
 *
 * Note: the server should also enforce limits for true defense-in-depth.
 */
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
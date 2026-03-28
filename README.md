# CloudArchive

CloudArchive is a professional-grade, passwordless file storage application built with **Next.js (App Router)** and **Appwrite**. It offers a modern, Google Drive–style experience with secure uploads, intelligent file organization, and automated trash retention.

## Overview

**[Live Demo](https://cloud-archive.vercel.app)** | **[GitHub Repository](https://github.com/Jcheng165/CloudArchive)**

CloudArchive enables users to authenticate via email OTP, upload and preview files, browse by type, search quickly, manage favorites, and collaborate via email-based sharing. A robust trash lifecycle and scheduled purge function keep storage lean and maintain data hygiene.

## Key Features

- **Passwordless authentication (email OTP)**  
  Frictionless sign-up and sign-in using Appwrite email tokens and session cookies. The OTP step includes a **60s resend cooldown** (client-side) to reduce accidental rate-limit hits.

- **File upload and preview**  
  Drag-and-drop uploads with client-side size validation and in-app preview support.

- **Type-based browsing**  
  Browse by category: Documents, Images, Media, and Others.

- **Fast search**  
  Debounced search with optional type filters for quickly locating files.

- **Favorites**  
  Star/unstar files and access them from a dedicated `/favorites` view.

- **Email-based sharing**  
  Grant access by storing collaborator email addresses directly on the file document.

- **Trash lifecycle and retention**  
  - Soft delete with restore support  
  - Permanent delete when required  
  - Automated Appwrite Function that purges items older than 30 days

- **Bulk actions**  
  Select multiple files to **move to trash**, **restore**, **permanent delete**, **favorite / unfavorite**, **share** (comma-separated emails), or **download as a single ZIP**. Bulk download is implemented as `POST /api/files/bulk-download` (one response avoids browsers blocking multiple file downloads).

- **Dashboard**  
  Storage usage summary by type and **recent uploads** with quick open links. Favorited files show an **amber star** beside the name (same cue as the file grid).

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript  
- **UI**: Tailwind CSS, Radix UI primitives  
- **Backend**: Appwrite (Database, Storage, Functions)

## Architecture

- **Server Actions** (`lib/actions/*`)  
  - All mutations run on the server.  
  - Storage and database writes are coordinated to keep metadata and file storage consistent.  
  - **Authorization**: all file mutations enforce owner checks server-side (even when using an admin key).

- **Route Handlers** (`app/api/`)  
  - **`POST /api/files/bulk-download`** — builds a ZIP with [JSZip](https://github.com/Stuk/jszip) after per-file read checks (`assertCanReadFile`). Use this for multi-file download instead of opening many tabs.

- **Responsive UI**  
  - Root `layout` exports a standard **`viewport`** (`device-width`, `initialScale: 1`) so layouts match real phone and tablet widths across browsers.

- **Metadata model**  
  - Storage object ID: `bucketFileId`  
  - Database document ID: `$id`  
  - Key fields: `owner`, `users[]`, `isDeleted`, `deletedAt`, `starred`, `version`

## Getting Started

### Prerequisites

- **Node.js**: \(>= 20.9.0\) (required by Next.js 16)
- **npm** (recommended, project includes a lockfile)
- An **Appwrite** instance (Cloud or self-hosted)

### Install

```bash
npm install
```

### Environment variables

Create `.env.local` in the project root:

```bash
# Public Appwrite config (safe for browser)
NEXT_PUBLIC_APPWRITE_ENDPOINT="https://YOUR_APPWRITE_ENDPOINT/v1"
NEXT_PUBLIC_APPWRITE_PROJECT="YOUR_PROJECT_ID"
NEXT_PUBLIC_APPWRITE_DATABASE="YOUR_DATABASE_ID"
NEXT_PUBLIC_APPWRITE_USERS_COLLECTION="YOUR_USERS_COLLECTION_ID"
NEXT_PUBLIC_APPWRITE_FILES_COLLECTION="YOUR_FILES_COLLECTION_ID"
NEXT_PUBLIC_APPWRITE_BUCKET="YOUR_BUCKET_ID"

# Server-only secret (DO NOT expose to the client)
NEXT_APPWRITE_KEY="YOUR_APPWRITE_API_KEY"
```

### Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

### Other scripts

```bash
npm run build   # production build + typecheck
npm run lint    # ESLint
```

## Appwrite setup & data model

You’ll need:

- **Storage bucket** for file bytes
- **Database** with two collections:
  - **Users collection**: CloudArchive user profiles
  - **Files collection**: metadata for uploaded files

### Files collection (recommended)

**Purpose**: stores metadata for every uploaded object and its lifecycle.

- **Identity & basics**
  - `name` / `originalName`
  - `extension`
  - `type` (enum)
  - `url`
  - `size`
  - `bucketFileId` (storage object ID)
- **Ownership & sharing**
  - `owner` (relationship to `Users.$id`)
  - `ownerName`
  - `accountId`
  - `users[]` (collaborator emails)
- **Lifecycle & flags**
  - `isDeleted`
  - `deletedAt`
  - `version`
  - `starred`
- **System fields**
  - `$id`
  - `$createdAt`
  - `$updatedAt`

**Required fields for this project** (recommended):

- `url`
- `type`
- `bucketFileId`
- `accountId`
- `isDeleted`

### Users collection (recommended)

**Purpose**: stores CloudArchive user profiles linked to Appwrite accounts.

- **Identity**
  - `fullName`
  - `email`
- **Profile**
  - `avatar`
- **Account linkage**
  - `accountId` (Appwrite account ID)
  - `file` (relationship to most recent file, optional)
- **System fields**
  - `$id`
  - `$createdAt`
  - `$updatedAt`

**Required fields for this project** (recommended):

- `fullName`
- `email`
- `accountId`

## Retention purge (Trash > 30 days)

This repo includes an Appwrite Function:

- Path: `appwrite-functions/purge-trash-30-days/`
- Behavior: deletes file documents with `isDeleted=true` and `deletedAt` older than 30 days, then deletes the Storage object.

Configure the function with these environment variables in Appwrite:

```bash
APPWRITE_FUNCTION_ENDPOINT="https://YOUR_APPWRITE_ENDPOINT/v1"
APPWRITE_FUNCTION_PROJECT_ID="YOUR_PROJECT_ID"
APPWRITE_API_KEY="YOUR_APPWRITE_API_KEY"
APPWRITE_DATABASE_ID="YOUR_DATABASE_ID"
APPWRITE_FILES_COLLECTION_ID="YOUR_FILES_COLLECTION_ID"
APPWRITE_BUCKET_ID="YOUR_BUCKET_ID"
```

## Deployment

- Deploy as a standard Next.js app (e.g. Vercel).
- Ensure `NEXT_APPWRITE_KEY` is set as a **server-only** secret in your hosting provider.
- In production, set auth cookies to `secure: true` (HTTPS-only). See `lib/actions/user.actions.ts`.

> Engineered with a modern full-stack architecture leveraging Next.js 16 (App Router), React 19, and Appwrite for scalable, server-side-first performance.

## Author
Jacky Cheng

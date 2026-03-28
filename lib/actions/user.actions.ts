"use server";

import { cookies } from "next/headers";
import { ID, Query } from "node-appwrite";

import { avatarPlaceholderUrl } from "@/constants";
import { redirect } from "next/navigation";
import { appwriteConfig } from "@/lib/appwrite/config";
import { createAdminClient, createSessionClient } from "@/lib/appwrite";
import { parseStringify } from "@/lib/utils";

/**
 * User identity + session management for CloudArchive.
 *
 * Design goals:
 * - **Passwordless auth** via Appwrite email OTP (better UX, fewer credential risks).
 * - **Server-owned session state** via HTTP-only cookies (mitigates XSS token theft).
 * - **Multi-device simplicity**: account lookup is anchored on `accountId` stored in a stable cookie
 *   so Server Actions can reliably resolve the current user without passing identifiers from the client.
 *
 * OTP flow:
 * - `sendEmailOTP` / `createAccount` / `signInUser` call Appwrite `createEmailToken`; on success, Appwrite
 *   emails the 6-digit code (delivery is entirely on Appwrite’s side).
 * - `verifySecret` exchanges the code for a session and sets cookies; **create-account** also creates the Users
 *   collection profile **only after** OTP succeeds (so abandoned create-account attempts do not get a DB row and cannot use Log in).
 * - The OTP modal also calls `sendEmailOTP` for **resend**; the UI adds its own cooldown between attempts (see `OTPModal`).
 *
 * Notes:
 * - These actions intentionally run on the server (`"use server"`) because they require Node-Appwrite
 *   and must never expose API keys or session secrets to the browser.
 */
const getUserByEmail = async (email: string) => {
  const { databases } = await createAdminClient();

  const result = await databases.listDocuments(
    appwriteConfig.databaseId,
    appwriteConfig.usersCollectionId,
    [Query.equal("email", [email])]
  );
  return result.total > 0 ? result.documents[0] : null;
};

const handleError = (error: unknown, message: string) => {
  console.log(error, message);
  throw error;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

type OTPResult = {
  accountId: string | null;
  error: string | null;
};

const getErrorMessage = (error: unknown) => {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }

  return "Unknown error";
};

/**
 * Starts the OTP flow by asking Appwrite to email a one-time token to the user.
 *
 * Appwrite behavior (see [Email OTP](https://appwrite.io/docs/products/auth/email-otp)):
 * - Pass `ID.unique()` as `userId`; if the email already belongs to an account, that userId is ignored.
 * - On **success**, Appwrite sends the OTP email; `session.userId` is the Auth user id used for `verifySecret`.
 *
 * Errors:
 * - **429** (`general_rate_limit_exceeded`): the request is rejected; **no email is sent**. Back off and avoid
 *   spamming login/resend (limits are project-wide across local + deployed apps).
 * - Other failures: surfaced as `error` in the returned `{ accountId, error }` payload for UI messaging.
 *
 * Success vs inbox:
 * - If this returns `{ accountId, error: null }`, this app did its job; if the inbox is still empty, check spam
 *   and Appwrite/project email settings—not the React layer.
 */
export const sendEmailOTP = async ({ email }: { email: string }) => {
  const { account } = await createAdminClient();
  const emailAddress = normalizeEmail(email);

  try {
    const session = await account.createEmailToken(ID.unique(), emailAddress);

    return parseStringify({ accountId: session.userId, error: null }) as OTPResult;
  } catch (error) {
    console.log(error, "Failed to send email OTP");
    return parseStringify({
      accountId: null,
      error: getErrorMessage(error),
    }) as OTPResult;
  }
};

/**
 * Starts create-account OTP only. Does **not** create a Users collection document until `verifySecret` succeeds
 * with `mode: "create-account"` (so skipping the OTP step does not leave a “registered” app user who can log in).
 */
export const createAccount = async ({
  fullName,
  email,
}: {
  fullName: string;
  email: string;
}) => {
  const emailAddress = normalizeEmail(email);
  const existingUser = await getUserByEmail(emailAddress);

  if (existingUser) {
    return parseStringify({
      accountId: null,
      error:
        "An account with this email already exists. Log in instead.",
    }) as OTPResult;
  }

  const trimmedName = fullName.trim();
  if (trimmedName.length < 2) {
    return parseStringify({
      accountId: null,
      error: "Please enter your full name (at least 2 characters).",
    }) as OTPResult;
  }

  const otp = await sendEmailOTP({ email: emailAddress });
  if (!otp?.accountId) {
    return parseStringify({
      accountId: null,
      error: otp?.error || "Failed to send OTP",
    }) as OTPResult;
  }

  return parseStringify({ accountId: otp.accountId, error: null }) as OTPResult;
};

/**
 * Completes OTP verification by exchanging the one-time secret for an Appwrite session,
 * then persisting session state as **HTTP-only cookies**.
 *
 * Why cookies:
 * - **HTTP-only** prevents JavaScript access (XSS mitigation).
 * - Enables Server Actions to authenticate against Appwrite without client token plumbing.
 *
 * Cookie flags:
 * - **`secure`**: `true` when `NODE_ENV === "production"` (HTTPS only, e.g. Vercel); `false` in development
 *   so `http://localhost` can set cookies during local testing.
 * - **`sameSite: "lax"`**: normal cross-site navigation behavior; matches common Next.js auth patterns.
 *
 * Create account:
 * - When `mode === "create-account"`, after a valid session is created we create the Users collection document
 *   using **email from Appwrite Auth** (`users.get`) plus `fullName` from the client (only used after OTP proof).
 */
export const verifySecret = async ({
  accountId,
  password,
  mode = "login",
  fullName,
}: {
  accountId: string;
  password: string;
  mode?: "login" | "create-account";
  fullName?: string;
}) => {
  try {
    if (mode === "create-account") {
      const trimmedName = fullName?.trim() ?? "";
      if (trimmedName.length < 2) {
        return null;
      }
    }

    const { account, databases, users } = await createAdminClient();
    const session = await account.createSession(accountId, password);
    const cookieStore = await cookies();
    const isProduction = process.env.NODE_ENV === "production";
    const sessionCookieOptions = {
      path: "/" as const,
      httpOnly: true,
      sameSite: "lax" as const,
      secure: isProduction,
    };

    if (session.secret) {
      cookieStore.set("appwrite-session", session.secret, sessionCookieOptions);
    }

    // Stable auth cookie for server-side user lookup.
    cookieStore.set("appwrite-account-id", accountId, sessionCookieOptions);

    if (mode === "create-account") {
      const trimmedName = fullName!.trim();

      const authUser = await users.get(accountId);
      const emailFromAuth = authUser.email
        ? normalizeEmail(authUser.email)
        : null;
      if (!emailFromAuth) {
        console.log("Could not read email from Auth user");
        return null;
      }

      const existingByAccount = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.usersCollectionId,
        [Query.equal("accountId", [accountId])]
      );

      if (existingByAccount.total === 0) {
        const existingByEmail = await getUserByEmail(emailFromAuth);
        if (existingByEmail) {
          return parseStringify({ sessionId: session.$id });
        }

        await databases.createDocument(
          appwriteConfig.databaseId,
          appwriteConfig.usersCollectionId,
          ID.unique(),
          {
            fullName: trimmedName,
            email: emailFromAuth,
            avatar: avatarPlaceholderUrl,
            accountId,
          }
        );
      }
    }

    return parseStringify({ sessionId: session.$id });
  } catch (error) {
    console.log("Failed to verify OTP", error);
    return null;
  }
};

/**
 * Resolves the current CloudArchive user document.
 *
 * Why this is DB-backed instead of reading directly from Appwrite Account:
 * - The app's authorization rules (ownership, sharing via email arrays, etc.) are modeled
 *   around the CloudArchive user document ID, which is referenced by file documents.
 */
export const getCurrentUser = async () => {
  const accountId = (await cookies()).get("appwrite-account-id")?.value;
  if (!accountId) return null;

  const { databases } = await createAdminClient();

  const user = await databases.listDocuments(
    appwriteConfig.databaseId,
    appwriteConfig.usersCollectionId,
    [Query.equal("accountId", [accountId])]
  );

  if (user.total <= 0) return null;
  return parseStringify(user.documents[0]);
};

/**
 * Signs out by deleting the Appwrite session (best effort) and clearing auth cookies.
 *
 * We clear cookies in `finally` to ensure logout succeeds even if the session is already expired,
 * which avoids trapping users in a broken auth state.
 */
export const signOutUser = async () => {
  try {
    const { account } = await createSessionClient();
    await account.deleteSession("current");
  } catch (error) {
    // If the session cookie is missing/expired, Appwrite will throw.
    // We still want to clear auth cookies and redirect.
    console.log("Failed to sign out user", error);
  } finally {
    const cookieStore = await cookies();
    cookieStore.delete("appwrite-session");
    cookieStore.delete("appwrite-account-id");
    redirect("/login");
  }
};

/**
 * Initiates login (OTP) for existing users in the Users collection.
 *
 * Only users present in the CloudArchive users collection are allowed to request OTP here.
 * Returns `{ accountId, error }` so `AuthForm` can show OTP send failures (e.g. rate limits) or
 * a structured not-found response.
 */
export const signInUser = async ({ email }: { email: string }) => {
  try {
    const emailAddress = normalizeEmail(email);
    const existingUser = await getUserByEmail(emailAddress);

    if (existingUser) {
      const otp = await sendEmailOTP({ email: emailAddress });
      return parseStringify({
        accountId: otp?.accountId ?? null,
        error: otp?.error ?? null,
      }) as OTPResult;
    }

    return parseStringify({
      accountId: null,
      error: "User not found",
    }) as OTPResult;
  } catch (error) {
    handleError(error, "Failed to sign in user");
  }
};

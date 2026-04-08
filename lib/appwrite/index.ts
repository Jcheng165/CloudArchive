"use server";

import { cookies } from "next/headers";
import { Account, Avatars, Client, Databases, Storage, Users } from "node-appwrite";

import { appwriteConfig } from "@/lib/appwrite/config";

/**
 * Creates an Appwrite client bound to the **current user's session**.
 *
 * Why CloudArchive uses a session-bound client:
 * - **Least privilege**: user-scoped reads/writes should execute with the user's session,
 *   not with an admin key, to avoid accidental privilege escalation.
 * - **Defense-in-depth**: even if an action forgets an ownership check, Appwrite permissions
 *   still provide an additional guardrail when operating as the user.
 *
 * Implementation detail:
 * - Session state is stored in an **HTTP-only cookie** (`appwrite-session`) so it is not
 *   accessible to JavaScript in the browser (mitigates XSS token theft).
 */
export const createSessionClient = async () => {
  const client = new Client()
    .setEndpoint(appwriteConfig.endpointUrl)
    .setProject(appwriteConfig.projectId);

  const session = (await cookies()).get("appwrite-session");

  if (!session?.value) {
    throw new Error("No session found");
  }
  client.setSession(session.value);

  return {
    get account() {
      return new Account(client);
    },
    get databases() {
      return new Databases(client);
    },
  };
};

/**
 * Creates an Appwrite client bound to a **server-side API key**.
 *
 * Why CloudArchive needs an admin client:
 * - **Administrative capabilities**: creating storage objects, resolving relationships,
 *   and running cross-user queries often requires elevated privileges.
 * - **Server Actions boundary**: Node-Appwrite + API key runs exclusively on the server,
 *   keeping credentials out of the browser while allowing complex workflows (e.g., upload,
 *   share, trash/restore, hard delete) to remain one round-trip from the UI.
 *
 * Security posture:
 * - This client must only be constructed in `"use server"` modules.
 * - Authorization is enforced by CloudArchive actions (ownership + share checks) even when
 *   using an admin key, so access control is explicit and auditable.
 */
export const createAdminClient = async () => {
  const client = new Client()
    .setEndpoint(appwriteConfig.endpointUrl)
    .setProject(appwriteConfig.projectId)
    .setKey(appwriteConfig.secretKey);

  return {
    get account() {
      return new Account(client);
    },
    get databases() {
      return new Databases(client);
    },
    get storage() {
      return new Storage(client);
    },
    get avatars() {
      return new Avatars(client);
    },
    get users() {
      return new Users(client);
    },
  };
};

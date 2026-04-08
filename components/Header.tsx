import { signOutUser } from "@/lib/actions/user.actions";
import Image from "next/image";
import FileUploader from "./FileUploader";
import Search from "./Search";
import { Button } from "./ui/button";

interface Props {
  userId: string;
  accountId: string;
}

/**
 * Top header for the authenticated app shell.
 *
 * Architecture:
 * - Search is client-driven (debounced, quick results), but data access remains server-authorized.
 * - Upload is client UX + server mutation (Server Actions) to protect Appwrite credentials.
 *
 * Security:
 * - Logout uses a server action via a `<form action>` so cookie clearing + session invalidation
 *   happens on the server (HTTP-only cookies).
 */
const Header = ({ userId: ownerId, accountId }: Props) => {
  return (
    <header className="header">
      <Search/>
      <div className="header-wrapper">
        <FileUploader ownerId={ownerId} accountId={accountId} />
        <form action={async()=>{
          'use server';

          await signOutUser();
        }}>
          <Button
            type="submit"
            className="sign-out-button"
            aria-label="Log out"
            title="Log out"
          >
            <Image
              src="/assets/icons/logout.svg"
              alt="Log out"
              width={24}
              height={24}
              className="w-6"
            />
          </Button>
        </form>
      </div>
    </header>
  );
};

export default Header;

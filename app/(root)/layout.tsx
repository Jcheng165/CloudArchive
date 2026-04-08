import Header from "@/components/Header";
import MobileNavigation from "@/components/MobileNavigation";
import Sidebar from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { redirect } from "next/navigation";
import React from "react";
import { Toaster } from "@/components/ui/sonner"

/**
 * Authenticated application shell (server layout).
 *
 * Why server-side gating:
 * - We resolve the current user from HTTP-only cookies via Server Actions.
 * - Unauthorized requests are redirected before rendering any sensitive UI.
 *
 * Composition:
 * - **Sidebar** (`sm:flex`): narrow rail from `sm` up; widens at `lg`/`xl` (see `globals.css` `.sidebar`).
 * - **MobileNavigation** (`.mobile-header`, `sm:hidden`): top bar only **below** the `sm` breakpoint; from `sm` up the sidebar replaces it.
 * - **Header**: search, upload, sign-out (always in the main column).
 * - **Toaster**: shell-level notifications (Sonner).
 */
const Layout = async ({ children }: { children: React.ReactNode }) => {
  const currentUser = await getCurrentUser();
  if (!currentUser) return redirect("/login");

  return (
    <main className="flex h-screen">
      <Sidebar {...currentUser} />
      <section className="flex h-full flex-1 flex-col">
        <MobileNavigation {...currentUser} />
        <Header userId={currentUser.$id} accountId={currentUser.accountId} />
        <div className="main-content">{children}</div>
      </section>

      <Toaster />
    </main>
  );
};
export default Layout;

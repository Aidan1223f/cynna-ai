import { SiteHeader } from "../site-chrome";
import { InvitationPortal } from "./invitation-portal";

export const metadata = {
  title: "Get started — love-send",
  description: "Set up your shared memory in under a minute.",
};

export default function GetStartedPage() {
  return (
    <>
      <SiteHeader />
      <main className="bg-page-grain flex flex-1 items-start justify-center px-5 pt-6 pb-20 sm:items-center sm:pt-10">
        <InvitationPortal />
      </main>
    </>
  );
}

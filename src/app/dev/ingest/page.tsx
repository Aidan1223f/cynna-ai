import { notFound } from "next/navigation";
import { IngestPlayground } from "./playground";

export const dynamic = "force-dynamic";

export default function DevIngestPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <IngestPlayground />;
}

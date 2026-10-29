import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <main className="content-page" aria-label="Loading planning records">
      <Skeleton className="h-14 w-72 mb-8" />
      <Skeleton className="h-28 w-full mb-8" />
      <Skeleton className="h-96 w-full" />
    </main>
  );
}

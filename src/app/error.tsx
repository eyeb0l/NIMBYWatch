"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="content-page">
      <h1>Records could not be loaded.</h1>
      <p>
        The database may be unavailable. Try again, or check the database
        configuration and migrations.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}

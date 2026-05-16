"use client";

import { useEffect } from "react";
import { PageError } from "@/components/shared/page-error";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <PageError onReset={reset} />;
}

"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { PageError } from "@/components/shared/page-error";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return <PageError onReset={reset} />;
}

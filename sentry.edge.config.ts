import * as Sentry from "@sentry/nextjs";
import { opcionesSentry } from "@/lib/sentry/opciones";

Sentry.init(opcionesSentry(process.env.SENTRY_DSN));

import Layout from "@/components/layout";
import { FlaskConical } from "lucide-react";

/**
 * Greenfield ECR Pre-Pilot Design application shell.
 *
 * This page is intentionally independent from the existing
 * Liquid-Liquid Extraction module. Engineering calculations, persistence,
 * and the simulator workflow will be added as separate greenfield work.
 */
export default function EcrPrePilotDesignPage() {
  return (
    <Layout>
      <main className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 py-10">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-blue-50 p-3">
            <FlaskConical className="h-7 w-7 text-blue-600" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              ECR Pre-Pilot Design
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Greenfield ECR pre-pilot digital simulator and optimizer
            </p>
          </div>
        </div>

        <section className="mt-8 rounded-xl border border-blue-100 bg-blue-50/50 p-6">
          <h2 className="text-base font-semibold text-gray-900">
            Calculation foundation
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            This new application will be built independently around the
            approved calculation dependency map, beginning with process/feed
            characterization and NMP/RRBO LLE thermodynamics.
          </p>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-blue-700">
            Greenfield application · Calculation map first
          </p>
        </section>
      </main>
    </Layout>
  );
}
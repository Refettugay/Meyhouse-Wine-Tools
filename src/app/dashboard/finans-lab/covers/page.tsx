import {
  getLocationsForCovers,
  listCoverSnapshots,
} from "@/lib/actions/covers-upload";
import { CoversUploadUi } from "@/components/pricing-hub/covers-upload";

export default async function CoversPage() {
  const [locations, snapshots] = await Promise.all([
    getLocationsForCovers(),
    listCoverSnapshots(),
  ]);

  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[var(--brand-brown)]">
          Covers (OpenTable)
        </h2>
        <p className="text-sm text-[var(--ink-muted)] mt-0.5">
          Upload OpenTable Reservations exports to track guest counts (covers)
          per day and service. Combined with Sales Data, this powers
          spend-per-cover and prime-cost metrics.
        </p>
      </div>

      <CoversUploadUi locations={locations} snapshots={snapshots} />
    </div>
  );
}

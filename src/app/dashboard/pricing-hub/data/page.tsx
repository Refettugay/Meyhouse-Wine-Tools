import {
  getLocationsForUpload,
  listSnapshots,
} from "@/lib/actions/sales-upload";
import { SalesUploadUi } from "@/components/pricing-hub/sales-upload";

export default async function SalesDataPage() {
  const [locations, snapshots] = await Promise.all([
    getLocationsForUpload(),
    listSnapshots(),
  ]);

  return (
    <div className="max-w-6xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-stone-900">Sales Data</h2>
        <p className="text-sm text-stone-500 mt-0.5">
          Upload Toast Product Mix (PMIX) CSV exports to unlock velocity
          tracking, dormant alerts, and annual insights. Once the Toast API is
          connected, this will be automatic.
        </p>
      </div>

      <SalesUploadUi locations={locations} snapshots={snapshots} />
    </div>
  );
}

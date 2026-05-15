import { redirect } from "next/navigation";

export default async function CountRedirect({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = await params;
  redirect(`/dashboard/inventory/${locationId}/order`);
}

import { DashboardShell } from "@/components/DashboardShell";
import { loadDashboardPayload } from "@/lib/dashboardData";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await loadDashboardPayload();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardShell data={data} />
    </div>
  );
}

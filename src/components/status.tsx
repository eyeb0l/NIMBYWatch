import { statusColors, statusLabels } from "@/lib/presentation";
import type { PlanningStatus } from "@/lib/types";
export function Status({ status }: { status: PlanningStatus }) {
  return (
    <span className="status" style={{ color: statusColors[status] }}>
      <span style={{ background: statusColors[status] }} />
      {statusLabels[status]}
    </span>
  );
}

export type CronSummary = { id: string; name: string; status: string };
export type CronAction = { op: "run" | "pause" | "resume"; label: string };

export function cronActionFor(job: CronSummary): CronAction[] {
  if (job.status === "active") return [{ op: "run", label: "Run now" }, { op: "pause", label: "Pause" }];
  if (job.status === "paused") return [{ op: "run", label: "Run now" }, { op: "resume", label: "Resume" }];
  return [];
}

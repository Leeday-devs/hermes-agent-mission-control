export type PublicCron = {
  id: string;
  status: string;
  name: string;
  schedule: string;
  nextRun: string | null;
  lastRun: string | null;
  lastResult: string | null;
  deliver: string | null;
};

export function safeCronResponse(job: PublicCron): PublicCron {
  return {
    id: job.id,
    status: job.status,
    name: job.name,
    schedule: job.schedule,
    nextRun: job.nextRun,
    lastRun: job.lastRun,
    lastResult: job.lastResult,
    deliver: job.deliver,
  };
}

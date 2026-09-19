export function roomStatusLabel(sending: boolean, latestStatus: string | undefined, availability: string | null): string {
  if (sending || latestStatus === "running") return "Busy: a request is running.";
  return availability || "Unknown: availability not yet loaded.";
}

export function buildBriefingMission(section: string, item: string) {
  return {
    kind: "oneshot" as const,
    title: item,
    prompt: `From the Chief-of-Staff briefing section "${section}": ${item}\n\nInvestigate this item and execute the appropriate work. Clarify only genuinely necessary choices before proceeding.`,
  };
}

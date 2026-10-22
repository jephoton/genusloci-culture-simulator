type Row = Record<string, unknown>;
const object = (value: unknown): Row => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(object) : [];
const value = (v: unknown) => typeof v === "string" || typeof v === "number" ? String(v) : "unknown";
const sceneLine = (r: Row) => `- ${value(r.name)}: ${value(r.size)} residents${rows(r.tastes).length ? `; tastes include ${rows(r.tastes).slice(0, 3).map((t) => value(t.name)).join(", ")}` : ""}.`;

/** Deterministic presentation of recorded tool evidence, with no inferred causes. */
export function formatEvidence(result: unknown): string {
  const r = object(result);
  if (r.comparisonReady) return "Case prepared. Say ‘apply that’ to play the highlighted change in the live city. The outcome summary appears when playback finishes. You can rewind from Change history.";
  if (Array.isArray(r.actionsApplied)) {
    const effect = (row: Row) => `- ${value(row.venue)}: ${value(row.withoutChange)} → ${value(row.withChange)} modeled visits; change ${value(row.change)}; ${value(row.verdict)}.`;
    const gains = rows(r.biggestGainers).slice(0, 3);
    const losses = rows(r.biggestLosers).slice(0, 3);
    return [
      `${value(r.runs)} paired simulation runs. The live city is unchanged.`,
      `Requested changes: ${r.actionsApplied.map(value).join(", ")}.`,
      "Visits below are totals over the comparison, not unique people or ticket sales.",
      ...(gains.length ? ["Largest visit gains:", ...gains.map(effect)] : []),
      ...(losses.length ? ["Largest visit losses:", ...losses.map(effect)] : []),
      ...rows(r.scenes).slice(0, 4).map((s) => `- ${value(s.name)}: ${value(s.withoutChange)} → ${value(s.withChange)} residents; ${value(s.verdict)}.`),
      "Consistency across model runs is not real-world forecast accuracy. Say ‘apply that’ only if you want this change in the live model.",
    ].join("\n");
  }
  if (Array.isArray(r.applied)) return `Live model: ${r.applied.map(value).join(", ")}. This is a simulation change, not an action affecting a real business.`;
  if (Array.isArray(r.results)) return rows(r.results).length ? rows(r.results).map((v) => `- ${value(v.name)}${typeof v.open === "boolean" ? v.open ? " (open in model)" : " (closed in model)" : ""}${v.area ? ` · ${value(v.area)}` : ""}.`).join("\n") : "No matching venue was found. Try another name.";
  if (Array.isArray(r.venues)) return `Ranking: ${value(r.sort)}.\n` + (rows(r.venues).map((v) => `- ${value(v.name)} · ${value(v.area)}: ${value(v.weeklyVisits)} visits in the recent activity cycle; model health ${typeof v.health === "number" ? `${Math.round(v.health * 100)}%` : "unknown"}.`).join("\n") || "No open venues match those filters.");
  if (typeof r.venue === "number") return [
    `${value(r.name)} · ${value(r.kind)} · ${value(r.area)}. ${r.open ? "Open" : "Closed"} in the model.`,
    `${value(r.visitorsTonight)} visits this step; ${value(r.weeklyVisits)} visits in the recent activity cycle.`,
    ...(typeof r.recentVisitors === "number" ? [`${r.recentVisitors} distinct recent visitors recorded. Their highlights follow recorded outings, not all members of a taste scene.`] : []),
    `Recorded venue tastes: ${Array.isArray(r.tastes) ? r.tastes.map(value).join(", ") || "unavailable" : "unavailable"}.`,
    "Model visit targets are not real room capacities. Ask ‘what if this venue closes?’ to compare futures.",
  ].join("\n");
  if (typeof r.city === "string") return [
    `${r.city}: ${value(r.residents)} simulated residents. Current live state.`,
    ...rows(r.scenes).slice(0, 6).map(sceneLine),
    ...(rows(r.scenes).length ? [] : ["No scenes have formed yet. Say ‘play’, then ‘pause’ after the model has run."]),
  ].join("\n");
  if (Array.isArray(r.scenes)) return rows(r.scenes).map(sceneLine).join("\n") || "No scenes have formed yet. Say ‘play’ to let the model develop.";
  if (typeof r.scene === "number") return sceneLine(r);
  return "The tool returned evidence that this local formatter cannot yet display. No explanatory conclusion has been invented.";
}

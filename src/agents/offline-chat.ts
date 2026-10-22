import { applyLastComparison, clearComparison, runCityTool, type ToolDeps } from "@/agents/run-tool";
import { isComparisonQuestion } from "@/agents/lab-routing";
import { CopilotActionSchema, type CopilotAction, type ClientToolName } from "@/agents/tools";
import { VENUE_KINDS } from "@/world/schema";
import { formatEvidence } from "@/agents/format-evidence";

export type OfflineChatContext = { lastAction?: CopilotAction; lastVenue?: number };
export type OfflineChatResult = { text: string; context: OfflineChatContext; supported: boolean };

const HELP = "Offline city chat supports: summary; scenes; find venue <name>; tell me about <venue>; busiest venues; struggling venues; what if <venue> closes; what if we open a cafe in <area>; raise rent by 20% in <area>. Cases use bounded observation windows. Explicit commands such as close <venue> change the live city. After preparing a case, apply that plays the change; outcomes appear after playback. Use finish case or resume to leave the focused view, and Change history to rewind. Outside artist events require Qloo and are not supported offline.";
// Explanations grounded in sim/steps/exposure, drift, decay and sim/calibration.
const LESSONS: [RegExp, string][] = [
  [/^(?:what is this (?:lab|app)|what is genus ?loci|explain (?:this |the )?lab)$/, "This is a city culture simulation lab. Residents have changing taste profiles, visit venues and form scenes. Try one intervention and compare a simulated future with an unchanged baseline. The results describe this model, not a forecast of real people. Try: What if the busiest club closes?"],
  [/^(?:how do (?:tastes|residents'? tastes) (?:change|evolve)|how does taste (?:change|evolve)|explain taste evolution)$/, "Residents choose outings, reinforce tastes shared with the venue, and can adopt a venue or another attendee's strongest taste. Adoption depends on taste affinity and friends' tastes. Random drift and decay also change taste weights. Similar residents are grouped into scenes over time. Closing a venue changes opportunities for exposure; compare it before drawing a conclusion about the effect."],
  [/^(?:what is qloo|what does qloo do)$/, "Qloo supplies cultural affinity data used to build the world's taste graph and geographic heatmaps. The local simulation uses those inputs to model residents and venues; chat and simulation can run without an LLM. Outside artists need a live Qloo lookup, which offline chat does not perform."],
  [/^(?:what (?:does fidelity mean|is fidelity)|explain fidelity)$/, "Fidelity measures how closely the simulation's geographic taste pattern matches its source heatmaps. For each heatmap it computes a Spearman rank correlation across populated cells, then averages those correlations. Values range from -1 to 1; a higher value means stronger agreement in the ordering of cells. It is not a probability or a measure of predictive accuracy."],
];
const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
type Row = { name: string; venue?: number; kind?: string };
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const errorOf = (value: unknown) => typeof object(value)?.error === "string" ? object(value)!.error as string : undefined;

/** A deliberately bounded grammar. Every ID and area comes from the current city tools.
 * Unrecognised language never reaches apply; this does not claim general language understanding. */
export async function runOfflineChat(text: string, deps: ToolDeps, context: OfflineChatContext = {}): Promise<OfflineChatResult> {
  const previous = { ...context };
  if (isComparisonQuestion(text)) { clearComparison(deps); previous.lastAction = undefined; }
  const reply = (message: string, supported = true, next = previous): OfflineChatResult => ({ text: message, supported, context: next });
  const refuse = () => reply("I couldn't safely interpret that offline. Use one command at a time, or type help for examples. No change was made.", false);
  const call = (name: ClientToolName, input: unknown = {}) => runCityTool(name, input, deps);
  const show = (heading: string, result: unknown, next = previous) => {
    const error = errorOf(result);
    return error ? reply(`City tool could not complete this: ${error}`, true) : reply(`${heading}\n${formatEvidence(result)}`, true, next);
  };
  try {
    const raw = text.trim();
    if (!raw || raw.length > 500 || /[;\n\r"“”`]/.test(raw) || /^'.*'$/.test(raw) || /\b(?:and|then|also|but|or|don't|dont|do not|never|not|unless|except)\b/i.test(raw)) return refuse();
    const question = /\?[?.!]*$/.test(raw);
    let command = raw.replace(/[?.!]+$/, "").replace(/^please\s+/i, "").trim();
    const lower = normalize(command);
    if (/^(?:help|what can (?:you|i) do|how does this work)$/.test(lower)) return reply(HELP);
    const lesson = LESSONS.find(([pattern]) => pattern.test(lower));
    if (lesson) return reply(lesson[1]);
    if (/^(?:summary|city summary|show (?:me )?(?:the )?city|how is (?:the )?city(?: doing)?)$/.test(lower)) return show("Current city", await call("city_summary"));
    if (/^(?:scenes|list scenes|show (?:me )?(?:the )?scenes|what scenes (?:are here|exist))$/.test(lower)) {
      const summary = await call("city_summary");
      return show("Current scenes", errorOf(summary) ? summary : { scenes: object(summary)?.scenes });
    }
    if (/^(?:apply that|apply that live|make that change|make that change live|change live)$/.test(lower) && !question) {
      if (deps.comparison) return show("Live change result", await applyLastComparison(deps), { ...previous, lastAction: undefined });
      if (!previous.lastAction) return reply("There is no previous comparison to apply. Describe one change first.");
      const parsed = CopilotActionSchema.safeParse(previous.lastAction);
      if (!parsed.success) return refuse();
      return show("Live change result", await call("apply", { actions: [parsed.data] }), { ...previous, lastAction: undefined });
    }
    if (/\b(?:artist|concert|event|headliner)\b/i.test(command)) return reply("Outside artist events require a live Qloo lookup. Offline chat cannot resolve their audience or schedule them. No change was made.", false);

    const lookup = async (query: string, kind: "venue" | "area"): Promise<Row[] | string> => {
      const found = await call("find", { query, kind });
      const error = errorOf(found);
      if (error) return error;
      const rows = object(found)?.results;
      if (!Array.isArray(rows)) return "The city returned no usable matches.";
      const candidates = rows.filter((r): r is Row => typeof object(r)?.name === "string" && object(r)?.kind === kind);
      const exact = candidates.filter((r) => normalize(r.name) === normalize(query));
      return exact.length ? exact : candidates;
    };
    const unique = async (query: string, kind: "venue" | "area"): Promise<Row | string> => {
      const rows = await lookup(query, kind);
      if (typeof rows === "string") return rows;
      if (rows.length === 1 && normalize(rows[0].name) === normalize(query)) return rows[0];
      return rows.length ? `Which ${kind} do you mean? ${rows.map((r) => r.name).join(", ")}. Use its full name.` : `No ${kind} matched ${query}. Try find venue <name> or use a known neighbourhood name.`;
    };
    const venue = async (query: string): Promise<Row | string> => {
      const ranked = query.match(/^(?:the )?(busiest|most struggling) (venue|club|bar|cafe|restaurant|gallery|music venue|shop|stadium)$/i);
      if (ranked) {
        const sort = ranked[1].toLowerCase() === "busiest" ? "busiest" : "struggling";
        const kind = ranked[2].toLowerCase().replace("music venue", "music_venue");
        const result = await call("venues", { sort, kind: kind === "venue" ? undefined : kind, limit: 2 });
        const error = errorOf(result);
        if (error) return error;
        const rows = object(result)?.venues;
        if (!Array.isArray(rows) || rows.length === 0) return `No open ${ranked[2]} was found. Give a venue name.`;
        const metric = sort === "busiest" ? "weeklyVisits" : "health";
        if (rows.length > 1 && rows[0][metric] === rows[1][metric]) return `Several venues tie as ${ranked[1]}. Give a venue name, or list ${sort} venues.`;
        return { name: rows[0].name, venue: rows[0].venue };
      }
      if (/^(?:it|that venue|this venue)$/.test(normalize(query))) {
        if (previous.lastVenue === undefined) return "Which venue do you mean? Give its name first.";
        const result = await call("venue", { venue: previous.lastVenue });
        const error = errorOf(result);
        return error ?? { name: String(object(result)?.name ?? "venue"), venue: previous.lastVenue };
      }
      return unique(query, "venue");
    };
    let match = command.match(/^(?:find|search for) (?:a |the )?(?:venue )?(.+)$/i);
    if (match) {
      const result = await call("find", { query: match[1], kind: "venue" });
      const rows = object(result)?.results;
      const next = Array.isArray(rows) && rows.length === 1 && typeof rows[0].venue === "number" ? { ...previous, lastVenue: rows[0].venue } : { ...previous, lastVenue: undefined };
      return show("Venue matches", result, next);
    }
    match = command.match(/^(?:tell me about|details (?:on|for)|venue info(?: for)?|show venue) (.+)$/i);
    if (match) {
      const found = await venue(match[1]);
      if (typeof found === "string") return reply(found, true, { ...previous, lastVenue: undefined });
      return show("Venue details", await call("venue", { venue: found.venue }), { ...previous, lastVenue: found.venue });
    }
    match = command.match(/^(?:show (?:me )?(?:the )?)?(busiest|struggling)(?: venues)?(?: in (.+))?$/i);
    if (match) {
      let area: string | undefined;
      if (match[2]) {
        const found = await unique(match[2], "area");
        if (typeof found === "string") return reply(found);
        area = found.name;
      }
      return show("Venues ranked by recorded simulation data", await call("venues", { sort: match[1].toLowerCase(), area, limit: 5 }));
    }
    match = command.match(/^(?:show |tell me about )?scene (.+)$/i);
    if (match) {
      const summary = await call("city_summary");
      if (errorOf(summary)) return show("Scenes", summary);
      const rows = object(summary)?.scenes;
      const scenes = Array.isArray(rows) ? rows.filter((row) => normalize(String(row.name)) === normalize(match![1]) || String(row.id) === match![1]) : [];
      if (scenes.length !== 1) return reply("Which scene do you mean? Type scenes to see the current names and IDs.");
      return show("Scene details", await call("scene", { scene: scenes[0].id }));
    }

    let weeks = 8;
    let specifiedWeeks = false;
    match = command.match(/ for (\d+) weeks?$/i);
    if (match) {
      weeks = Number(match[1]);
      specifiedWeeks = true;
      if (weeks < 1 || weeks > 26) return reply("Choose a comparison length from 1 to 26 weeks. No change was made.", false);
      command = command.slice(0, match.index).trim();
    }
    const hypothetical = /^(?:what if|what happens if|simulate|compare)\b/i.test(command);
    command = command.replace(/^(?:what if|what happens if|simulate|compare)\s+/i, "");
    if (hypothetical) command = command.replace(/^(?:we|i)\s+/i, "");
    // Questions and hypothetical prefixes can only compare. Live actions require an exact imperative.
    const live = !question && !hypothetical && /^(?:close |open |raise rent )/i.test(command);
    if (live && specifiedWeeks) return reply("A live venue or rent change has no automatic end date. Use what if for a comparison over a number of weeks. No change was made.", false);
    let action: CopilotAction;
    let lastVenue = previous.lastVenue;
    match = command.match(/^close (.+)$/i) ?? command.match(/^(.+?) closes$/i);
    if (match && (live || hypothetical || question)) {
      const found = await venue(match[1]);
      if (typeof found === "string") return reply(found, true, { ...previous, lastVenue: undefined });
      if (found.venue === undefined) return refuse();
      action = { do: "close_venue", venue: found.venue };
      lastVenue = found.venue;
    } else {
      match = command.match(/^open (?:a |an )?([a-z_ ]+) in (.+)$/i);
      if (match && (live || hypothetical || question)) {
        const kindName = normalize(match[1]).replace("coffee shop", "cafe").replace("music venue", "music_venue");
        const kind = VENUE_KINDS.find((k) => k === kindName);
        if (!kind) return reply(`Choose a venue kind: ${VENUE_KINDS.join(", ")}. No change was made.`, false);
        const area = await unique(match[2], "area");
        if (typeof area === "string") return reply(area);
        action = { do: "open_venue", kind, area: { name: area.name } };
      } else {
        match = command.match(/^(?:raise rent by |rent (?:rises|increases) (?:by )?)(\d+(?:\.\d+)?)% in (.+)$/i);
        if (!match || !(live || hypothetical || question)) return refuse();
        const magnitude = Number(match[1]) / 100;
        if (magnitude < 0.1 || magnitude > 2) return reply("Rent rises must be between 10% and 200%. No change was made.", false);
        const area = await unique(match[2], "area");
        if (typeof area === "string") return reply(area);
        action = { do: "rent_pressure", magnitude, area: { name: area.name } };
      }
    }
    const validated = CopilotActionSchema.safeParse(action);
    if (!validated.success) return refuse();
    const result = await call(live ? "apply" : "what_if", live ? { actions: [validated.data] } : { actions: [validated.data], weeks });
    return show(live ? "Live change result" : "Case prepared (live city unchanged)", result, { lastVenue, lastAction: live ? undefined : validated.data });
  } catch {
    return reply("Offline chat could not complete the request. Check the city is loaded and try again.", false);
  }
}

/** Read explicit recommendations, not arbitrary quoted names in an answer. */
export function recommendedPrompts(text: string): string[] {
  const matches: { index: number; text: string }[] = [];
  for (const match of text.matchAll(/\b(?:try(?: asking)?|ask(?: me)?|say|type)\s*:?\s*(?:‘([^’\n]{2,300})’|“([^”\n]{2,300})”|"([^"\n]{2,300})"|'([^'\n]{2,300})'|`([^`\n]{2,300})`|\*\*([^*\n]{2,300})\*\*)/gi)) {
    matches.push({ index: match.index, text: match.slice(1).find((value) => value !== undefined)!.trim() });
  }
  for (const match of text.matchAll(/(?:^|\n)\s*(?:[-*]\s*)?(?:(?:suggested|next) prompt|try asking)\s*:\s*([^\n]+)/gi)) {
    const prompt = match[1].trim().replace(/^(?:\*\*|[‘“"'`])|(?:\*\*|[’”"'`])$/g, "").trim();
    if (prompt.length >= 2 && prompt.length <= 300) matches.push({ index: match.index, text: prompt });
  }
  return [...new Set(matches.sort((a, b) => a.index - b.index).map((m) => m.text))];
}

/** Only accept at the end of a matching draft; never replace selected text. */
export function promptCompletion(input: string, prompts: string[], start: number | null, end: number | null): string | undefined {
  if (start !== input.length || end !== input.length) return undefined;
  return prompts.find((prompt) => prompt.toLocaleLowerCase().startsWith(input.toLocaleLowerCase()) && prompt.length > input.length);
}

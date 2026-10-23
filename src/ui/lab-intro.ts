/** The guide must distinguish cultural source data from authored resident behaviour. */
export function labIntro(qlooGrounded: boolean): string {
  const source = qlooGrounded
    ? "This world uses Qloo venue tastes, cultural affinities and heatmaps. Residents and their behaviour are simulated."
    : "This is a synthetic fallback world, not a Qloo-grounded city. Its residents and tastes are simulated.";
  return `Explore how shared places and tastes shape an artificial society. Ask the guide to inspect a venue or prepare a change, then apply it and click Play to follow its recent visitors.\n\n${source}\n\nTry ‘Show the busiest venues’ or ‘How do tastes evolve?’ Local commands remain available if AI fails. These are model experiments, not forecasts about real businesses.`;
}

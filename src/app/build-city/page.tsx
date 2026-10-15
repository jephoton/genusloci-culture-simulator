import type { Metadata } from "next";
import { BuildCityConsole } from "./BuildCityConsole";

export const metadata: Metadata = { title: "Build a city · Genus Loci", robots: { index: false, follow: false } };

/** Operator-only page for on-demand world builds; every action needs the operator token. */
export default function BuildCityPage() {
  return <BuildCityConsole />;
}

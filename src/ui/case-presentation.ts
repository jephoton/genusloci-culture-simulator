import type { CaseReport } from "@/sim/case";

/** The worker stops exactly; its final frame still needs one visual outing before the report. */
export class CasePresentation {
  private item: { report: CaseReport; until: number } | null = null;
  get pending(): boolean { return this.item !== null; }
  begin(report: CaseReport, now: number, stepMs: number): CaseReport | null {
    if ((report.reason === "limit" || report.reason === "settled") && report.observedTicks > 0) {
      this.item = { report, until: now + stepMs }; return null;
    }
    return report;
  }
  take(now: number, visualComplete = true): CaseReport | null {
    if (!this.item || now < this.item.until || !visualComplete) return null;
    return this.flush();
  }
  rescale(now: number, factor: number): void { if (this.item) this.item.until = now + Math.max(0, this.item.until - now) * factor; }
  flush(): CaseReport | null { const report = this.item?.report ?? null; this.item = null; return report; }
  cancel(): void { this.item = null; }
}

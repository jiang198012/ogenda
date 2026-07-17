import { AgendaEvent } from "../core/event";
import { Connector } from "../connectors/connector";
import { MonthlyStore, SyncSummary } from "../store/monthly-store";

export type Notify = (message: string) => void;

export class SyncService {
  constructor(
    private connectors: Connector[],
    private store: MonthlyStore,
    private notify: Notify,
  ) {}

  async syncNow(): Promise<SyncSummary> {
    const all: AgendaEvent[] = [];
    for (const c of this.connectors) {
      try {
        all.push(...(await c.fetch()));
      } catch (e) {
        this.notify(`同步失败(${c.id}): ${(e as Error).message}`);
        console.error(`[ogenda] connector ${c.id} failed`, e);
      }
    }
    const summary = await this.store.sync(all);
    this.notify(`同步完成:新增 ${summary.added}、更新 ${summary.updated}(${summary.months.join(", ") || "无"})`);
    return summary;
  }
}

import { AgendaEvent } from "../core/event";
import { Connector } from "../connectors/connector";
import { MonthlyStore, SyncSummary } from "../store/monthly-store";
import { t } from "../i18n";

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
        this.notify(t("sync.connectorFailed", { id: c.id, msg: (e as Error).message }));
        console.error(`[ogenda] connector ${c.id} failed`, e);
      }
    }
    const summary = await this.store.sync(all);
    this.notify(
      t("sync.importComplete", {
        added: summary.added,
        updated: summary.updated,
        months: summary.months.join(", ") || t("sync.none"),
      }),
    );
    return summary;
  }
}

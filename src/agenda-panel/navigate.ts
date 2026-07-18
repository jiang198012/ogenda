import { App, MarkdownView, TFile, normalizePath } from "obsidian";
import { AgendaEvent } from "../core/event";
import { eventHeading } from "../core/monthly-doc";
import { monthOf } from "../store/monthly-store";

/** Opens the monthly file containing `event` and scrolls to its heading, if found. */
export async function openEventSource(app: App, folder: string, event: AgendaEvent): Promise<void> {
  const path = normalizePath(`${folder}/${monthOf(event.start)}.md`);
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;

  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file);

  const heading = eventHeading(event);
  const cache = app.metadataCache.getFileCache(file);
  const headingCache = cache?.headings?.find((h) => h.heading === heading);
  if (!headingCache) return;

  const view = leaf.view;
  if (view instanceof MarkdownView) {
    const pos = { line: headingCache.position.start.line, ch: 0 };
    view.editor.setCursor(pos);
    view.editor.scrollIntoView({ from: pos, to: pos }, true);
  }
}

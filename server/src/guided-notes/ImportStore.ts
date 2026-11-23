import type { ImportSuccess } from '../temp-shared/entities.js';

/** blankCell (A1, e.g. "G5") -> marker found at the start of that cell ("（1）", "(2)" or ""). */
export type BlankMarkers = Readonly<Record<string, string>>;

// The most recent successful import, in server memory only (contracts/import-store.md).
// 004 reads latest(); 006 reads latest() and latestMarkers(). Neither may modify them.
export class ImportStore {
  private latestResult: ImportSuccess | null = null;
  private latestBlankMarkers: BlankMarkers | null = null;

  // Only GuidedNotesImporter.read() calls this; result and markers are replaced together.
  save(result: ImportSuccess, markers: BlankMarkers): void {
    this.latestResult = structuredClone(result);
    this.latestBlankMarkers = structuredClone(markers);
  }

  latest(): Readonly<ImportSuccess> | null {
    return this.latestResult;
  }

  latestMarkers(): BlankMarkers | null {
    return this.latestBlankMarkers;
  }
}

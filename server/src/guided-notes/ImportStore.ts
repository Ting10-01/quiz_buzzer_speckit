import type { ImportSuccess } from '@quiz-buzzer/shared/entities';

/**
 * The sub-question marker of a blank cell ("（1）", "(2)" or ""). inBlankCell is false when the marker is in
 * the cell on the left and the blank cell is the one right of it (REQ-IMP-10, #34).
 */
export interface BlankMarker {
  marker: string;
  inBlankCell: boolean;
}

/** blankCell (A1, e.g. "H5") -> its marker. */
export type BlankMarkers = Readonly<Record<string, BlankMarker>>;

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

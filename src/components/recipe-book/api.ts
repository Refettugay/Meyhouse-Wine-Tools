// What the shared Recipe Book screens need from the server. The staff page
// fills it with PIN-checked actions (a PIN is asked for every write); the admin
// copy fills it with login-checked actions (no PIN, stamped with the account).
import type { AccessOverview, EntryResult, FeedResult, HistoryFilters, HistoryResult, SaveInput, SaveResult } from "@/lib/recipe-book/types";

export type BookApi = {
  needsPin: boolean;
  reload: () => Promise<FeedResult>;
  save: (input: SaveInput, pin: string | null) => Promise<SaveResult>;
  setActive: (id: string, active: boolean, pin: string | null) => Promise<SaveResult>;
  revert: (logId: string, pin: string | null) => Promise<SaveResult>;
  history: (filters: HistoryFilters) => Promise<HistoryResult>;
  entry: (id: string) => Promise<EntryResult>;
  access: () => Promise<AccessOverview>;
};

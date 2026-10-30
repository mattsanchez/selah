import type { Answer } from "./answer";
import type { AskSources } from "./context";

// A saved answer as it is stored. Types only, so the schema can import it.
export type SavedAnswer = { answer: Answer; sources: AskSources };

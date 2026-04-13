// Stage 1 is implemented as SQL predicates inside
// `src/db/matches.ts::fetchStage1Survivors`. That keeps the filter work in
// Postgres and avoids pulling rejected rows into Node. This file re-exports
// the query helpers as the canonical Stage 1 entrypoint so pipeline code
// stays conceptually organized by stage.

export { fetchStage1Survivors } from "../db/matches.js";
export type { Stage1Row } from "../db/matches.js";

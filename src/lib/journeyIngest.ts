// The canonical vocabulary comes from the dependency-free leaf, not from
// `journeyEvents.ts`: this validator sits downstream of the sink in the import
// graph (sink → queue → server fn → here), so importing back into it would
// close a cycle and leave the predicate uninitialized for whichever module the
// bundle happens to enter first.
import { isJourneyEvent, type JourneyEvent } from "./journeyEventNames";

export type JourneyIngestInput = {
  client_id: string;
  name: string;
  at: string;
  props?: Record<string, unknown>;
};

export type JourneyIngestRow = {
  client_id: string;
  name: JourneyEvent;
  at: string;
  props: Record<string, string>;
};

export type JourneyIngestResult =
  | { ok: true; row: JourneyIngestRow }
  | { ok: false; reason: string };

export function journeyIngest(input: JourneyIngestInput): JourneyIngestResult {
  if (!isJourneyEvent(input.name)) {
    return { ok: false, reason: "unknown_name" };
  }
  if (input.client_id.trim().length === 0) {
    return { ok: false, reason: "empty_client_id" };
  }
  if (Number.isNaN(Date.parse(input.at))) {
    return { ok: false, reason: "invalid_at" };
  }

  const props: Record<string, string> = {};
  if (typeof input.props?.merchant === "string") {
    props.merchant = input.props.merchant;
  }
  if (typeof input.props?.category === "string") {
    props.category = input.props.category;
  }

  return {
    ok: true,
    row: {
      client_id: input.client_id,
      name: input.name,
      at: input.at,
      props,
    },
  };
}

import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { journeyIngest, type JourneyIngestInput, type JourneyIngestRow } from "./journeyIngest";

type JourneyEventInput = Omit<JourneyIngestInput, "client_id">;

export type JourneyEventsInput = {
  client_id: string;
  events: JourneyEventInput[];
};

type JourneyInsertResult = {
  error: unknown | null;
};

type JourneyInsertClient = {
  from(table: "journey_events"): {
    insert(rows: JourneyIngestRow[]): PromiseLike<JourneyInsertResult>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateJourneyEventsInput(input: unknown): JourneyEventsInput {
  if (
    !isRecord(input) ||
    typeof input.client_id !== "string" ||
    input.client_id.trim().length === 0 ||
    !Array.isArray(input.events)
  ) {
    throw new Error("bad_input");
  }
  return input as JourneyEventsInput;
}

export async function ingestJourneyEventsCore(
  client: JourneyInsertClient,
  input: JourneyEventsInput,
): Promise<{ inserted: number; rejected: number }> {
  const rows: JourneyIngestRow[] = [];

  for (const event of input.events) {
    const result = journeyIngest({ client_id: input.client_id, ...event });
    if (result.ok) {
      rows.push(result.row);
    }
  }

  // Records the validator refused are accounted for, not lost in silence: a
  // retry cannot fix them, so the caller is told they will never be inserted.
  const rejected = input.events.length - rows.length;

  if (rows.length === 0) {
    return { inserted: 0, rejected };
  }

  const { error } = await client.from("journey_events").insert(rows);
  // A refused insert is a failure, never a successful flush. The durable
  // client queue keys retention off this rejection.
  if (error) throw new Error("journey_events_insert_failed");
  return { inserted: rows.length, rejected };
}

export const ingestJourneyEvents = createServerFn({ method: "POST" })
  .inputValidator(validateJourneyEventsInput)
  .handler(async ({ data }) =>
    ingestJourneyEventsCore(supabase as unknown as JourneyInsertClient, data),
  );

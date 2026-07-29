import { Link } from "@tanstack/react-router";
import type { PointsProgram } from "@/lib/types";

export function AssumptionNote({
  program,
  cppCents,
}: {
  program: PointsProgram | null | undefined;
  cppCents: number;
}) {
  if (!program || program.kind === "cashback") return null;
  const cents = cppCents.toFixed(2);
  return (
    <p className="text-xs text-muted-foreground leading-relaxed">
      Assumes {program.name} at {cents}¢ per point.{" "}
      <Link
        to="/settings"
        className="text-foreground underline underline-offset-2 hover:no-underline"
      >
        Edit assumption
      </Link>
    </p>
  );
}

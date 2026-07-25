import { Link } from "@tanstack/react-router";
import type { PointsProgram } from "@/lib/types";

export function AssumptionNote({
  program,
  cpp,
}: {
  program: PointsProgram | null | undefined;
  cpp: number;
}) {
  if (!program || program.kind === "cashback") return null;
  const cents = (cpp * 100).toFixed(2);
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

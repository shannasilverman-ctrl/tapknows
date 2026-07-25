import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/pay")({
  component: () => <Navigate to="/plan" replace />,
});

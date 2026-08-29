import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/pages/HomePage";
import { redirectUserWithRole } from "@/lib/router-guards";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => redirectUserWithRole(context.auth),
  component: HomePage,
});

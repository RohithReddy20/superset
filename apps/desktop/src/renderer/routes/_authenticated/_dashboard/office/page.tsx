import { createFileRoute } from "@tanstack/react-router";
import { Redirect } from "renderer/components/Redirect";

export const Route = createFileRoute("/_authenticated/_dashboard/office/")({
	component: () => <Redirect to="/office/city" />,
});

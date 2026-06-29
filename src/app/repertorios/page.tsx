import React from "react";
import { getSetlists } from "@/app/actions";
import RepertoriosApp from "@/components/RepertoriosApp";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialSetlists = await getSetlists();

  return (
    <RepertoriosApp
      initialSetlists={initialSetlists}
    />
  );
}

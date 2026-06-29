import React from "react";
import { getSongs, getSetlists } from "@/app/actions";
import MainApp from "@/components/MainApp";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Fetch initial songs and setlists server-side for speed and SEO
  const initialSongs = await getSongs();
  const initialSetlists = await getSetlists();

  return (
    <MainApp
      initialSongs={initialSongs}
      initialSetlists={initialSetlists}
    />
  );
}

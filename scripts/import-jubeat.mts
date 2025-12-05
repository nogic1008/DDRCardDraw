import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import task from "tasuku";

import {
  downloadJacketAsync,
  requestQueue,
  reportQueueStatusLive,
  sortSongs,
  writeJsonData,
} from "./utils.mts";
import { tryGetMetaFromRemy } from "./scraping/remy.mts";
import type { GameData, Song } from "../src/models/SongData.ts";
import { SongImporter } from "./scraping/eagate-jubeat.mts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fileName = "jubeat-beyondave.json";

const licensedSongUrl =
  "https://p.eagate.573.jp/game/jubeat/beyond/music/index.html";
const originalSongUrl =
  "https://p.eagate.573.jp/game/jubeat/beyond/music/original.html";

await task(
  "Import jubeat song data",
  async ({ setError, setOutput, setStatus, task }) => {
    const cleanup = reportQueueStatusLive(task);
    try {
      const targetFile = path.resolve(
        path.join(__dirname, `../src/songs/${fileName}`),
      );

      const existingData: GameData = JSON.parse(
        await readFile(targetFile, { encoding: "utf-8" }),
      );

      await task.group((task) => [
        task("Licensed songs", async ({ setStatus, setTitle, task }) => {
          // Fetch licensed songs
          setStatus("Fetching licensed songs from e-amusement GATE...");
          const importer = new SongImporter(licensedSongUrl, task);
          const fetchedSongs = await importer.fetchSongs();

          // Process licensed songs
          setStatus("Processing all licensed songs...");
          for (const fetchedSong of fetchedSongs as ((typeof fetchedSongs)[number] &
            Partial<Song>)[]) {
            const existingSong = existingData.songs.find((s) =>
              importer.songEquals(s, fetchedSong),
            );

            if (existingSong) {
              await tryGetMetaFromRemy(existingSong, "Jubeat");
              await importer.merge(existingSong, fetchedSong);
              continue;
            }
            await task(
              `${fetchedSong.name} / ${fetchedSong.artist ?? "(No Artist)"}`,
              async ({ setStatus }) => {
                setStatus("Fetch metadata from remywiki...");
                await tryGetMetaFromRemy(fetchedSong, "Jubeat");

                setStatus("Downloading jacket...");
                const jacket = fetchedSong.jacketUrl
                  ? await downloadJacketAsync(
                      fetchedSong.jacketUrl,
                      `jubeat/beyond_the_ave/${fetchedSong.saHash}`,
                    )
                  : "";

                existingData.songs.push({
                  name: fetchedSong.name,
                  artist: fetchedSong.artist || "",
                  folder: existingData.meta.folders?.at(-1),
                  saHash: fetchedSong.saHash,
                  bpm: fetchedSong.bpm || "???",
                  charts: fetchedSong.charts,
                  remyLink: fetchedSong.remyLink,
                  jacket,
                  flags: ["licensed"],
                });
                setStatus("Added");
              },
            );
          }
          setStatus("Done");
          setTitle(
            `Licensed songs from e-amusement GATE: ${fetchedSongs.length}`,
          );
        }),
        task("Original songs", async ({ setStatus, setTitle, task }) => {
          // Fetch original songs
          setStatus("Fetching original songs from e-amusement GATE...");
          const importer = new SongImporter(originalSongUrl, task);
          const fetchedSongs = await importer.fetchSongs();

          // Process original songs
          setStatus("Processing all original songs...");
          for (const fetchedSong of fetchedSongs as ((typeof fetchedSongs)[number] &
            Partial<Song>)[]) {
            const existingSong = existingData.songs.find((s) =>
              importer.songEquals(s, fetchedSong),
            );

            if (existingSong) {
              await tryGetMetaFromRemy(existingSong, "Jubeat");
              importer.merge(existingSong, fetchedSong);
              continue;
            }
            await task(
              `${fetchedSong.name} / ${fetchedSong.artist ?? "(No Artist)"}`,
              async ({ setStatus }) => {
                setStatus("Fetch metadata from remywiki...");
                await tryGetMetaFromRemy(fetchedSong, "Jubeat");

                setStatus("Downloading jacket...");
                const jacket = fetchedSong.jacketUrl
                  ? await downloadJacketAsync(
                      fetchedSong.jacketUrl,
                      `jubeat/beyond_the_ave/${fetchedSong.saHash}`,
                    )
                  : "";

                existingData.songs.push({
                  name: fetchedSong.name,
                  artist: fetchedSong.artist || "",
                  folder: existingData.meta.folders?.at(-1),
                  saHash: fetchedSong.saHash,
                  bpm: fetchedSong.bpm || "???",
                  charts: fetchedSong.charts,
                  remyLink: fetchedSong.remyLink,
                  jacket,
                });
                setStatus("Added");
              },
            );
          }
          setStatus("Done");
          setTitle(
            `Original songs from e-amusement GATE: ${fetchedSongs.length}`,
          );
        }),
      ]);
      await requestQueue.onIdle();

      // Sort songs
      existingData.songs = sortSongs(existingData.songs, existingData.meta);
      await writeJsonData(existingData, targetFile);

      setStatus("Done");
      setOutput(
        `Updated ${fileName} (Total songs: ${existingData.songs.length})`,
      );
    } catch (e) {
      setError(e);
      process.exitCode = 1;
    } finally {
      cleanup();
    }
  },
);

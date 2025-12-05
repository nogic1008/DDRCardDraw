import type { Task } from "tasuku";

import { downloadJacketAsync, getDom } from "../utils.mts";
import type { Chart, Song } from "../../src/models/SongData.ts";

/** Name & Artist Normalization */
const normalized: Map<
  Song["saHash"],
  Partial<Pick<Song, "name" | "artist">>
> = new Map([
  ["id76012381", { name: "Show up ! - short ver -" }],
  ["id10177039", { name: "Got more raves?" }],
  ["id35802983", { name: "TRUE♥LOVE" }],
  ["id68218329", { name: "Love ♡ km" }],
  ["id75837790", { name: "Love ♡ km [ 2 ]" }],
  ["id12348190", { name: "TWINKLE♡HEART" }],
  ["id51162734", { name: "Strawberry Chu♡Chu♡" }],
  ["id69740316", { name: "Milchstraße" }],
  [
    "id39733566",
    { name: "ヤマトなでなで♡かぐや姫", artist: "ロマンチック♡Prim姫" },
  ],
]);

type EagateSong = Pick<Song, "name" | "artist" | "saHash" | "charts"> & {
  jacketUrl: string;
};

/**
 * Importer for jubeat from e-amusement GATE
 * - https://p.eagate.573.jp/game/jubeat/beyond/music/index.html
 * - https://p.eagate.573.jp/game/jubeat/beyond/music/original.html
 */
export class SongImporter {
  #songListUrl: string;
  #task: Task;

  constructor(songListUrl: string, task: Task) {
    this.#songListUrl = songListUrl;
    this.#task = task;
  }

  async fetchSongs(): Promise<EagateSong[]> {
    const result = await this.#task(
      "Fetch song list from e-amusement GATE",
      async ({ setError, setOutput, setStatus, setTitle }) => {
        setStatus(`Fetching`);

        const songsPerPage = 50;
        const allSongs: EagateSong[] = [];
        let page = 1; // 1-based page index
        let retryCount = 0;
        const maxRetryCount = 3;

        while (retryCount < maxRetryCount) {
          // Construct URL with page parameter
          const url = new URL(this.#songListUrl);
          url.searchParams.set("page", page.toString());

          try {
            setStatus(
              `Fetching Page ${page}/? (retry: ${retryCount}/${maxRetryCount})`,
            );
            const pageSongs = await scrape(url, setError);

            if (pageSongs.length === 0) {
              retryCount++;
            } else {
              retryCount = 0; // Reset counter when songs are found
              allSongs.push(...pageSongs);

              // If songs fetched is less than songsPerPage, likely the last page
              if (pageSongs.length < songsPerPage) {
                setStatus(`Done (Page ${page}/${page})`);
                break;
              }
            }
          } catch (error) {
            retryCount++;
            setError(error);
          }
          setStatus(
            `Fetched Page ${page}/? (retry: ${retryCount}/${maxRetryCount})`,
          );
          page++;
        }

        setOutput(`${page} pages processed: ${allSongs.length} songs`);
        setTitle(`Fetch song list from e-amusement GATE: ${allSongs.length}`);
        return allSongs;
      },
    );
    return result.result;
    /**
     * Scrapes song data from jubeat e-amusement GATE website
     * @param url jubeat song list URL
     */
    async function scrape(
      url: URL,
      setError: (error: unknown) => void,
    ): Promise<EagateSong[]> {
      const dom = await getDom(url.toString());

      const doc = dom.window.document;
      const list = doc.querySelectorAll(
        "#music_list .list_data_box .list_data",
      );
      if (!list || list.length === 0) {
        return [];
      }

      const songs: EagateSong[] = [];
      const origin = url.origin;

      list.forEach((item) => {
        try {
          // Jacket image
          const img = item.querySelector<HTMLImageElement>("p > img");
          let jacketUrl = img?.getAttribute("src")?.trim() || "";
          if (jacketUrl && jacketUrl.startsWith("/")) {
            jacketUrl = origin + jacketUrl;
          }
          // saHash: use jacket file name without extension
          let saHash = "";
          if (jacketUrl) {
            const withoutQuery = jacketUrl.split("?")[0];
            const parts = withoutQuery.split("/");
            const filename = parts[parts.length - 1] || "";
            saHash = filename.replace(/\.[^.]+$/, ""); // e.g. id18283302
          }

          // Title and artist
          const ul = item.querySelector("ul");
          const liNodes = ul ? ul.querySelectorAll(":scope > li") : null;
          const name = liNodes?.[0]?.textContent?.trim() || "";
          const artist = liNodes?.[1]?.textContent?.trim() || "";

          if (!name) return; // skip invalid rows

          // Levels (BASIC / ADVANCED / EXTREME)
          const levelContainer = liNodes?.[2]?.querySelector("ul");
          let levels: number[] = [];
          if (levelContainer) {
            // Extract all numeric tokens in order
            const text = levelContainer.textContent || "";
            const matches = text.match(/\d+(?:\.\d+)?/g) || [];
            levels = matches.slice(0, 3).map((v) => parseFloat(v));
          }

          const charts: EagateSong["charts"] = [];
          const diffSeq: Pick<Chart, "style" | "diffClass">[] = [
            { style: "solo", diffClass: "basic" },
            { style: "solo", diffClass: "advanced" },
            { style: "solo", diffClass: "extreme" },
          ];
          for (const [i, chart] of diffSeq.entries()) {
            const lvl = levels[i];
            if (typeof lvl === "number" && !Number.isNaN(lvl)) {
              charts.push({ ...chart, lvl });
            }
          }

          songs.push({
            name,
            artist: artist === "-" ? "" : artist,
            ...normalized.get(saHash),
            saHash,
            charts,
            jacketUrl,
          });
        } catch (e) {
          setError(e);
        }
      });

      return songs;
    }
  }

  /**
   * Compares two song objects for equality
   */
  songEquals(existingSong: Song, fetchedSong: EagateSong): boolean {
    return existingSong.saHash === fetchedSong.saHash;
  }

  /**
   * Merges data from fetchedSong into existingSong
   * @returns True if the merge resulted in any updates
   */
  async merge(existingSong: Song, fetchedSong: EagateSong): Promise<void> {
    if (
      existingSong.name === fetchedSong.name &&
      existingSong.artist === fetchedSong.artist &&
      chartsEquals(existingSong.charts, fetchedSong.charts) &&
      existingSong.jacket
    ) {
      return; // No updates needed
    }

    await this.#task(
      `${fetchedSong.name} / ${fetchedSong.artist ?? "(No Artist)"}`,
      async ({ setStatus, task }) => {
        if (existingSong.name !== fetchedSong.name) {
          await task(
            `name: ${existingSong.name} -> ${fetchedSong.name}`,
            async () => {
              existingSong.name = fetchedSong.name;
            },
          );
        }

        if (existingSong.artist !== fetchedSong.artist) {
          await task(
            `artist: ${existingSong.artist} -> ${fetchedSong.artist}`,
            async () => {
              existingSong.artist = fetchedSong.artist;
            },
          );
        }

        // Update charts
        for (const fetchedChart of fetchedSong.charts) {
          const existingChart = existingSong.charts.find(
            (chart) =>
              chart.style === fetchedChart.style &&
              chart.diffClass === fetchedChart.diffClass,
          );

          if (!existingChart) {
            await task(
              `charts: added ${fetchedChart.diffClass.toUpperCase()} (lvl: ${fetchedChart.lvl})`,
              async () => {
                existingSong.charts.push({ ...fetchedChart });
              },
            );
            continue;
          }

          // Update level if different
          if (existingChart.lvl !== fetchedChart.lvl) {
            await task(
              `charts: updated ${fetchedChart.diffClass.toUpperCase()} (lvl: ${existingChart.lvl} -> ${fetchedChart.lvl})`,
              async () => {
                existingChart.lvl = fetchedChart.lvl;
              },
            );
          }
        }

        // Try to get jacket if missing
        if (!existingSong.jacket) {
          const jacketFilename = `jubeat/${fetchedSong.saHash}`;
          await task(`jacket`, async () => {
            existingSong.jacket = await downloadJacketAsync(
              fetchedSong.jacketUrl,
              jacketFilename,
            );
          });
        }
        setStatus("Updated");
      },
    );

    function chartsEquals(left: Chart[], right: Chart[]): boolean {
      if (left.length !== right.length) return false;
      return left.every((lChart) => {
        return right.some(
          (rChart) =>
            lChart.style === rChart.style &&
            lChart.diffClass === rChart.diffClass &&
            lChart.lvl === rChart.lvl,
        );
      });
    }
  }
}

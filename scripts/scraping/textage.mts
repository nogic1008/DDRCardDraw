// @ts-check
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import iconv from "iconv-lite";

import { exists, requestQueue } from "../utils.mts";

// textage JS files (c) textage.cc - don't distribute them after downloading!

/**
 * Download files and transform to ES module functions (if undefined, don't generate .mjs file)
 */
const textageFiles: Record<string, ((jsText: string) => string) | undefined> = {
  titletbl: (jsText) =>
    jsText
      .replace(/^([A-Z0-9_]+)\s*=\s*/gm, "const $1 = ")
      .replace(/^titletbl\s*=\s*\{/gm, "export const titletbl = {"),
  actbl: (jsText) =>
    jsText
      .replace(/^([A-Za-z0-9_]+)\s*=\s*/gm, "const $1 = ")
      .replace(/^const actbl =/gm, "export const actbl =")
      .replace(/^const e_list =/gm, "export const e_list ="),
  //"cstbl",
  //"cstbl1",
  //"cstbl2",
  //"cltbl",
  //"stepup",
  datatbl: (jsText) =>
    jsText
      .replace(/^datatbl\s*=\s*\{/gm, "export const datatbl = {")
      .replace(/function\s+get_bpm\s*\(/, "export function get_bpm("),
  scrlist: undefined,
};
/** (Textage song tag) - (song title, artist, genre) mappings */
export type TitleTable = Record<
  string,
  [
    version: number,
    id: number,
    opt: number,
    genre: string,
    artist: string,
    title: string,
    subtitle?: string,
  ]
>;
/**
 * Chart flag type
 * - Bit 0 (1): Has chart data or not
 * - Bit 1 (2): Lv is 1-12 scale or not
 * - Bit 2 (4): Included AC or not
 * - Bit 3 (8): Has Hell CN/BSS or not
 */
type ChartFlag = number;
/** (Textage song tag) - (chart lvl, availability) mappings */
export type ChartLevelTable = Record<
  string,
  [
    number, // unknown
    spBoLvl: number, // SP/BEGINNER (old) Level
    spBoFlg: ChartFlag, // SP/BEGINNER (old) Flag
    spBLvl: number, // SP/BEGINNER Level
    spBFlg: ChartFlag, // SP/BEGINNER Flag
    spNLvl: number, // SP/NORMAL Level
    spNFlg: ChartFlag, // SP/NORMAL Flag
    spHLvl: number, // SP/HYPER Level
    spHFlg: ChartFlag, // SP/HYPER Flag
    spALvl: number, // SP/ANOTHER Level
    spAFlg: ChartFlag, // SP/ANOTHER Flag
    spLLvl: number, // SP/LEGGENDARIA Level
    spLFlg: ChartFlag, // SP/LEGGENDARIA Flag
    dpBLvl: number, // DP/BEGINNER Level
    dpBFlg: ChartFlag, // DP/BEGINNER Flag
    dpNLvl: number, // DP/NORMAL Level
    dpNFlg: ChartFlag, // DP/NORMAL Flag
    dpHLvl: number, // DP/HYPER Level
    dpHFlg: ChartFlag, // DP/HYPER Flag
    dpALvl: number, // DP/ANOTHER Level
    dpAFlg: ChartFlag, // DP/ANOTHER Flag
    dpLLvl: number, // DP/LEGGENDARIA Level
    dpLFlg: ChartFlag, // DP/LEGGENDARIA Flag
    meta?: string,
  ]
>;
/** (Textage song tag) - (chart notes, song bpm) mappings */
export type ChartNotesTable = Record<
  string,
  [
    spBoNotes: number, // SP/BEGINNER (old) Notes
    spBNotes: number, // SP/BEGINNER Notes
    spNNotes: number, // SP/NORMAL Notes
    spHNotes: number, // SP/HYPER Notes
    spANotes: number, // SP/ANOTHER Notes
    spLNotes: number, // SP/LEGGENDARIA Notes
    dpBNotes: number, // DP/BEGINNER Notes
    dpNNotes: number, // DP/NORMAL Notes
    dpHNotes: number, // DP/HYPER Notes
    dpANotes: number, // DP/ANOTHER Notes
    dpLNotes: number, // DP/LEGGENDARIA Notes
    bpm: string, // BPM string (e.g. "150", "100～200")
  ]
>;
export type EventList = [
  expert: [name: string, tags: [string, string, string, string]][], // EXPERT mode setlists (unused)
  [name: string, tags: string[]][], // Unknown (LEGGENDARIA?, unused)
  events: [name: string, tags: string[]][], // Event unlocks
];
/** Path to the directory where textage files are stored (git ignored) */
const textageDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "textage",
);

/**
 * Downloads the necessary textage JS files.
 * @param force Whether to force redownloading even if files exist
 * @returns True if download succeeded or files already exist, false otherwise
 */
export async function textageDL(force: boolean = false): Promise<boolean> {
  const textageScrapeReady = (
    await Promise.all(
      Object.keys(textageFiles).map((fn) => exists(`${textageDir}/${fn}.js`)),
    )
  ).every((v) => v);
  if (force || !textageScrapeReady) {
    console.log("Redownloading source JS from textage...");
    // Clear out the existing textage JS, if it exists.
    if (await exists(textageDir)) {
      await fs.rm(textageDir, { recursive: true, force: true });
    }
    // Redownload all the necessary textage JS.
    await fs.mkdir(textageDir).catch(() => {});

    for (let [name, transform] of Object.entries(textageFiles)) {
      if (await exists(`${textageDir}/${name}.js`)) {
        console.log(`Don't need to redownload ${name}`);
        continue;
      }
      console.log(`Downloading ${name}...`);

      const url = `https://textage.cc/score/${name}.js`;
      const jsText = await requestQueue.add(async () => {
        const resp = await fetch(url);
        return iconv.decode(Buffer.from(await resp.arrayBuffer()), "shift-jis");
      });
      await fs.writeFile(path.join(textageDir, `${name}.js`), jsText, {
        encoding: "utf-8",
      });

      if (transform) {
        await fs.writeFile(
          path.join(textageDir, `${name}.mjs`),
          transform(jsText),
          { encoding: "utf-8" },
        );
      }
    }

    // Double-check that we got all of the textage JS.
    return (
      await Promise.all(
        Object.keys(textageFiles).map(async (fn) => {
          if (await exists(`${textageDir}/${fn}.js`)) return true;
          console.log(
            `Failed to download ${fn}.js. Invoke like 'yarn import:iidx [rescrape]'`,
          );
          return false;
        }),
      )
    ).every((v) => v);
  } else {
    console.log("Not redownloading source JS from textage");
    return textageScrapeReady;
  }
}

/**
 * Gets the chart level for a given song and chart.
 * @param table Song data table
 * @param tag Song id
 * @param num Chart number (0=Old BEGINNER, 1=SP/BEGINNER, 2=SP/NORMAL, 3=SP/HYPER, 4=SP/ANOTHER, 5=SP/LEGGENDARIA, 6=DP/BEGINNER, 7=DP/NORMAL, 8=DP/HYPER, 9=DP/ANOTHER, 10=DP/LEGGENDARIA)
 * @returns Chart level (undefined if not found)
 */
export function getLevel(
  table: Record<string, (number | string | undefined)[]>,
  tag: string,
  num: number,
): number | undefined {
  const lv = table[tag]?.[1 + num * 2];
  const opt = table[tag]?.[2 + num * 2] as ChartFlag;
  return (opt & 6) === 6 ? (lv as number) : undefined;
}

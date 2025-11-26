/**
 * Import or update IIDX data from textage.cc.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStringPromise } from "xml2js";
import { decode as decodeHTML } from "html-entities";
import { JSDOM } from "jsdom";

import { textageDL, getLevel } from "./scraping/textage.mts";
import type {
  ChartLevelTable,
  ChartNotesTable,
  EventList,
  TitleTable,
} from "./scraping/textage.mts";
import { exists, writeJsonData } from "./utils.mts";
import type { Chart, GameData, Song } from "../src/models/SongData";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUTFILE = "src/songs/iidx.json";

/** Folder Name and Colors (index is based on textage) */
const folders: [
  string,
  { backdrop: string; accentUpper: string; accentLower: string },
][] = [
  // textage files INFINITAS exclusives as 0th style - subject to change
  [
    "INF etc.",
    { backdrop: "#000000", accentUpper: "#000000", accentLower: "#000000" },
  ],
  [
    "1st style",
    { backdrop: "#000000", accentUpper: "#666666", accentLower: "#333333" },
  ],
  [
    "2nd style",
    { backdrop: "#000000", accentUpper: "#feb900", accentLower: "#d36a00" },
  ],
  [
    "3rd style",
    { backdrop: "#000000", accentUpper: "#e4007f", accentLower: "#e4007f" },
  ],
  [
    "4th style",
    { backdrop: "#000000", accentUpper: "#e60012", accentLower: "#666666" },
  ],
  [
    "5th style",
    { backdrop: "#000000", accentUpper: "#f5a100", accentLower: "#073190" },
  ],
  [
    "6th style",
    { backdrop: "#000000", accentUpper: "#9983be", accentLower: "#a5a5a5" },
  ],
  [
    "7th style",
    { backdrop: "#000000", accentUpper: "#488db2", accentLower: "#264a5c" },
  ],
  [
    "8th style",
    { backdrop: "#000000", accentUpper: "#ef7e00", accentLower: "#e7e8e8" },
  ],
  [
    "9th style",
    { backdrop: "#000000", accentUpper: "#ffffff", accentLower: "#01eef6" },
  ],
  [
    "10th style",
    { backdrop: "#000000", accentUpper: "#ff1a00", accentLower: "#091f58" },
  ],
  [
    "IIDX RED",
    { backdrop: "#000000", accentUpper: "#ff0000", accentLower: "#7b7978" },
  ],
  [
    "HAPPY SKY",
    { backdrop: "#000000", accentUpper: "#14ace9", accentLower: "#12398b" },
  ],
  [
    "DistorteD",
    { backdrop: "#000000", accentUpper: "#cabc20", accentLower: "#666666" },
  ],
  [
    "GOLD",
    { backdrop: "#000000", accentUpper: "#d7be52", accentLower: "#9f0080" },
  ],
  [
    "DJ TROOPERS",
    { backdrop: "#000000", accentUpper: "#a3fe09", accentLower: "#476618" },
  ],
  [
    "EMPRESS",
    { backdrop: "#000000", accentUpper: "#f40052", accentLower: "#a12f4c" },
  ],
  [
    "SIRIUS",
    { backdrop: "#000000", accentUpper: "#2c4d6f", accentLower: "#0f0c2a" },
  ],
  [
    "Resort Anthem",
    { backdrop: "#000000", accentUpper: "#eb4a32", accentLower: "#a23351" },
  ],
  [
    "Lincle",
    { backdrop: "#000000", accentUpper: "#40c0f0", accentLower: "#ef7c08" },
  ],
  [
    "tricoro",
    { backdrop: "#000000", accentUpper: "#f4f04b", accentLower: "#c32137" },
  ],
  [
    "SPADA",
    { backdrop: "#000000", accentUpper: "#f61108", accentLower: "#e3751b" },
  ],
  [
    "PENDUAL",
    { backdrop: "#000000", accentUpper: "#c93c61", accentLower: "#990d87" },
  ],
  [
    "copula",
    { backdrop: "#000000", accentUpper: "#fee05a", accentLower: "#88757e" },
  ],
  [
    "SINOBUZ",
    { backdrop: "#000000", accentUpper: "#44af6a", accentLower: "#6e2039" },
  ],
  [
    "CANNON BALLERS",
    { backdrop: "#000000", accentUpper: "#dc1003", accentLower: "#05b474" },
  ],
  [
    "Rootage",
    { backdrop: "#000000", accentUpper: "#feef13", accentLower: "#8f2608" },
  ],
  [
    "HEROIC VERSE",
    { backdrop: "#000000", accentUpper: "#331ba5", accentLower: "#c03ae3" },
  ],
  [
    "BISTROVER",
    { backdrop: "#000000", accentUpper: "#86d140", accentLower: "#6098c9" },
  ],
  [
    "CastHour",
    { backdrop: "#000000", accentUpper: "#fb6701", accentLower: "#1a2162" },
  ],
  [
    "RESIDENT",
    { backdrop: "#000000", accentUpper: "#010efd", accentLower: "#cb2690" },
  ],
  [
    "EPOLIS",
    { backdrop: "#000000", accentUpper: "#f0ff00", accentLower: "#6229d1" },
  ],
  [
    "Pinky Crush",
    { backdrop: "#000000", accentUpper: "#ec2f95", accentLower: "#00f7fe" },
  ],
  [
    "Sparkle Shower",
    { backdrop: "#000000", accentUpper: "#009f4c", accentLower: "#ffee00" },
  ],
  [
    "---",
    { backdrop: "#000000", accentUpper: "#000000", accentLower: "#000000" },
  ],
  // textage files substream charts as 35th style - subject to change
  [
    "substream",
    { backdrop: "#000000", accentUpper: "#feb900", accentLower: "#d36a00" },
  ],
];
const jacketFont = "bold 28px Evogria,sans-serif";
const jacketFontStyling = `fill:white;font:${jacketFont};dominant-baseline:middle;text-anchor:middle;stroke:#000000;stroke-width:2px`;
const jacketPath = path.join(__dirname, "../src/assets/jackets/iidx");

// textage.cc doesn't indicate songs that are time-locked or shop-bought, most of the time
// (some are colored red in the list, but not all)
// TODO: bemaniwiki can give us this info, but navigating/reading it may be a bit tricky
// https://bemaniwiki.com/?beatmania+IIDX+33+Sparkle+Shower/%B1%A3%A4%B7%CD%D7%C1%C7
const timelockTags = [
  // arena unlocks from last mix
  "a_minstr",
  "advanc32",
  // arena unlocks from this mix
  // none yet!
  // one-offs (kiwami class unlocks, KAC quals, cross-game promos, etc.)
  // ...none yet??
];
// TODO: bemaniwiki can give us this info, but navigating/reading it may be a bit tricky
// https://bemaniwiki.com/?beatmania+IIDX+33+Sparkle+Shower/LEGGENDARIA%A5%D5%A5%A9%A5%EB%A5%C0
const timelockLegs = [
  // secret legs from last mix
  "smooooch",
  "script_n",
  "script_h",
  "alba",
  "bitchoco",
  "_casino",
  "lightstr",
  // secret legs from this mix
  "overtime",
  "selfishs",
  "lab",
  "plkmania",
  "_3plus3",
  // arena legs from this & last mix
  "a_minstr",
  "cuerscue",
  "high",
  "_kagachi",
  "hyena",
  "call",
  "bowshock",
  "_ope_143",
  "_therele",
  "punch_lv",
  "chaserxx",
  "braveout",
  "inazuma",
  "_seijin",
  // other sources of legs (e.g. kiwami dans)
  "nbtheory",
  "_hrenten",
  "implant",
];
// Some songs come up as part of events, but are actually available now in the default songlist.
const eventReleases = [
  // Triple Tribe seasons 1-2 unlocked now!
  "ccrimson",
  "max_360",
  "suspcion",
  // Triple Tribe season 3 still locked :(
  // "monkeybs",
  // "xb10r",
  // "ambiverm",
  // ULTIMATE MOBILE time release should be cleared out.
  "psychint",
];

/** Event name (textage based) - flags mappings */
const eventMap = new Map<string, string[]>([
  ["Sparkle Fruit Lab.", ["sparkleFruitLab"]],
  ["WORLD TOURISM(Sparkle Shower)", ["worldTourism"]],
  ["ピンキーアンダーグラウンド", ["pinkyUnderground"]],
  [
    "<span style='font-size:6pt'>BEMANI PRO LEAGUE -SEASON 5- <\/span>Triple Tribe 0",
    ["tripleTribe"],
  ],
  ["PINKY EXTRA CHALLENGE", ["pinkyExtraChallenge"]],
  ["WORLD TOURISM(Pinky Crush)", ["worldTourism"]],
  ["ピンキージャンプアップ！", ["pinkyJumpUp"]],
  [
    "<span style='font-size:6pt'>BEMANI PRO LEAGUE -SEASON 4- <\/span>Triple Tribe",
    ["tripleTribe"],
  ],
  [
    "<span style='font-size:6pt'>BEMANI PRO LEAGUE -SEASON 3- <\/span>Triple Tribe",
    ["tripleTribe"],
  ],
  ["ULTIMATE MOBILE アーケード連動", ["ultimateMobile"]],
]);

async function unwrapHTML(s: string) {
  s = s.replaceAll("<br>", "\n");
  s = s.replaceAll("&", "&amp;");
  s = s.replaceAll("ltmodel", `"ltmodel"`); // lol
  //console.log(s)
  return parseStringPromise(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><root>` +
      s +
      `</root>`,
  ).then((v: any[]) => {
    var v_inner = JSON.parse(JSON.stringify(v));
    var nested = true;
    while (nested) {
      nested = false;
      v = v[0] || v;
      for (let innerTag of ["span", "font", "div", "root", "_"]) {
        if (v_inner[innerTag]) {
          v_inner = v_inner[innerTag];
          nested = true;
        }
      }
    }
    v_inner = v_inner[0]?._ || v_inner;
    //console.log(v_inner)
    return decodeHTML(v_inner.trim());
  });
}

async function generateJacketSvg(
  folderName: (typeof folders)[number][0],
  colors: (typeof folders)[number][1],
  filePath: string,
) {
  let jacketTemplate = await fs.readFile(
    path.resolve(path.join(__dirname, "jacket_template.svg")),
    { encoding: "utf-8" },
  );

  // Fill in parameters
  const folderNameWidth = measureTextWidth(` ${folderName} `);
  const parameters = {
    folderName,
    folderNameStyling: jacketFontStyling,
    folderNameWidth: `${folderNameWidth}`,
    folderNameWidthHalf: `${folderNameWidth * 0.5}`,
    ...colors,
  };
  for (const [key, value] of Object.entries(parameters)) {
    jacketTemplate = jacketTemplate.replaceAll(`{{${key}}}`, value);
  }

  await fs.writeFile(filePath, jacketTemplate, { encoding: "utf-8" });

  function measureTextWidth(text: string) {
    var dom = new JSDOM(`<!DOCTYPE html><head><meta charset="UTF-8"></head>`);
    var document = dom.window.document;
    const canvas = document.createElement("canvas"); // Requires the npm package canvas in the dev environment
    const ctx = canvas.getContext("2d")!;
    ctx.font = jacketFont;
    const metrics = ctx.measureText(text);
    return metrics.width;
  }
}

try {
  const rescrape = !!process.argv[2];

  console.log(`Building chart info database for import using textage JS...`);

  let data: GameData = {
    meta: {
      styles: ["single", "double"],
      difficulties: [
        { key: "beginner", color: "#17ff8b" },
        { key: "normal", color: "#3c9dff" },
        { key: "hyper", color: "#ffa244" },
        { key: "another", color: "#ff3737" },
        { key: "leggendaria", color: "#980053" },
      ],
      flags: [
        "pinkyJumpUp",
        "pinkyExtraChallenge",
        "pinkyUnderground",
        "tripleTribe",
        "ultimateMobile",
        "worldTourism",
        "timelock",
      ],
      lastUpdated: 0,
    },
    defaults: {
      style: "single",
      difficulties: ["another"],
      flags: [],
      lowerLvlBound: 1,
      upperLvlBound: 12,
    },
    i18n: {
      en: {
        name: "IIDX AC (Sparkle Shower)", // TODO: automatically determine from textage?
        single: "SP",
        double: "DP",
        beginner: "BEGINNER",
        normal: "NORMAL",
        hyper: "HYPER",
        another: "ANOTHER",
        leggendaria: "LEGGENDARIA",
        sparkleFruitLab: "Sparkle Fruit Lab.",
        pinkyJumpUp: "PINKY JUMP UP!",
        pinkyExtraChallenge: "PINKY EXTRA CHALLENGE",
        pinkyUnderground: "PINKY UNDERGROUND",
        ultimateMobile: "ULTIMATE MOBILE ARCADE CONNECT",
        tripleTribe: "Triple Tribe",
        worldTourism: "WORLD TOURISM",
        timelock: "Time-locked or shop-bought",
        $abbr: {
          beginner: "[B]",
          normal: "[N]",
          hyper: "[H]",
          another: "[A]",
          leggendaria: "[L]",
        },
      },
      ja: {
        name: "IIDX AC (Sparkle Shower)", // TODO: automatically determine from textage?
        single: "SP",
        double: "DP",
        beginner: "BEGINNER",
        normal: "NORMAL",
        hyper: "HYPER",
        another: "ANOTHER",
        leggendaria: "LEGGENDARIA",
        sparkleFruitLab: "Sparkle Fruit Lab.",
        pinkyJumpUp: "ピンキージャンプアップ！",
        pinkyExtraChallenge: "PINKY EXTRA CHALLENGE",
        pinkyUnderground: "ピンキーアンダーグラウンド",
        ultimateMobile: "ULTIMATE MOBILE アーケード連動",
        tripleTribe: "Triple Tribe",
        worldTourism: "WORLD TOURISM",
        timelock: "現在解禁不可・公式サイトに購入必須",
        $abbr: {
          beginner: "[B]",
          normal: "[N]",
          hyper: "[H]",
          another: "[A]",
          leggendaria: "[L]",
        },
      },
    },
    songs: [],
  };

  const songList: Song[] = [];

  await textageDL(rescrape);
  const chartSlot = [
    undefined,
    { style: "single", diffClass: "beginner" },
    { style: "single", diffClass: "normal" },
    { style: "single", diffClass: "hyper" },
    { style: "single", diffClass: "another" },
    { style: "single", diffClass: "leggendaria" },
    { style: "double", diffClass: "beginner" },
    { style: "double", diffClass: "normal" },
    { style: "double", diffClass: "hyper" },
    { style: "double", diffClass: "another" },
    { style: "double", diffClass: "leggendaria" },
  ];

  // @ts-ignore - dynamic import
  const { titletbl } = (await import("./scraping/textage/titletbl.mjs")) as {
    titletbl: TitleTable;
  };
  // @ts-ignore - dynamic import
  const { actbl } = (await import("./scraping/textage/actbl.mjs")) as {
    actbl: ChartLevelTable;
  };
  // @ts-ignore - dynamic import
  const { e_list } = (await import("./scraping/textage/actbl.mjs")) as {
    e_list: EventList;
  };
  // @ts-ignore - dynamic import
  const { datatbl, get_bpm } = (await import(
    "./scraping/textage/datatbl.mjs"
  )) as {
    datatbl: ChartNotesTable;
    get_bpm: (tag: string, num: number) => string;
  };

  for (const [
    tag,
    [version, _1, _2, genre, artist, title, subtitle],
  ] of Object.entries(titletbl)) {
    try {
      if (!actbl[tag] || (actbl[tag][0] & 1) == 0) continue;
      const songBPM = datatbl[tag][11] || "[BPM N/A]";

      // Title and subtitle
      let nameExt = decodeHTML(await unwrapHTML(title), { scope: "strict" });
      if (subtitle) {
        nameExt +=
          " " + decodeHTML(await unwrapHTML(subtitle), { scope: "strict" });
      }

      var chartData = [];
      for (let [i, chart] of chartSlot.entries()) {
        const lvl = getLevel(actbl, tag, i);
        if (chart && lvl) {
          const chartInfo: Chart = {
            style: chart.style,
            lvl,
            diffClass: chart.diffClass,
          };
          const bpm = get_bpm(tag, i) as string;
          if (bpm != songBPM) {
            chartInfo.bpm = bpm;
          }
          if (chart.diffClass == "leggendaria" && timelockLegs.includes(tag)) {
            // Is the leg an arena unlock or secret unlock?
            console.log(
              `c[] ${tag} (${nameExt}) [${chart.diffClass}] is an arena unlock or secret unlock`,
            );
            chartInfo.flags = ["timelock"];
          }
          chartData.push(chartInfo);
        }
      }

      // Unlock category, if applicable
      var songFlags = [];
      for (let [name, tags] of e_list[2]) {
        if (tags.includes(tag) && !eventReleases.includes(tag)) {
          const eventFlags = eventMap.get(name);
          if (eventFlags) {
            console.log(
              `c[] ${tag} (${nameExt}) is locked behind the ${name} event`,
            );
            songFlags.push(...eventFlags);
          } else {
            console.log(
              `c[] ${tag} (${nameExt}) is locked behind unknown event ${name}`,
            );
          }
        }
      }
      if (timelockTags.includes(tag)) {
        console.log(
          `c[] ${tag} (${nameExt}) is time-locked or must be acquired through the shop`,
        );
        songFlags.push("timelock");
      }

      // Version of origin (or first AC inclusion)
      const folderName = folders[version || 0][0];
      const folderFile = folderName.replaceAll(" ", "-");

      const songData: Song = {
        name: nameExt,
        artist: decodeHTML(artist || "[artist N/A]", { scope: "strict" }),
        genre: decodeHTML(genre || "[genre N/A]", { scope: "strict" }),
        saHash: tag,
        flags: songFlags.length > 0 ? songFlags : undefined,
        bpm: songBPM,
        jacket: `iidx/${folderFile}.svg`,
        folder: folderName,
        charts: chartData,
      };

      songList.push(songData);
    } catch (err) {
      console.warn(`Something's up with song tag ${tag}:\n${err}`);
    }
  }

  data.songs = songList;

  console.log(`Successfully built chart info database using textage JS`);

  console.log(`Building version folder SVG jackets...`);
  for (const [_, [folderName, colors]] of folders.entries()) {
    const svgPath = path.resolve(
      path.join(jacketPath, `${folderName.replaceAll(" ", "-")}.svg`),
    );
    if (folderName === "---" || (await exists(svgPath))) continue;

    await generateJacketSvg(folderName, colors, svgPath);
  }
  console.log(`Successfully built version folder SVG jackets`);

  console.log(`Successfully imported data, writing data to ${OUTFILE}`);
  const outfilePath = path.resolve(
    path.join(__dirname, "../src/songs/iidx.json"),
  );
  writeJsonData(data, outfilePath);
  console.log(
    `Complete. Make sure new arena and time-locked/shop-bought exclusives are indicated manually!`,
  );
} catch (e) {
  console.error(`Error updating ${OUTFILE} data:`, e);
  process.exitCode = 1;
}

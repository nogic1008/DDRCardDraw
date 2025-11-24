// @ts-check
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import iconv from "iconv-lite";

import { requestQueue } from "../utils.mts";

// textage JS files (c) textage.cc - don't distribute them after downloading!

const textageFiles = [
  "titletbl",
  "actbl",
  //"cstbl",
  //"cstbl1",
  //"cstbl2",
  //"cltbl",
  //"stepup",
  "datatbl",
  "scrlist",
];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const textageDir = path.join(__dirname, "textage");
console.log(textageDir);

/**
 * Returns whether the given file or directory exists.
 * @param {string} f file or directory path
 * @returns {Promise<boolean>} true if exists, false if not
 */
async function exists(f) {
  try {
    await fs.stat(f);
    return true;
  } catch {
    return false;
  }
}

/**
 * Downloads the necessary textage JS files.
 * @param {boolean} force Whether to force redownloading even if files exist
 * @returns {Promise<boolean>} True if download succeeded or files already exist, false otherwise
 */
async function textageDL(force = false) {
  const textageScrapeReady = (
    await Promise.all(
      textageFiles.map((fn) => exists(`${textageDir}/${fn}.js`)),
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

    for (let fn of textageFiles) {
      if (await exists(`${textageDir}/${fn}.js`)) {
        console.log(`Don't need to redownload ${fn}`);
        continue;
      }
      console.log(`Downloading ${fn}...`);

      const url = `https://textage.cc/score/${fn}.js`;
      const jsText = await requestQueue.add(async () => {
        const resp = await fetch(url);
        return iconv.decode(Buffer.from(await resp.arrayBuffer()), "shift-jis");
      });
      await fs.writeFile(path.join(textageDir, `${fn}.js`), jsText, {
        encoding: "utf-8",
      });
    }

    // Double-check that we got all of the textage JS.
    const textageScrapeSuccess = (
      await Promise.all(
        textageFiles.map((fn) => exists(`scraping/textage/${fn}.js`)),
      )
    ).every((v) => v);
    if (!textageScrapeSuccess) {
      console.log(
        `Failed to download textage JS sources. Invoke like 'yarn import:iidx [rescrape]'`,
      );
    }
    return textageScrapeSuccess;
  } else {
    console.log("Not redownloading source JS from textage");
    return textageScrapeReady;
  }
}

export async function fakeTextage(force = false) {
  // https://stackoverflow.com/questions/950087/how-do-i-include-a-javascript-file-in-another-javascript-file

  var dom = new JSDOM('<!DOCTYPE html><head><meta charset="UTF-8"></head>', {
    runScripts: "dangerously",
    resources: "usable",
  });
  var document = dom.window.document;

  await textageDL(force);

  for (let fn of textageFiles) {
    let fnLoader = function (doc) {
      return new Promise(function (resolve) {
        let script = doc.createElement("script");
        script.type = "text/javascript";
        script.charset = "UTF-8";
        script.src = "file:///" + path.join(textageDir, `${fn}.js`);
        script.async = false;
        script.onload = function () {
          resolve(doc);
        };

        doc.head.appendChild(script);
      });
    };
    await fnLoader(document).then((doc) => {
      document = doc;
    });
    console.log(`${fn} loaded`);
  }

  // Make sure the reconstructed textage is preloaded with the AC listing.
  dom.window.eval("lc = ['?', 'a', 0, 0, 1, 11, 0, 0, 0];");
  dom.window.eval("disp_all();");

  // Test cases (Abyss -The Heavens Remix-, AIR RAID FROM THA UNDAGROUND)
  // console.log(textageDOM.window.eval(`Array.from(Array(11).entries()).map((v) => get_level("abyss_r", v[0], 1))`))
  // console.log(textageDOM.window.eval(`Array.from(Array(11).entries()).map((v) => get_level("airraid", v[0], 1))`))

  return dom;
}

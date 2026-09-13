/* PitFlow ── 🧪 見張りが使うブラウザの場所（ブラウザを使う見張り、ぜんぶ共通）
   ===================================================================
   ◎なぜ1本にしたか（2026-09-13・ゆうた「とにかくひつようなら入れてくれ」）
     ブラウザを使う見張り135本が、**Chrome の場所を1本ずつ直に書いていた**。
     しかも書いてあったのは **Linux の `/opt/pw-browsers/…` だけ**
     ＝ この Windows の PC では、135本とも1本も走らなかった（MHS は 2026-09-11 に先に直してある）。
     書き方も8通りに揺れていたので、ここ1本にまとめた。**場所を足す時はここだけ。**

   ◎探す順番
     ① `CHROME_PATH` / `CHROME` で名指しされていれば、それ
     ② Linux の置き場（前にこの見張りを書いた環境）
     ③ **Playwright が落としたブラウザがあれば、何も返さない**（＝Playwright の既定に任せる）
        🔴 これがいちばん確か。Playwright の版と**型番がそろったブラウザ**だから。
        この PC は `%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1243`（playwright 1.63.0 と一致）。
     ④ それも無ければ、入っている Chrome / Edge を借りる（MHS の _harness.mjs と同じ並び）

   ◎この PC で走らせる前に要るもの（どちらも1回だけ・2026-09-13 に済ませた）
     ・`PitFlow\pitflow\node_modules` ＝ `CarFlow\carflow\node_modules` へのジャンクション
       （playwright 本体を借りている。**CarFlow の node_modules を消すと、ここも動かなくなる**）
     ・Playwright のブラウザ（CarFlow のフォルダで `node node_modules\playwright-core\cli.js install chromium-headless-shell`）
   =================================================================== */
import fs from 'fs';
import path from 'path';

function has(p){ try { return !!p && fs.existsSync(p); } catch (_) { return false; } }

function playwrightBrowserReady(){
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH
    || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : '');
  if (!has(base)) return false;
  try { return fs.readdirSync(base).some(n => /^chromium/.test(n)); } catch (_) { return false; }
}

export function chromePath(){
  const named = process.env.CHROME_PATH || process.env.CHROME;
  if (has(named)) return named;
  for (const p of ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']) {
    if (has(p)) return p;
  }
  if (playwrightBrowserReady()) return undefined;
  for (const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
                   'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) {
    if (has(p)) return p;
  }
  return undefined;
}

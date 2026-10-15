/* PitFlow ── 見張りが書き出す物の置き場（v2.186.1・2026-10-15）
   ===================================================================
   ◎なぜ＝見張りを走らせるたびに pitflow 直下へ shot_*.png・test-*.html が増えたり、
     git に入っている画面写真が書き換わったりして、プロジェクトが汚れていた。
   ◎決めごと
     ・画面写真（screenshot）… OS の一時フォルダ（%TEMP%\pitflow_見張り\）＝ SHOT('shot_〜.png')
     ・試しの画面（ブラウザで開く HTML・そこから読む js）… pitflow\_tmp_mihari\（.gitignore 済み）＝ writePage／writeTmp
       ⚠ HTML は「http.server で pitflow を出している」所から開くので、プロジェクトの外には置けない。
          代わりに git に入らない入れ物に置き、<base href="/"> を足して js\・css\ を今までどおり読ませる。
       URL は '/_tmp_mihari/〜.html'（TMPURL）。
   =================================================================== */
import fs from 'fs';
import os from 'os';
import path from 'path';

export const TMPDIR = path.join(process.cwd(), '_tmp_mihari');
export const TMPURL = '/_tmp_mihari/';
const SHOTDIR = path.join(os.tmpdir(), 'pitflow_見張り');

export function SHOT(name) {
  try { fs.mkdirSync(SHOTDIR, { recursive: true }); } catch (e) {}
  return path.join(SHOTDIR, name);
}
export function writeTmp(name, text) {
  fs.mkdirSync(TMPDIR, { recursive: true });
  fs.writeFileSync(path.join(TMPDIR, name), text);
  return TMPURL + name;
}
/* 試しの画面を書く。<base href="/"> を足す＝中の js/〜・css/〜 は pitflow 直下から読まれる */
export function writePage(name, html) {
  const h = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + '<base href="/">') : '<base href="/">' + html;
  return writeTmp(name, h);
}

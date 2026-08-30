/* PitFlow v2.8.2 ── 📣 全端末を今すぐ更新する合図
   -------------------------------------------------------------------
   ◎ゆうた指定（2026-08-25・本番が止まった日）
     🗣「強制リロードを全端末でかけるデプロイはできない？」
   ◎なぜ要るか
     auto-update.js はもう全端末に入っているが、確かめに行くのは **1時間に1回**
     （2026-08-17 にゆうたが「操作中に戻されて不便」と絞った数字。🔴 戻さない）。
     ふだんはそれでいいが、**古い版が1台残るだけで全体が止まる**日には1時間は長すぎる。
   ◎🔴 ここは「勝手にリロードする」仕掛け＝**空回りしたら業務が止まる。**
      だからこの試験は、**止まらないこと**を先に見る。
     🔴 ① 同じ合図では二度と反応しない（＝リロードのループにならない）
     🔴 ② 控え（localStorage）が使えない端末では**何もしない**
     🔴 ③ 1回の読み込みでリロードは1回まで
     🔴 ④ 打ち込み中は待つ／モーダル中は待つ
     🔴 ⑤ 初めてこの版を開いた端末は、いまの合図を「見たこと」にして黙る
     🔴 ⑥ 合図が変わったら読み直す（本来やりたいこと）
     🔴 ⑦ ボタンは管理者だけ・純正 confirm を使わない
   ◎使い方
     node /tmp/srv.js（別ウィンドウ・8991番）
     node test_force_reload.mjs                                        */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8991;
const cp = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x !== '' ? '  → ' + JSON.stringify(x) : '')); } };

console.log('\n── 🔍 コードを機械で読む ──');
{
  const dir = path.join(process.cwd(), 'js');
  const fr  = fs.readFileSync(path.join(dir, 'force-reload-pit.js'), 'utf8');
  const st  = fs.readFileSync(path.join(dir, 'settings.js'), 'utf8');
  const db  = fs.readFileSync(path.join(dir, 'db-pit.js'), 'utf8');
  const au  = fs.readFileSync(path.join(dir, 'auto-update.js'), 'utf8');
  const idx = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  ok('🔴 控える → そのあと読み直す（順番）',
     fr.indexOf('store(_want)') > 0 && fr.indexOf('store(_want)') < fr.indexOf('location.reload'));
  ok('🔴 純正の confirm を使っていない', !/\bconfirm\s*\(/.test(fr) && /pitAsk/.test(fr));
  ok('ボタンは管理者だけ', /pitIsAdmin\(\)\s*&&\s*window\.pitForceReloadFire/.test(st));
  ok('db-pit が受信時に見にいく', /pitForceReloadCheck\(state\.settings\)/.test(db));
  ok('db-pit が読み込み時に黙らせる', /pitForceReloadSeed\(state\.settings\)/.test(db));
  ok('🔴 db-pit より先に読み込んでいる',
     idx.indexOf('force-reload-pit.js') > 0 && idx.indexOf('force-reload-pit.js') < idx.indexOf('js/db-pit.js'));
  /* 🔴 2026-08-17 の決めごとを、この件のどさくさで戻していないこと */
  ok('🔴 自動更新の「1時間に1回」を戻していない', /VERSION_POLL_MS\s*=\s*60\s*\*\s*60\s*\*\s*1000/.test(au));
  ok('🔴 自動更新の「60秒アイドル」を戻していない', /IDLE_MS\s*=\s*60\s*\*\s*1000/.test(au));
}

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.pitForceReloadCheck', null, { timeout: 25000 });
await p.waitForTimeout(500);

/* リロードは実際にはさせない（試験が飛ぶので）。呼ばれたかどうかだけ見る。 */
/* ⚠ `location.reload` はブラウザが差し替えを許さない。
      なので force-reload-pit.js が用意している継ぎ目（pitForceReloadNow）だけを差し替えて、
      **本当にページを飛ばさずに**「読み直しが呼ばれたか」を数える。 */
const arm = () => p.evaluate(() => {
  window.__reloads = 0;
  window.pitForceReloadNow = function () { window.__reloads++; };
  try { localStorage.removeItem('pitflow_force_reload'); } catch (e) {}
});

const call = (at, opt) => p.evaluate(async ([a, o]) => {
  if (o && o.控えを消す) { try { localStorage.removeItem('pitflow_force_reload'); } catch (e) {} }
  if (o && o.控えに入れる !== undefined) { try { localStorage.setItem('pitflow_force_reload', o.控えに入れる); } catch (e) {} }
  window.__reloads = 0;
  const st = { forceReloadAt: a };
  if (o && o.種にする) window.pitForceReloadSeed(st);
  const r = window.pitForceReloadCheck(st);
  /* ⚠ go() は帯を出してから 1200ms 後に読み直す。待たずに数えると必ず 0 になる。 */
  await new Promise(res => setTimeout(res, 1500));
  return { 返り: r, リロード: window.__reloads, 控え: (() => { try { return localStorage.getItem('pitflow_force_reload'); } catch (e) { return null; } })() };
}, [at, opt || {}]);

await arm();

console.log('\n── ⑥ 合図が変わったら読み直す ──');
{
  const r = await call('2026-08-25T10:00:00.000Z', { 控えに入れる: '2026-08-25T09:00:00.000Z' });
  ok('🔴 読み直す', r.リロード === 1, r);
  ok('🔴 読み直す**前に**控えている', r.控え === '2026-08-25T10:00:00.000Z', r);
}

console.log('\n── ① 同じ合図では二度と反応しない（ループにしない） ──');
{
  await p.reload();
  await p.waitForFunction('window.pitForceReloadCheck', null, { timeout: 20000 });
  await arm();
  const r1 = await call('2026-08-25T11:00:00.000Z', { 控えに入れる: '2026-08-25T11:00:00.000Z' });
  ok('🔴 控えと同じ合図＝何もしない', r1.リロード === 0 && r1.返り === false, r1);

  /* 30回ぶつけても1回だけ（③1回の読み込みで1回まで） */
  await p.reload();
  await p.waitForFunction('window.pitForceReloadCheck', null, { timeout: 20000 });
  await arm();
  const n = await p.evaluate(async () => {
    window.__reloads = 0;
    try { localStorage.setItem('pitflow_force_reload', 'old'); } catch (e) {}
    for (let i = 0; i < 30; i++) window.pitForceReloadCheck({ forceReloadAt: '合図' + i });
    await new Promise(res => setTimeout(res, 1500));
    return window.__reloads;
  });
  ok('🔴 30回ちがう合図が来ても、読み直しは1回だけ', n === 1, n);
}

console.log('\n── ② 控えが使えない端末では何もしない ──');
{
  await p.reload();
  await p.waitForFunction('window.pitForceReloadCheck', null, { timeout: 20000 });
  await arm();
  const r = await p.evaluate(() => {
    window.__reloads = 0;
    const real = { set: localStorage.setItem, get: localStorage.getItem };
    localStorage.setItem = function () { throw new Error('使えません'); };
    localStorage.getItem = function () { throw new Error('使えません'); };
    let out;
    try { out = { 返り: window.pitForceReloadCheck({ forceReloadAt: '新しい合図' }), リロード: window.__reloads }; }
    finally { localStorage.setItem = real.set; localStorage.getItem = real.get; }
    return out;
  });
  ok('🔴 控えが残せない＝読み直さない（止まらなくなるより、やらないほうを選ぶ）',
     r.リロード === 0 && r.返り === false, r);
}

console.log('\n── ④ 打ち込み中は待つ ──');
{
  await p.reload();
  await p.waitForFunction('window.pitForceReloadCheck', null, { timeout: 20000 });
  await arm();
  const r = await p.evaluate(() => {
    window.__reloads = 0;
    try { localStorage.setItem('pitflow_force_reload', 'old'); } catch (e) {}
    const inp = document.createElement('input');
    document.body.appendChild(inp); inp.focus();
    const out = { 返り: window.pitForceReloadCheck({ forceReloadAt: '打ち込み中の合図' }), リロード: window.__reloads };
    inp.blur(); inp.remove();
    return out;
  });
  ok('🔴 入力欄にカーソルがある間は読み直さない', r.リロード === 0 && r.返り === false, r);

  const r2 = await p.evaluate(async () => {
    window.__reloads = 0;
    window.pitForceReloadCheck({ forceReloadAt: '打ち込み中の合図' });
    await new Promise(res => setTimeout(res, 1500));
    return { リロード: window.__reloads };
  });
  ok('　手が空いたら読み直す', r2.リロード === 1, r2);
}

console.log('\n── ⑤ 初めて開いた端末は黙る ──');
{
  await p.reload();
  await p.waitForFunction('window.pitForceReloadCheck', null, { timeout: 20000 });
  await arm();
  const r = await call('2026-08-25T12:00:00.000Z', { 控えを消す: true, 種にする: true });
  ok('🔴 いまの合図を「見たこと」にして読み直さない', r.リロード === 0, r);
  ok('　控えに入っている', r.控え === '2026-08-25T12:00:00.000Z', r);
}

console.log('\n── 🧭 まわり ──');
{
  await p.reload();
  await p.waitForFunction('window.pitForceReloadCheck', null, { timeout: 20000 });
  await p.evaluate(() => { try { showView('settings'); } catch (e) {} });
  await p.waitForTimeout(600);
  const h = await p.evaluate(() => document.body.innerHTML);
  ok('サンプル（クラウド外）ではボタンを出さない', !/pitForceReloadAsk/.test(h));
  ok('エラーなし', errs.length === 0, errs.slice(0, 4));
  const ver = await p.evaluate(() => document.querySelector('meta[name=app-version]').content);
  const vn = String(ver || '').split('.').map(Number);
  ok('版が v2.8.2 以降', vn[0] > 2 || (vn[0] === 2 && (vn[1] > 8 || (vn[1] === 8 && vn[2] >= 2))), ver);
}

console.log('\n' + (fail === 0 ? '🎉 ' : '⚠ ') + pass + ' OK / ' + fail + ' NG');
await b.close();
process.exit(fail === 0 ? 0 : 1);

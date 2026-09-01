/* ================================================================================
   🗃 過去の伝票の取り込み（v2.12.0）
   --------------------------------------------------------------------------------
   🗣 ゆうた 2026-08-25
      「PitFlow の始動前のデータ　ここから、ちゃんとナンバーとかで整合性がとれるのだけ」
      「ナンバーと顧客名で整合して　不安があるものは入れないか、後でリストにするかして」
      「あくまで初動の弾みをつけるためだけだから**間違いが一番ヤダな**」
   --------------------------------------------------------------------------------
   🔴 ここで見張るのは「入れた数」ではなく「**まちがって入れない**」ほう。
      ・ナンバーと顧客名が**両方**合って、当たる車が**ちょうど1台**の時だけ入れる
      ・「仮登録車両」はナンバーではない＝入れない
      ・同じ伝票を2度入れない（＝同じPDFをもう一度読ませたら0件）
      ・すでに入っている車体番号は**書き換えない**
      ・入れる前に控えを1つ落とす
   ⚠ 本物のPDF5本（2026-03〜07 / 864枚 / 106,500,291円）で走らせる。
      state.customers は、そのPDFの「ナンバー＋お客様」の**8割だけ**を作る
      ＝残り2割は「PitFlow にこの車がありません」に落ちるはず（＝落ちる側も見る）。
   ================================================================================ */
import { chromium } from 'playwright';

let OK = 0, NG = 0;
function ok(name, cond, info){
  if (cond){ OK++; console.log('  ✅ ' + name); }
  else { NG++; console.log('  ❌ ' + name + (info === undefined ? '' : '  → ' + JSON.stringify(info))); }
}

const PDFS = [1,2,3,4,5].map(i => '/tmp/pf/_hist/p' + i + '.pdf');

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport:{ width:1400, height:1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed','1'); } catch(e){} });
await p.goto('http://127.0.0.1:8991/index.html?demo=1&nonews=1');
await p.waitForFunction('window.pitPastImportOpen && window.pitQPdfRead', null, { timeout: 25000 });
await p.waitForTimeout(700);

/* ── 🚗 まず「仮登録車両」はナンバーではない ───────────────────────────── */
console.log('\n── 🚗 ナンバーとして使えないもの ──');
const 物差し = await p.evaluate(() => ({
  仮登録車両: window.pitIsRealPlate('仮登録車両'),
  仮登録:     window.pitIsRealPlate('仮登録'),
  新規車両:   window.pitIsRealPlate('新規車両'),
  ゼロ:       window.pitIsRealPlate('00'),
  本物:       window.pitIsRealPlate('松戸 480 り 748')
}));
ok('🔴「仮登録車両」はナンバーではない', 物差し.仮登録車両 === false, 物差し);
ok('　「仮登録」も同じ', 物差し.仮登録 === false, 物差し);
ok('　「新規車両」「00」も今までどおり', 物差し.新規車両 === false && 物差し.ゼロ === false, 物差し);
ok('　本物のナンバーは本物のまま', 物差し.本物 === true, 物差し);

/* ── 📄 本物のPDF5本を用意する ─────────────────────────────────────── */
console.log('\n── 📄 本物のPDFから、本番と同じ形の顧客を作る ──');
const seed = await p.evaluate(async () => {
  const all = [];
  for (let i = 1; i <= 5; i++){
    const r0 = await fetch('/_hist/p' + i + '.pdf'); const buf = await r0.arrayBuffer();
    const r = await window.pitQPdfRead(new File([buf], 'p' + i + '.pdf', { type:'application/pdf' }), () => {});
    r.伝票.forEach(x => all.push(x));
  }
  const m = {};
  all.forEach(x => { const k = pitQNormPlate(x.ナンバー) + '|' + pitQNormName(x.顧客名);
                     if (!m[k]) m[k] = { p:x.ナンバー, n:x.顧客名 }; });
  const ks = Object.keys(m);
  /* 8割だけ登録＝残り2割は「PitFlow にこのナンバーの車がありません」 */
  window.state.customers = ks.slice(0, Math.floor(ks.length * 0.8)).map((k, i) => ({
    id:'cu' + i, name:m[k].n, kana:'', contacts:[],
    vehicles:[{ id:'v' + i, plate:m[k].p, car:'テスト車', maker:'', vin:'' }]
  }));
  /* わざと1台だけ、ちがう車体番号を先に入れておく（書き換えないことを見る） */
  window.state.customers[0].vehicles[0].vin = 'XXXX-DIFFERENT';
  /* わざと1台だけ、お名前を変える（ナンバーは合うが名前が合わない） */
  window.state.customers[1].name = 'まったく別のお名前';
  return { 枚数: all.length, 顧客: window.state.customers.length, 組: ks.length,
           仮登録: all.filter(x => !window.pitIsRealPlate(x.ナンバー)).length };
});
ok('5本で864枚', seed.枚数 === 864, seed);
ok('ナンバー＋お名前の組は756', seed.組 === 756, seed);
ok('その8割（604人）だけ PitFlow に居る', seed.顧客 === 604, seed);
ok('うち43枚は「仮登録車両」', seed.仮登録 === 43, seed);

/* ── 🔎 見立て（まだ1件も書かない） ───────────────────────────────── */
console.log('\n── 🔎 読んで、見立てを作る（まだ書かない） ──');
await p.evaluate(() => window.pitPastImportOpen());
await p.waitForTimeout(300);
await p.setInputFiles('.pi-file input', PDFS);
await p.waitForFunction('document.querySelector(".pi-sum")', null, { timeout: 180000 });
await p.waitForTimeout(400);

const 見立て = await p.evaluate(() => {
  const n = s => { const e = document.querySelector(s); return e ? +e.textContent.replace(/[^0-9]/g,'') : -1; };
  const why = {};
  [].slice.call(document.querySelectorAll('.pi-why-r')).forEach(r => {
    why[r.querySelector('span').textContent] = +r.querySelector('b').textContent.replace(/[^0-9]/g,''); });
  return {
    使った: document.querySelectorAll('.pi-f.ok').length,
    外した: document.querySelectorAll('.pi-f.ng').length,
    入れる: n('.pi-c.go b'), 入れない: n('.pi-c.no b'),
    理由: why,
    警告: !!document.querySelector('.pi-warn'),
    一覧ボタン: !!document.querySelector('.pi-why button'),
    まだ書いていない: window.state.customers.every(c => c.vehicles.every(v => !(v.伝票 || []).length))
  };
});
ok('5本とも使えた（枚数も総合計も合う）', 見立て.使った === 5 && 見立て.外した === 0, 見立て);
ok('🔴 見立ての段階では**まだ1件も書いていない**', 見立て.まだ書いていない === true);
ok('入れる＋入れない＝864（1枚も行方不明にしない）',
   見立て.入れる + 見立て.入れない === 864, { 入:見立て.入れる, 否:見立て.入れない });
ok('🔴「仮登録車両」43枚は入れない',
   見立て.理由['ナンバーが無い（仮登録車両など）'] === 43, 見立て.理由);
ok('🔴 PitFlow に居ない車は入れない（2割ぶん＝153枚）',
   見立て.理由['PitFlow にこのナンバーの車がありません'] === 153, 見立て.理由);
ok('🔴 ナンバーは合うが名前が合わないものは入れない（1枚）',
   見立て.理由['ナンバーは合うが、お客様の名前が合いません'] === 1, 見立て.理由);
ok('🔴 このPDFの中で重なっているものは**0**（伝票番号 "00" は番号ではない）',
   !見立て.理由['このPDFの中で重なっています'], 見立て.理由);
ok('⚠ すでに別の車体番号が入っている車を、黙らずに出す', 見立て.警告 === true);
ok('🔴 入れなかったものは一覧で落とせる（行き止まりにしない）', 見立て.一覧ボタン === true);

/* ── ✍ 取り込む ───────────────────────────────────────────────── */
console.log('\n── ✍ 取り込む ──');
const 入れた = await p.evaluate(async () => {
  window.pitAsk = () => Promise.resolve(true);
  const 落とした = [];
  const mk = document.createElement.bind(document);
  document.createElement = function (tag){
    const el = mk(tag);
    if (String(tag).toLowerCase() === 'a') el.click = function (){ 落とした.push(el.download); };
    return el;
  };
  if (window.PitDB) window.PitDB.save = function (){};
  window.pitPastImportGo();
  await new Promise(r => setTimeout(r, 4000));
  document.createElement = mk;

  let 伝票 = 0, 車 = 0, 順OK = true, 前印 = 0, 空予約 = 0, 明細あり = 0;
  window.state.customers.forEach(c => c.vehicles.forEach(v => {
    const d = v.伝票 || [];
    if (d.length) 車++;
    伝票 += d.length;
    for (let i = 1; i < d.length; i++) if (String(d[i-1].売上日) < String(d[i].売上日)) 順OK = false;
    d.forEach(x => { if (x.PitFlow前) 前印++; if (x.予約番号 === '') 空予約++; if ((x.明細||[]).length) 明細あり++; });
  }));
  return { 落とした, 伝票, 車, 順OK, 前印, 空予約, 明細あり,
           画面: (document.querySelector('.pi-done') || {}).textContent || '',
           変えなかった車体番号: window.state.customers[0].vehicles[0].vin,
           名前ちがいは空: !(window.state.customers[1].vehicles[0].伝票 || []).length };
});
ok('🔴 入れる前に控えを1つ落とした',
   入れた.落とした.length === 1 && /控え/.test(入れた.落とした[0]), 入れた.落とした);
ok('見立てどおりの数だけ入った', 入れた.伝票 === 見立て.入れる, { 入った:入れた.伝票, 見立て:見立て.入れる });
ok('🔴 どれも「PitFlow を始める前」の印が付いている', 入れた.前印 === 入れた.伝票, 入れた);
ok('🔴 予約番号は空（カードが無いから）', 入れた.空予約 === 入れた.伝票, 入れた);
ok('明細も一緒に入っている', 入れた.明細あり > 入れた.伝票 * 0.9, 入れた);
ok('売上日の新しい順にそろっている', 入れた.順OK === true);
ok('🔴 すでに入っていた車体番号を書き換えない',
   入れた.変えなかった車体番号 === 'XXXX-DIFFERENT', 入れた.変えなかった車体番号);
ok('🔴 名前が合わなかった車には1件も入っていない', 入れた.名前ちがいは空 === true);
ok('終わったら、どこで見られるかを言う', /作業履歴/.test(入れた.画面), 入れた.画面);

/* ── 🔁 もう一度同じPDFを入れても増えない ───────────────────────────── */
console.log('\n── 🔁 同じPDFをもう一度 ──');
await p.evaluate(() => window.pitPastImportOpen());
await p.waitForTimeout(300);
await p.setInputFiles('.pi-file input', PDFS);
await p.waitForFunction('document.querySelector(".pi-sum")', null, { timeout: 180000 });
await p.waitForTimeout(400);
const 二度目 = await p.evaluate(() => {
  const why = {};
  [].slice.call(document.querySelectorAll('.pi-why-r')).forEach(r => {
    why[r.querySelector('span').textContent] = +r.querySelector('b').textContent.replace(/[^0-9]/g,''); });
  return { 入れる: +document.querySelector('.pi-c.go b').textContent.replace(/[^0-9]/g,''),
           理由: why, ボタン: !!document.querySelector('.pi-go button') };
});
ok('🔴🔴 2度目は1件も入れない', 二度目.入れる === 0, 二度目);
ok('🔴 理由は「もう入っています」', 二度目.理由['もう入っています'] === 入れた.伝票, 二度目.理由);
ok('入れるものが無い時はボタンを出さない', 二度目.ボタン === false);

/* ── 🕘 作業履歴の画面に出る ────────────────────────────────────── */
console.log('\n── 🕘 作業履歴の画面 ──');
await p.evaluate(() => { if (window.custCloseModal) custCloseModal(); });
await p.waitForTimeout(200);
const 履歴 = await p.evaluate(async () => {
  const cu = window.state.customers.find(c => (c.vehicles[0].伝票 || []).length > 1);
  if (window.custHistory) window.custHistory(cu.id, cu.vehicles[0].id);
  await new Promise(r => setTimeout(r, 500));
  const h = document.body.innerHTML;
  /* 🔖 v2.12.5 右は1件ずつ。並ぶのは**左の目次**のほう */
  return { 目次: document.querySelectorAll('.ch-ix').length,
           右: document.querySelectorAll('.ch-item').length,
           前の札: /PitFlow を始める前/.test(h),
           生タグが出ていない: !/&lt;i data-ic|<i data-ic=[a-z]+ data-ics=\d+><\/i>\s*[^<]*data-ic/.test(h) };
});
ok('過去の伝票が作業履歴の目次に並ぶ', 履歴.目次 >= 2, 履歴);
ok('🔴 右に出るのは1件だけ', 履歴.右 === 1, 履歴);
ok('🔴「PitFlow を始める前」と分かる札が付く', 履歴.前の札 === true, 履歴);

/* ── 🧭 まわり ─────────────────────────────────────────────── */
console.log('\n── 🧭 まわり ──');
ok('エラーなし', errs.length === 0, errs.slice(0, 3));
const ver = await p.evaluate(() => (document.querySelector('.ver') || {}).textContent || '');
const ge = (a, b) => { const x = String(a).replace(/[^0-9.]/g,'').split('.').map(Number),
                             y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++){ if ((x[i]||0) !== (y[i]||0)) return (x[i]||0) > (y[i]||0); } return true; };
ok('版が v2.12.0 以降', ge(ver, '2.12.0'), ver);

console.log('\n' + (NG ? '⚠ ' : '🎉 ') + OK + ' OK / ' + NG + ' NG');
await b.close();
process.exit(NG ? 1 : 0);

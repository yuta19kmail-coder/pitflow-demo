/* ============================================================
   _boxcatalog.mjs
   ダッシュボードの**全部のBOXを、全部の大きさで**1枚に並べた見本ページを作る。

   きっかけ：ゆうた 2026-08-28
     🗣「サンプルページを作り直して、前に作ってもらった全盛りのテンプレートページ、
     　　これにいま新たに作ったものも加えつつ、**BOXサイズも全サイズ出したい**」

   🔴 **静かな決めごと：絵を描き直さない。本物のアプリから吸い出す。**
      モックを手で描くと、BOXを直した時にページだけ古いまま残る（＝嘘のページになる）。
      ここは本物の `renderMyDash()` を走らせて、出てきたHTMLと**本物のCSS**をそのまま貼る。
      ＝ **作り直せばいつでも今の姿になる。**

   使い方：
     python3 -m http.server 8968 --directory . &
     PORT=8968 node _boxcatalog.mjs  [出力先.html]
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 8968;
const cp   = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const out  = process.argv[2] || ('PitFlow_BOXカタログ_' + new Date().toISOString().slice(0, 10) + '.html');

const b = await chromium.launch({ executablePath: cp });
const p = await b.newPage({ viewport: { width: 1500, height: 1200 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.renderMyDash && window.PIT_DASH_EL', null, { timeout: 30000 });
await p.waitForTimeout(1200);

/* 本物のCSSを全部集める（リンクされている順のまま） */
const css = await p.evaluate(async () => {
  const hrefs = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href'));
  const out = [];
  for (const h of hrefs) {
    try { out.push('/* ==== ' + h + ' ==== */\n' + await (await fetch(h)).text()); } catch (e) {}
  }
  return out.join('\n');
});

/* BOXを1つずつ、大きさごとに描いて吸い出す */
const data = await p.evaluate(async () => {
  const EL = window.PIT_DASH_EL;
  const keys = Object.keys(EL);
  const out = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (const k of keys) {
    const def = EL[k] || {};
    const sizes = (def.sizes && def.sizes.length) ? def.sizes : ['m'];
    const item = { key: k, title: def.title || k, icon: def.icon || '', jump: def.jump || '',
                   person: !!def.person, dv: def.dv || '', sizes: [], err: '' };
    for (const s of sizes) {
      try {
        state.settings.myDash = { v: 2, active: 0, presets: [{ name: '見本', layout: [{ e: k, s: s }] }] };
        showView('dashboard'); renderMyDash();
        await wait(30);
        const el = document.querySelector('#mydash-flow');
        item.sizes.push({ s: s, html: el ? el.innerHTML : '' });
      } catch (e) { item.err = String(e && e.message || e); }
    }
    out.push(item);
  }
  return out;
});

console.log('BOX', data.length, '／ JSエラー', errs.length);
if (errs.length) console.log(errs.slice(0, 5));

const SZ = { s: '小', m: '中', l: '大', xl: '特大' };
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const stamp = new Date().toLocaleString('ja-JP');
const ver = await p.evaluate(() => { try { return document.querySelector('meta[name=app-version]').content; } catch (e) { return ''; } });

let body = '';
data.forEach((it, i) => {
  body += '<section class="bx" id="bx-' + esc(it.key) + '">'
        + '<h2><span class="bx-ic">' + esc(it.icon) + '</span>' + esc(it.title)
        + '<code>' + esc(it.key) + '</code>'
        + (it.person ? '<em class="bx-tag">担当ごと</em>' : '')
        + (it.jump ? '<em class="bx-tag">押すと ' + esc(it.jump) + '</em>' : '')
        + '<em class="bx-tag">' + it.sizes.map(x => SZ[x.s] || x.s).join('／') + '</em>'
        + '</h2>'
        + (it.err ? '<p class="bx-err">描けませんでした：' + esc(it.err) + '</p>' : '')
        + '<div class="bx-row">'
        + it.sizes.map(x => '<div class="bx-cell bx-' + esc(x.s) + '">'
            + '<div class="bx-lb">' + esc(SZ[x.s] || x.s) + '<i>' + esc(x.s) + '</i></div>'
            + '<div class="md-flow bx-stage">' + x.html + '</div></div>').join('')
        + '</div></section>';
});

const nav = data.map(it => '<a href="#bx-' + esc(it.key) + '">' + esc(it.icon) + ' ' + esc(it.title) + '</a>').join('');

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PitFlow ダッシュボードBOX カタログ（全${data.length}種・全サイズ）</title>
<style>
${css}
/* ==== カタログのページ用（アプリのCSSは上でそのまま読み込んでいる） ==== */
body{ background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif; margin:0; padding:0 0 80px; }
.hd{ position:sticky; top:0; z-index:9; background:var(--bg2); border-bottom:1px solid var(--border); padding:14px 20px; }
.hd h1{ margin:0 0 4px; font-size:19px; }
.hd p{ margin:0; font-size:12px; color:var(--text3); }
.nav{ display:flex; flex-wrap:wrap; gap:5px; padding:12px 20px; border-bottom:1px solid var(--border); }
.nav a{ font-size:11.5px; color:var(--text2); text-decoration:none; background:var(--bg3);
  border:1px solid var(--border); border-radius:999px; padding:3px 9px; }
.nav a:hover{ border-color:var(--brand); color:var(--text); }
.bx{ padding:22px 20px 6px; border-top:1px solid var(--border); }
.bx h2{ display:flex; align-items:center; gap:9px; flex-wrap:wrap; font-size:16px; margin:0 0 12px; }
.bx h2 .bx-ic{ font-size:19px; }
.bx h2 code{ font-size:11px; color:var(--text3); background:var(--bg3); border:1px solid var(--border);
  border-radius:6px; padding:2px 7px; font-weight:400; }
.bx-tag{ font-style:normal; font-size:10.5px; color:var(--text3); background:var(--bg3);
  border:1px solid var(--border); border-radius:6px; padding:2px 7px; }
.bx-err{ color:var(--red,#ef4444); font-size:12px; }
.bx-row{ display:flex; flex-wrap:wrap; gap:16px; align-items:flex-start; }
.bx-cell{ background:var(--bg); border:1px dashed var(--border2); border-radius:12px; padding:10px; }
.bx-lb{ font-size:10.5px; font-weight:800; color:var(--text3); margin-bottom:6px; }
.bx-lb i{ font-style:normal; opacity:.6; margin-left:5px; }
/* 大きさの見え方を実機に合わせる（ダッシュボードは12列のグリッド／1列およそ108px） */
.bx-s  .bx-stage{ width:230px; }
.bx-m  .bx-stage{ width:350px; }
.bx-l  .bx-stage{ width:580px; }
.bx-xl .bx-stage{ width:1120px; }
.bx-stage{ pointer-events:none; }          /* 見本なので押せない（本物と間違えないように） */
</style></head><body>
<div class="hd">
  <h1>PitFlow ダッシュボードBOX カタログ</h1>
  <p>全 ${data.length} 種 ／ 全サイズ ・ PitFlow v${esc(ver)} ・ ${esc(stamp)} 時点の<b>本物のBOX</b>を、見本データで描いたものです（絵は描き直していません）。</p>
</div>
<div class="nav">${nav}</div>
${body}
</body></html>`;

fs.writeFileSync(out, html);
console.log('書きました:', out, Math.round(html.length / 1024) + 'KB');
await b.close();

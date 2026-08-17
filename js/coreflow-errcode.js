/* ========================================
   coreflow-errcode.js ── エラー番号（CoreFlow 全アプリ共通・2026-08-17）
   ----------------------------------------
   ⚠ このファイルの本体は  D:\Claude\アプリ開発\_shared\coreflow-errcode.js  です。
      直す時はそこを直して、sync-shared.ps1 を実行して全アプリに配ること。
      各アプリの js\ に入っているのは配られたコピー。直接直すと次の配布で消えます。

   ◎なぜ作ったか（ゆうた指定 2026-08-17）
     🗣「**全てのエラー系のメッセージに固有のエラー番号を付けたい。
     　　もう俺以外もバンバン使ってるから、エラーコードあった方が話しやすいでしょ？**」
     ＝ 現場の人が「◯◯が出た」と言う時に、**番号ひとつで場所と意味が特定できる**ようにする。

   ◎番号の形　`PF-0412`
     ・アプリ2文字 … PF=PitFlow／CF=CarFlow／CN=CoreNote／CB=CoreBoard／MH=MHS
     　　　　　　　　CM=CoreMembers／CT=CoreTools／CP=CoreTemplate／SF=StockFlow／PO=CoreFlow(ポータル)
     ・4桁の**先頭1桁が分野**。あとの3桁は分野の中の通し番号。
        0xxx 全体（保存・読み込み・通信・権限・ログイン・未実装）
        1xxx〜9xxx はアプリごと（各アプリの台帳の頭に書いてある）

   ◎🔴 いちばん大事な決めごと
     🔴 **一度出した番号は、二度と変えない・使い回さない。**
        直して要らなくなっても**欠番のまま残す**（現場のメモや過去のやり取りが読めなくなる）。
     🔴 **番号を付けるのは「通らなかった」時だけ。**
        失敗・拒否・入力不足・中止・警告。**成功（保存しました）には付けない。**
     🔴 台帳は**アプリごとに1本**（`errcode-<アプリ>.js`）。一覧表もそこから自動で作る＝写しを作らない。

   ◎見せ方（ゆうた確定 2026-08-17・モックで選んだ形）
     ・トースト … **2行目の右端**に `error：PF-4002`（枠なし・薄い字）＝B案
     ・窓　　　 … **ボタンと同じ行の左端**に `error：PF-1002`（枠なし）＝A案
     ・どちらも **押すと番号をコピー**できる。

   ◎使いかた（アプリ側）
     ① 台帳を登録する
        CFErr.load('PF', [ ['PF-0001','全体','何が起きたか','どこで','どうすれば'], … ]);
     ② トーストに足す（各アプリのトースト関数の中で1行）
        if (code) CFErr.toast(トーストの要素, code);
     ③ 窓は ui-dialog.js が `opts.code` を見て勝手に出す（アプリ側は code を渡すだけ）
   ======================================== */
(function (w) {
  'use strict';
  if (w.CFErr) return;

  /* 見た目は**この部品が自分で差し込む**。
     ⚠ 共通CSS（coreflow-ui.css）を読んでいないアプリ（CarFlow など）でも同じに出したいため。 */
  function css(){
    if (document.getElementById('cf-ec-style')) return;
    var st = document.createElement('style'); st.id = 'cf-ec-style';
    st.textContent = [
      /* トースト＝本文の下・右端（B案） */
      '.cf-ec-host{display:inline-flex !important;flex-direction:column;align-items:stretch;gap:1px}',
      '.cf-ec{align-self:flex-end;font-family:Consolas,Menlo,"Courier New",monospace;',
      '  font-size:10.5px;font-weight:600;letter-spacing:.3px;line-height:1.5;',
      '  color:var(--text3,#8a94a6);cursor:pointer;pointer-events:auto;white-space:nowrap;',
      '  user-select:none;-webkit-user-select:none;opacity:.9}',
      '.cf-ec:hover{color:var(--text2,#9fa8c7);text-decoration:underline dotted;opacity:1}',
      '.cf-ec:active{transform:translateY(1px)}',
      /* 窓＝ボタン行の左端（A案）。位置は ui-dialog.js 側でも指定してある（保険） */
      '#uid-card .uid-b .cf-ec{margin-right:auto;align-self:center}',
      /* コピーしたよ、の一言 */
      '.cf-ec-hint{position:fixed;left:50%;bottom:76px;transform:translateX(-50%) translateY(8px);',
      '  background:var(--bg2,#161b22);color:var(--text,#e6edf3);',
      '  border:1px solid var(--border2,rgba(255,255,255,.18));border-radius:9px;',
      '  padding:7px 14px;font-size:12px;font-weight:700;z-index:100000;opacity:0;pointer-events:none;',
      '  transition:opacity .2s,transform .2s;box-shadow:0 8px 26px rgba(0,0,0,.35)}',
      '.cf-ec-hint.show{opacity:1;transform:translateX(-50%) translateY(0)}'
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', css);
  else css();

  var PREFIX = '';
  var MAP = {};
  var LIST = [];

  /* 台帳を読み込む。アプリごとに1回だけ呼ぶ。 */
  function load(prefix, list){
    PREFIX = String(prefix || '');
    LIST = (list || []).map(function (r){ return r.slice(); });
    MAP = {};
    LIST.forEach(function (r){ MAP[r[0]] = { code:r[0], area:r[1], what:r[2], where:r[3], how:r[4] }; });
    return LIST.length;
  }

  function info(code){ return MAP[code] || null; }
  function known(code){ return !!MAP[code]; }
  function all(){ return LIST.map(function (r){ return r.slice(); }); }

  /* 画面に出す1個ぶん（枠なし・押すとコピー）。`error：PF-0412` */
  function el(code){
    var s = document.createElement('span');
    s.className = 'cf-ec';
    s.setAttribute('data-ec', code);
    s.setAttribute('role', 'button');
    s.setAttribute('title', '押すと番号をコピーします');
    s.textContent = 'error：' + code;
    return s;
  }

  /* トーストに足す（B案＝本文の下・右端）。
     ⚠ トーストは画面を邪魔しない作り（pointer-events:none）のアプリが多いので、
        番号だけ押せるように、**入れ物にも印を付ける**（見た目は共通CSS側）。 */
  function toast(host, code){
    if (!host || !code) return;
    try {
      host.classList.add('cf-ec-host');
      var old = host.querySelector('.cf-ec'); if (old) old.parentNode.removeChild(old);
      host.appendChild(el(code));
    } catch (e) {}
  }

  /* 番号をクリップボードへ。⚠ 失敗しても黙って終わる（コピーできない端末がある） */
  function copy(code){
    var done = function (){
      var h = document.getElementById('cf-ec-hint');
      if (!h){ h = document.createElement('div'); h.id = 'cf-ec-hint'; h.className = 'cf-ec-hint'; document.body.appendChild(h); }
      h.textContent = code + ' をコピーしました';
      h.classList.add('show');
      clearTimeout(w._cfEcT); w._cfEcT = setTimeout(function (){ h.classList.remove('show'); }, 1600);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(code).then(done, function(){}); return; }
      var t = document.createElement('textarea'); t.value = code; t.style.position='fixed'; t.style.opacity='0';
      document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); done();
    } catch (e) {}
  }

  /* どこに出ている番号でも、押したらコピー（1本で受ける＝窓ごとに配線しない） */
  document.addEventListener('click', function (ev){
    var t = ev.target && ev.target.closest && ev.target.closest('.cf-ec');
    if (!t) return;
    ev.preventDefault(); ev.stopPropagation();
    copy(t.getAttribute('data-ec') || String(t.textContent || '').replace(/^error：/, ''));
  }, true);

  w.CFErr = { load:load, info:info, known:known, all:all, el:el, toast:toast, copy:copy,
              prefix:function(){ return PREFIX; } };
})(window);

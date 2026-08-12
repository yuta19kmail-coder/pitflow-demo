/* ========================================
   reset-pit.js  -  本番データの初期化 ／ デモ版の「まっさらにする」（PitFlow）
   v1.3.0（2026-08-12）
   ----------------------------------------
   🟠 v1.3.0（2026-08-12）＝**デモ版（練習用サイト）でも出す**ようにした。
      やること（消すもの・残すもの・「初期化」と打たせる関門）は**本番と全く同じ**。
      違うのは**言い方だけ**＝`L()` にまとめてある。**道を2本に分けない。**
   ----------------------------------------
   ◎ なにをするもの
     設定画面のいちばん下に「本番データの初期化」を出す。押すと、いま入っている
       ・予約カード（予約／入庫／預かり中／実績のカード全部）
       ・お客様
       ・代車 と その貸出
       ・自社車両 と その予定
       ・付箋
     を **全部消して空っぽ**にする。運用を「0件」から始めるための仕上げ用。

   ◎ 消さないもの（わざと残す）
     設定・PIT配置図・作業タイプ・外注先・入庫ルールの判定・付箋の色・メンバーの役どころ。
     ＝「引っ越してきた設定」はそのまま使いたいため。
     操作ログとお知らせも残る（誰がいつ初期化したかを追えるように）。

   ◎ 安全のための決まり
     ・本番モード（クラウド保存）でログインしていて、役割が「管理」の人にしか出さない。
     ・消す前に、いま何件あるかを出す。
     ・「初期化」と打ち込まないと実行ボタンが押せない。
     ・消したことは操作ログに残す（件数つき）。

   ◎ 消し方の中身
     画面の持ちもの（state）を空にして PitDB.save(true) を呼ぶだけ。
     PitDB が「前と比べて消えたもの」を Firestore から削除する＝
     いつもの保存と同じ道を通るので、特別な削除処理を作っていない（＝壊れにくい）。
     全端末にはリアルタイムで反映される。
   ======================================== */
(function (w, d) {
  'use strict';

  /* 消す対象（PitDB の入れ物の名前と同じキー） */
  var TARGETS = [
    { key: 'cards',         name: '予約カード' },
    { key: 'customers',     name: 'お客様' },
    { key: 'loaners',       name: '代車' },
    { key: 'loanerAssigns', name: '代車の貸出' },
    { key: 'companyCars',   name: '自社車両' },
    { key: 'fleetEvents',   name: '自社車両の予定' },
    { key: 'boardNotes',    name: '付箋' }
  ];

  function isCloud()  { return !!w.PIT_CLOUD; }
  function isAdmin()  { return !w.pitIsAdmin || w.pitIsAdmin(); }
  /* 🟠 v1.77.0 デモ版（練習用サイト）でも出す＝**まっさらから練習し直せる**ように。
     ⚠ 判定は demo-pit.js の `pitIsDemo()` 1本を借りる（location.search をここで読み直さない）。
     ⚠ サンプルモードは全員が「管理」あつかい（auth-pit.js）なので isAdmin は素通りする。 */
  function isDemo()   { return !!(w.pitIsDemo && w.pitIsDemo()); }
  function canShow()  { return (isCloud() || isDemo()) && isAdmin(); }

  /* 🟠 デモ版と本番で**言い方だけ**変える。
     🔴 中身（消すもの・残すもの・「初期化」と打たせる関門）は変えない＝道を2本にしない。 */
  function L() {
    var demo = isDemo() && !isCloud();
    return {
      head: demo ? 'ぜんぶ消して、まっさらにする' : '本番データの初期化',
      lead: demo
        ? '練習で作ったものを<b>全部消して空っぽ</b>にします。設定（PIT配置図・作業タイプ・外注先・入庫ルールの判定・付箋の色）は残ります。<br>' +
          'サンプルの入った状態に戻したい時は、<b>開発用サンプル ▸ 予約サンプルを作り直す</b>を使ってください。'
        : '予約カード・お客様・代車・自社車両・付箋を<b>全部消して空っぽ</b>にします。' +
          '設定（PIT配置図・作業タイプ・外注先・入庫ルールの判定・付箋の色）とメンバーは残ります。<br>' +
          '運用を0件から始めるための操作です。<b>消したものは戻せません。</b>',
      btn: demo ? 'まっさらにする…' : '初期化する…',
      lead2: demo
        ? '下の内容を<b>全部消します</b>。ここはデモ版なので、<b>本番のデータには影響しません</b>。'
        : '下の内容を<b>全部消します</b>。消したものは戻せません。いま開いている全員の画面からも、すぐに消えます。'
    };
  }
  function esc(s)     { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function counts() {
    var out = [], total = 0;
    TARGETS.forEach(function (t) {
      var n = (w.state && Array.isArray(w.state[t.key])) ? w.state[t.key].length : 0;
      out.push({ name: t.name, n: n });
      total += n;
    });
    return { rows: out, total: total };
  }

  /* ---------- 見た目 ---------- */
  function injectCSS() {
    if (d.getElementById('pit-reset-css')) return;
    var css =
      '.pit-reset-box{background:var(--bg2);border:1px solid rgba(239,68,68,.35);border-radius:var(--r);padding:16px;margin-top:14px}' +
      '.pit-reset-box h4{margin:0 0 6px;font-size:14px;color:#fca5a5;display:flex;align-items:center;gap:6px}' +
      '.pit-reset-box p{margin:0 0 12px;font-size:12px;color:var(--text2);line-height:1.7}' +
      '.pit-reset-box .pr-go{padding:8px 14px;border-radius:8px;border:1px solid rgba(239,68,68,.5);' +
        'background:rgba(239,68,68,.12);color:#fca5a5;font-size:13px;font-weight:600;cursor:pointer}' +
      '.pit-reset-box .pr-go:hover{background:rgba(239,68,68,.2)}' +
      '#pit-reset-ovl{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);display:flex;' +
        'align-items:center;justify-content:center;padding:20px}' +
      '#pit-reset-ovl .pr-card{width:min(94vw,460px);max-height:88vh;overflow:auto;background:var(--bg2);' +
        'border:1px solid var(--border);border-radius:14px;padding:22px;color:var(--text);box-shadow:0 24px 60px rgba(0,0,0,.5)}' +
      '#pit-reset-ovl h3{margin:0 0 10px;font-size:16px;color:#fca5a5}' +
      '#pit-reset-ovl .pr-lead{font-size:12.5px;line-height:1.8;color:var(--text2);margin-bottom:14px}' +
      '#pit-reset-ovl table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px}' +
      '#pit-reset-ovl td{padding:5px 0;border-bottom:1px dashed var(--border)}' +
      '#pit-reset-ovl td.n{text-align:right;font-weight:700}' +
      '#pit-reset-ovl .pr-keep{font-size:11.5px;line-height:1.8;color:var(--text3);background:var(--bg3);' +
        'border-radius:8px;padding:9px 11px;margin-bottom:14px}' +
      '#pit-reset-ovl .pr-type{width:100%;padding:9px 11px;border-radius:8px;border:1px solid var(--border);' +
        'background:var(--bg3);color:var(--text);font-size:14px;outline:none;margin-bottom:14px}' +
      '#pit-reset-ovl .pr-type:focus{border-color:#ef4444}' +
      '#pit-reset-ovl .pr-btns{display:flex;gap:10px;justify-content:flex-end}' +
      '#pit-reset-ovl button{padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;' +
        'border:1px solid var(--border);background:var(--bg3);color:var(--text2)}' +
      '#pit-reset-ovl button.danger{border-color:rgba(239,68,68,.55);background:#dc2626;color:#fff}' +
      '#pit-reset-ovl button.danger:disabled{opacity:.4;cursor:default;background:var(--bg3);color:var(--text3);' +
        'border-color:var(--border)}';
    var st = d.createElement('style');
    st.id = 'pit-reset-css';
    st.textContent = css;
    (d.head || d.documentElement).appendChild(st);
  }

  /* ---------- 設定画面に入口を出す ---------- */
  function appendBox() {
    if (!canShow()) {
      var old = d.getElementById('pit-reset-box');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      return;
    }
    var host = d.getElementById('view-settings-body');
    if (!host) return;
    if (d.getElementById('pit-reset-box')) return;
    injectCSS();
    var box = d.createElement('div');
    box.id = 'pit-reset-box';
    box.className = 'pit-reset-box';
    var t = L();
    box.innerHTML =
      '<h4><i data-ic=warn data-ics=16></i> ' + t.head + '</h4>' +
      '<p>' + t.lead + '</p>' +
      '<button class="pr-go" onclick="pitOpenReset()">' + t.btn + '</button>';
    host.appendChild(box);
    try { if (w.icoBoot) w.icoBoot(box); } catch (e) {}   /* 見張り役が自動で入れてくれるが、念のため */
  }

  /* ---------- 確認の窓 ---------- */
  function close() {
    var o = d.getElementById('pit-reset-ovl');
    if (o && o.parentNode) o.parentNode.removeChild(o);
  }

  w.pitOpenReset = function () {
    if (!canShow()) return;
    injectCSS();
    close();
    var c = counts();
    var rows = c.rows.map(function (r) {
      return '<tr><td>' + esc(r.name) + '</td><td class="n">' + r.n + ' 件</td></tr>';
    }).join('');

    var t = L();
    var o = d.createElement('div');
    o.id = 'pit-reset-ovl';
    o.innerHTML =
      '<div class="pr-card">' +
        '<h3>' + t.head + '</h3>' +
        '<div class="pr-lead">' + t.lead2 + '</div>' +
        '<table>' + rows + '<tr><td><b>合計</b></td><td class="n">' + c.total + ' 件</td></tr></table>' +
        '<div class="pr-keep">残るもの：設定・PIT配置図・作業タイプ・外注先・入庫ルールの判定・付箋の色・メンバー・お知らせ・操作ログ</div>' +
        '<input class="pr-type" id="pr-type" type="text" placeholder="ここに「初期化」と入力してください" autocomplete="off">' +
        '<div class="pr-btns">' +
          '<button onclick="pitCloseReset()">やめる</button>' +
          '<button class="danger" id="pr-run" disabled onclick="pitRunReset()">全部消す</button>' +
        '</div>' +
      '</div>';
    (d.body || d.documentElement).appendChild(o);

    var inp = d.getElementById('pr-type'), btn = d.getElementById('pr-run');
    inp.addEventListener('input', function () {
      btn.disabled = (inp.value.trim() !== '初期化');
    });
    o.addEventListener('click', function (ev) { if (ev.target === o) close(); });
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 30);
  };

  w.pitCloseReset = close;

  /* ---------- 実行 ---------- */
  w.pitRunReset = function () {
    if (!canShow()) return;
    var inp = d.getElementById('pr-type');
    if (!inp || inp.value.trim() !== '初期化') return;
    if (!w.PitDB || typeof w.PitDB.save !== 'function') return;

    var c = counts();
    var label = c.rows.filter(function (r) { return r.n > 0; })
                      .map(function (r) { return r.name + ' ' + r.n + '件'; }).join('／') || '（0件）';

    /* 先に操作ログへ（消える前の件数を残す） */
    try { if (w.pitLog) w.pitLog(L().head, { label: label, kind: 'reset' }); } catch (e) {}

    TARGETS.forEach(function (t) {
      if (w.state && Array.isArray(w.state[t.key])) w.state[t.key].length = 0;
      else if (w.state) w.state[t.key] = [];
    });

    var ok = w.PitDB.save(true);
    close();

    try {
      if (w.state && w.state.currentView && w.showView) w.showView(w.state.currentView);
    } catch (e) { console.warn('[reset-pit] 画面の描き直しでエラー', e); }

    var msg = (ok === false) ? '消せませんでした。通信を確認してもう一度お試しください'
            : (isDemo() && !isCloud())
              ? 'まっさらにしました（' + c.total + '件）。設定 ▸ 開発用サンプル からサンプルを入れ直せます'
              : '初期化しました（' + c.total + '件）。全員の画面からも消えます';
    if (w.showToast) w.showToast(msg); else if (w.pitToast) w.pitToast(msg);
    console.log('[reset-pit] 初期化', label);
  };

  /* ---------- 設定画面が描かれるたびに入口を足す ---------- */
  function hookRender() {
    if (typeof w.renderSettings !== 'function' || w.renderSettings.__pitReset) return false;
    var orig = w.renderSettings;
    var f = function () {
      var r = orig.apply(this, arguments);
      try { appendBox(); } catch (e) { console.warn('[reset-pit] 入口の追加でエラー', e); }
      return r;
    };
    f.__pitReset = 1;
    w.renderSettings = f;
    return true;
  }

  function boot() {
    if (!hookRender()) setTimeout(boot, 300);
    try { appendBox(); } catch (e) {}
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);

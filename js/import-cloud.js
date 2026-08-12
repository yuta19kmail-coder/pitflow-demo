/* ========================================
   import-cloud.js  -  顧客データの取込（本番＝クラウド用）
   v1.5.0（2026-08-01）：取り込む時に「担当者の名前」を**メンバーに結びつける**（番号を添える）。
   ----------------------------------------
   ◎ なにをするもの
     bizcloud から作った `顧客車両_取込用_YYYY-MM-DD_カルテNo付.json` を選ぶと、
     **お客様の控えを丸ごと入れ替えて、全端末で共有される本番のクラウドに保存**する。
     （従来の `import-bizcloud.js` は「この端末のブラウザの中だけ」＝本番では使えない）

   ◎ なぜ専用に作るか
     6,000人・7,000台を一度に送ると1回の保存に収まらない。
     Firestore のまとめ書きは1回500件までなので、**400件ずつに分けて順番に送る**。
     途中経過が見えないと固まったように見えるので、**進捗バー**を出す。

   ◎ 安全のための決まり
     ・本番モード（クラウド保存）で、役割が「管理」の人にしか出さない。
     ・送る前に「いま何人 → 何人になる」「消える人が何人」を出す。
     ・「取込」と打ち込まないと実行できない。
     ・実行中は自動保存を止める（PitDB._applying）＝二重送信を防ぐ。
     ・入れ替えたことは操作ログに残す。

   ◎ 送り方の中身
     PitDB のクラウド保存とまったく同じ作法で送る（1件＝1ドキュメント、
     送れたぶんだけ控え `_shadow` を更新）。だから送り終わったあと、
     普段の保存が「もう一度全部送る」ことはない。
   ======================================== */
(function (w, d) {
  'use strict';

  var COL = 'pitCustomers';
  var CHUNK = 400;

  function isCloud() { return !!w.PIT_CLOUD; }
  function isAdmin() { return !w.pitIsAdmin || w.pitIsAdmin(); }
  function canShow() { return isCloud() && isAdmin(); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* ---------- 見た目 ---------- */
  function injectCSS() {
    if (d.getElementById('pit-imp-css')) return;
    var css =
      '.pit-imp-box{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-top:14px}' +
      '.pit-imp-box h4{margin:0 0 6px;font-size:14px;display:flex;align-items:center;gap:6px}' +
      '.pit-imp-box p{margin:0 0 12px;font-size:12px;color:var(--text2);line-height:1.7}' +
      '.pit-imp-box .pi-go{padding:8px 14px;border-radius:8px;border:1px solid var(--border);' +
        'background:var(--bg3);color:var(--text);font-size:13px;font-weight:600;cursor:pointer}' +
      '.pit-imp-box .pi-go:hover{border-color:var(--brand)}' +
      '#pit-imp-ovl{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);display:flex;' +
        'align-items:center;justify-content:center;padding:20px}' +
      '#pit-imp-ovl .pi-card{width:min(94vw,470px);max-height:88vh;overflow:auto;background:var(--bg2);' +
        'border:1px solid var(--border);border-radius:14px;padding:22px;color:var(--text);box-shadow:0 24px 60px rgba(0,0,0,.5)}' +
      '#pit-imp-ovl h3{margin:0 0 10px;font-size:16px}' +
      '#pit-imp-ovl .pi-lead{font-size:12.5px;line-height:1.8;color:var(--text2);margin-bottom:14px}' +
      '#pit-imp-ovl table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px}' +
      '#pit-imp-ovl td{padding:5px 0;border-bottom:1px dashed var(--border)}' +
      '#pit-imp-ovl td.n{text-align:right;font-weight:700}' +
      '#pit-imp-ovl .pi-warn{font-size:11.5px;line-height:1.8;color:#fcd34d;background:rgba(245,158,11,.10);' +
        'border:1px solid rgba(245,158,11,.35);border-radius:8px;padding:9px 11px;margin-bottom:14px}' +
      '#pit-imp-ovl .pi-type{width:100%;padding:9px 11px;border-radius:8px;border:1px solid var(--border);' +
        'background:var(--bg3);color:var(--text);font-size:14px;outline:none;margin-bottom:14px}' +
      '#pit-imp-ovl .pi-btns{display:flex;gap:10px;justify-content:flex-end}' +
      '#pit-imp-ovl button{padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;' +
        'border:1px solid var(--border);background:var(--bg3);color:var(--text2)}' +
      '#pit-imp-ovl button.go{border-color:transparent;background:var(--brand);color:#fff}' +
      '#pit-imp-ovl button.go:disabled{opacity:.4;cursor:default;background:var(--bg3);color:var(--text3);border-color:var(--border)}' +
      '#pit-imp-ovl .pi-bar{height:10px;border-radius:6px;background:var(--bg3);overflow:hidden;margin:6px 0 8px}' +
      '#pit-imp-ovl .pi-bar>span{display:block;height:100%;width:0;background:var(--brand);transition:width .2s}' +
      '#pit-imp-ovl .pi-stat{font-size:12.5px;color:var(--text2)}' +
      '#pit-imp-ovl .pi-link{font-size:11.5px;line-height:1.8;background:var(--bg3);border-radius:8px;padding:9px 11px;margin-bottom:14px}' +
      '#pit-imp-ovl .pi-link-ok{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}' +
      '#pit-imp-ovl .pi-link-ok>span{background:rgba(34,197,94,.14);border:1px solid rgba(34,197,94,.3);color:#86efac;' +
        'border-radius:999px;padding:1px 8px;font-size:11px}' +
      '#pit-imp-ovl .pi-link-ok>span i{font-style:normal;opacity:.75}' +
      '#pit-imp-ovl .pi-link-ng{margin-top:8px;color:#fcd34d}';
    var st = d.createElement('style');
    st.id = 'pit-imp-css';
    st.textContent = css;
    (d.head || d.documentElement).appendChild(st);
  }

  /* ---------- 設定画面に入口を出す ---------- */
  function appendBox() {
    if (!canShow()) {
      var old = d.getElementById('pit-imp-box');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      return;
    }
    var host = d.getElementById('view-settings-body');
    if (!host || d.getElementById('pit-imp-box')) return;
    injectCSS();
    var box = d.createElement('div');
    box.id = 'pit-imp-box';
    box.className = 'pit-imp-box';
    box.innerHTML =
      '<h4><i data-ic=users data-ics=16></i> 顧客データの取込（本番）</h4>' +
      '<p>整備ソフトから作った顧客ファイル（<b>顧客車両_取込用_〇〇.json</b>）を読み込んで、' +
      'お客様の控えを<b>丸ごと入れ替え</b>ます。保存先は本番のクラウドなので、<b>全員の画面に反映</b>されます。<br>' +
      '件数が多いので、400件ずつに分けて送ります（途中経過が出ます）。</p>' +
      '<button class="pi-go" onclick="pitOpenCustImport()"><i data-ic=upload data-ics=15></i> ファイルを選んで取り込む…</button>';
    host.appendChild(box);
    try { if (w.icoBoot) w.icoBoot(box); } catch (e) {}
  }

  function close() {
    var o = d.getElementById('pit-imp-ovl');
    if (o && o.parentNode) o.parentNode.removeChild(o);
  }
  w.pitCloseCustImport = close;

  function overlay(html) {
    close();
    var o = d.createElement('div');
    o.id = 'pit-imp-ovl';
    o.innerHTML = '<div class="pi-card">' + html + '</div>';
    (d.body || d.documentElement).appendChild(o);
    return o;
  }

  /* ---------- ファイルを選ぶ ---------- */
  w.pitOpenCustImport = function () {
    if (!canShow()) return;
    injectCSS();
    var inp = d.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var list;
        try { list = JSON.parse(fr.result); }
        catch (e) { return alertBox('このファイルは読めませんでした（JSONの形が違います）。'); }
        if (!Array.isArray(list) || !list.length) return alertBox('顧客が入っていないファイルです。');
        var bad = list.filter(function (c) { return !c || (!c.id && c.code == null); }).length;
        if (bad) return alertBox('顧客の番号（code）が無い行が ' + bad + ' 件あります。ファイルを確認してください。');
        confirmBox(list, f.name);
      };
      fr.readAsText(f);
    };
    inp.click();
  };

  function alertBox(msg) {
    overlay('<h3>取り込めません</h3><div class="pi-lead">' + esc(msg) + '</div>' +
            '<div class="pi-btns"><button onclick="pitCloseCustImport()">閉じる</button></div>');
  }

  /* ---------- 確認 ---------- */
  /* 担当者の名前 → メンバー。結びついた数と、結びつかなかった名前を出す。 */
  function linkStaff(list) {
    var hit = {}, miss = {};
    list.forEach(function (c) {
      var m = w.pitStaffByName ? w.pitStaffByName(c.pic) : null;
      if (m) { c.picId = m.id; c.pic = m.name; hit[m.name] = (hit[m.name] || 0) + 1; }
      else { delete c.picId; if ((c.pic || '').trim()) miss[c.pic] = (miss[c.pic] || 0) + 1; }
      (c.vehicles || []).forEach(function (v) {
        var vm = w.pitStaffByName ? w.pitStaffByName(v.frontStaff) : null;
        if (vm) { v.frontStaffId = vm.id; v.frontStaff = vm.name; }
        else { delete v.frontStaffId; }
      });
    });
    return { hit: hit, miss: miss };
  }

  function confirmBox(list, fname) {
    var cur = (w.state && Array.isArray(w.state.customers)) ? w.state.customers : [];
    var veh = 0, karte = 0;
    list.forEach(function (c) {
      var vs = c.vehicles || [];
      veh += vs.length;
      vs.forEach(function (v) { if (v && v.karteNo) karte++; });
    });
    var newIds = {};
    list.forEach(function (c) { newIds[c.id || ('cu_bl_' + c.code)] = 1; });
    var gone = cur.filter(function (c) { return !newIds[c.id]; }).length;

    /* 担当者をメンバーに結びつける（ここで c.picId / v.frontStaffId が入る） */
    /* 同じ名前のメンバーが居ると取り違える。先に気づけるように出す。 */
    var dupWarn = '';
    (function () {
      var cnt = {}, dup = [];
      ((w.state && w.state.staff) || []).forEach(function (s2) {
        var k = w.pitStaffKey ? w.pitStaffKey(s2.name) : s2.name;
        cnt[k] = (cnt[k] || 0) + 1;
        if (cnt[k] === 2) dup.push(s2.name);
      });
      if (dup.length) dupWarn = '<b>同じ名前のメンバーがいます</b>：' + esc(dup.join('、')) +
        '。担当が取り違えられる可能性があります。CoreMembers の表示名で区別してから取り込むのが安全です。';
    })();

    var link = linkStaff(list);
    var hitNames = Object.keys(link.hit).sort(function (a, b) { return link.hit[b] - link.hit[a]; });
    var missNames = Object.keys(link.miss).sort(function (a, b) { return link.miss[b] - link.miss[a]; });
    var linked = hitNames.reduce(function (n, k) { return n + link.hit[k]; }, 0);
    var linkHtml =
      '<div class="pi-link"><b>担当者とメンバーの結びつけ</b>' +
      '<div class="pi-link-ok">' + (hitNames.length
          ? hitNames.map(function (n) { return '<span>' + esc(n) + ' <i>' + num(link.hit[n]) + '</i></span>'; }).join('')
          : '<span style="opacity:.7">結びついた人がいません</span>') + '</div>' +
      (missNames.length
        ? '<div class="pi-link-ng">メンバーに見つからない担当：' +
          missNames.map(function (n) { return esc(n) + '（' + num(link.miss[n]) + '）'; }).join('、') +
          '<br>この人たちは<b>名前の文字だけ</b>入ります（表示は今までどおり・「名簿外」の扱い）。' +
          'CoreMembers に<b>退職として登録すれば、次に開いた時に自動でつながります</b>。</div>'
        : '') +
      (dupWarn ? '<div class="pi-link-ng">' + dupWarn + '</div>' : '') +
      '</div>';

    overlay(
      '<h3>顧客データの取込</h3>' +
      '<div class="pi-lead">ファイル：<b>' + esc(fname) + '</b></div>' +
      '<table>' +
        '<tr><td>取り込むお客様</td><td class="n">' + num(list.length) + ' 人</td></tr>' +
        '<tr><td>そのお車</td><td class="n">' + num(veh) + ' 台</td></tr>' +
        '<tr><td>カルテNo付き</td><td class="n">' + num(karte) + ' 台</td></tr>' +
        '<tr><td>いま入っているお客様</td><td class="n">' + num(cur.length) + ' 人</td></tr>' +
        '<tr><td>入れ替えで消える人</td><td class="n">' + num(gone) + ' 人</td></tr>' +
        '<tr><td>担当がメンバーと結びついた人</td><td class="n">' + num(linked) + ' 人</td></tr>' +
      '</table>' + linkHtml +
      '<div class="pi-warn">お客様の控えは<b>この内容に丸ごと入れ替わります</b>。予約カード・代車・自社車両・付箋には触りません。' +
      '送っている間はこの画面を閉じないでください。</div>' +
      '<input class="pi-type" id="pi-type" type="text" placeholder="ここに「取込」と入力してください" autocomplete="off">' +
      '<div class="pi-btns">' +
        '<button onclick="pitCloseCustImport()">やめる</button>' +
        '<button class="go" id="pi-run" disabled>送る</button>' +
      '</div>');

    var t = d.getElementById('pi-type'), b = d.getElementById('pi-run');
    t.addEventListener('input', function () { b.disabled = (t.value.trim() !== '取込'); });
    b.addEventListener('click', function () { run(list); });
    setTimeout(function () { try { t.focus(); } catch (e) {} }, 30);
  }

  /* ---------- 送る ---------- */
  function run(list) {
    var DB = w.PitDB;
    if (!DB || !DB._shadow || !w.fb || !w.fb.db) return alertBox('クラウドに繋がっていません。開き直してからやり直してください。');
    if (DB._loaded === false) return alertBox('クラウドの読み込みがまだ終わっていません。少し待ってからやり直してください。');

    var cur = (w.state && Array.isArray(w.state.customers)) ? w.state.customers : [];
    var newIds = {};
    list.forEach(function (c) { if (!c.id) c.id = 'cu_bl_' + c.code; newIds[c.id] = 1; });

    var ops = [];
    list.forEach(function (c) { ops.push({ t: 'set', o: c, key: COL + '/' + c.id }); });
    cur.forEach(function (c) { if (c && c.id && !newIds[c.id]) ops.push({ t: 'del', id: c.id, key: COL + '/' + c.id }); });

    overlay('<h3>送っています…</h3>' +
            '<div class="pi-bar"><span id="pi-bar"></span></div>' +
            '<div class="pi-stat" id="pi-stat">準備中…</div>');
    var bar = d.getElementById('pi-bar'), stat = d.getElementById('pi-stat');

    DB._applying = true;                       /* 送っている間は自動保存を止める */
    if (w.PitSync) w.PitSync.saving();

    var chunks = [];
    for (var i = 0; i < ops.length; i += CHUNK) chunks.push(ops.slice(i, i + CHUNK));
    var done = 0;

    chunks.reduce(function (p, group) {
      return p.then(function () {
        var batch = w.fb.db.batch();
        group.forEach(function (op) {
          DB._pending[op.key] = 1;
          var ref = DB._co().collection(COL).doc(op.t === 'del' ? op.id : op.o.id);
          if (op.t === 'del') batch.delete(ref); else batch.set(ref, DB._clean(op.o));
        });
        return batch.commit().then(function () {
          group.forEach(function (op) {
            if (op.t === 'del') delete DB._shadow.docs[op.key];
            else DB._shadow.docs[op.key] = DB._js(op.o);
            delete DB._pending[op.key];
          });
          done += group.length;
          var pct = Math.round(done / ops.length * 100);
          if (bar) bar.style.width = pct + '%';
          if (stat) stat.textContent = num(done) + ' / ' + num(ops.length) + ' 件（' + pct + '%）';
        });
      });
    }, Promise.resolve()).then(function () {
      w.state.customers = list;
      DB._applying = false;
      if (w.PitSync) w.PitSync.saved();
      try { if (w.pitLog) w.pitLog('顧客データの取込', { label: num(list.length) + '人／' + num(ops.filter(function (o) { return o.t === 'del'; }).length) + '人を削除', kind: 'import' }); } catch (e) {}
      close();
      try { if (w.state.currentView && w.showView) w.showView(w.state.currentView); } catch (e) {}
      var msg = 'お客様 ' + num(list.length) + '人を取り込みました（全員の画面に反映されます）';
      if (w.showToast) w.showToast(msg); else if (w.pitToast) w.pitToast(msg);
      console.log('[import-cloud] 取込完了', list.length);
    }).catch(function (e) {
      console.error('[import-cloud] 取込に失敗', e);
      DB._applying = false;
      if (w.PitSync) w.PitSync.failed();
      alertBox('途中で送れなくなりました（' + num(done) + ' 件まで送信済み）。通信を確認して、もう一度同じファイルでやり直してください。同じ人は上書きされるので、二重にはなりません。');
    });
  }

  /* ---------- 設定画面が描かれるたびに入口を足す ---------- */
  function hookRender() {
    if (typeof w.renderSettings !== 'function' || w.renderSettings.__pitImp) return false;
    var orig = w.renderSettings;
    var f = function () {
      var r = orig.apply(this, arguments);
      try { appendBox(); } catch (e) { console.warn('[import-cloud] 入口の追加でエラー', e); }
      return r;
    };
    f.__pitImp = 1;
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

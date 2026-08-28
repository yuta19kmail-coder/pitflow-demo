/* ========================================
   flow-pit.js  -  フロー（進捗ログ）の「足す／直す」を1か所に  PitFlow v1.43.0
   ----------------------------------------
   ◎なにをするもの（ゆうた指定）
     ・**用件を足すのは「カード詳細」のフロー欄**（チップをタップ／自由入力）。
     ・**「予約を編集」→フローは“本当の編集”**＝すでに入っている記録の
       **日時・担当を書き換える／消す**ところ。
     ・🔴 **編集ができるのは設定権限（PitFlow の役割＝管理）を持っている人だけ。**

   ◎なぜ1つのファイルにまとめたか
     フローは **3か所** から書かれていて、記録の形がバラバラだった。
       ① `logFlow()`      … { label, at:数値 }                （工程の自動記録）
       ② `logPhaseMove()` … { type:'phase', from, to, by, at:数値, atTxt:'M/D HH:MM' }
       ③ 手で足した記録   … { label, at:数値, staff, manual:true }
       ④ 予約詳細の一部   … { text, at:'M/D HH:MM'（**文字！**）, by }
     この違いを**読む側で吸収**しないと、日時を直した時に画面と食い違う。
     そこで「時刻の読み方（atMs）／時刻の書き方（setAt）／担当の読み書き」を
     **この1か所だけ**に置いた。**ここ以外で `e.at` を直接いじらないこと。**

   ◎決めごと
     🔴 **保存されるのは「言葉」だけ。** アイコンは描く時に付ける
        （v1.42.0 の不具合＝タグを文字で保存していた、の再発防止）。
     ⚠ 自動の工程記録（type:'phase' や 工程移動）も**日時・担当は直せる**が、
        **見出しの言葉は直せない**（工程そのものは工程で管理するため）。手で足した記録だけ言葉も直せる。
     ⚠ 消せるのは今までどおり**手で足した記録だけ**（自動の記録は残す）。
   ======================================== */
(function (w, d) {
  'use strict';

  /* ---------- よくあるアクション ----------
     🔴 ここに HTML（<i data-ic=…>）を書かないこと。印は `ic`（アイコン名）で持つ。 */
  var QUICK = [
    { ic: 'phone',     label: 'こちらから電話 → 留守（折り返し待ち）' },
    { ic: 'phone',     label: 'こちらから電話 → つながった' },
    { ic: 'phone',     label: 'お客様から入電' },
    { ic: 'car',       label: '来店・相談' },
    { ic: 'comment',   label: '見積りを連絡' },
    { ic: 'check',     label: '承認 OK' },
    { ic: 'hourglass', label: '部品待ち', size: 15 },
    { ic: 'calendar',  label: '日程を調整' }
  ];

  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function pad(n){ return String(n).padStart(2, '0'); }
  function card(id){ return (w.state && state.cards || []).find(function(x){ return x && x.id === id; }) || null; }

  /* ---------- 設定権限（管理）か ----------
     ⚠ サンプルモード（クラウド未接続）では今までどおり全部さわれる。 */
  function canEdit(){
    if (!w.PIT_CLOUD) return true;
    return !!(w.pitIsAdmin && w.pitIsAdmin());
  }

  /* ---------- 時刻を読む ----------
     数値（ms）／'YYYY-MM-DDTHH:MM'／'M/D HH:MM' のどれでも ms に。分からなければ null。 */
  function atMs(e){
    if (!e) return null;
    var v = e.at;
    if (typeof v === 'number' && isFinite(v)) return v;
    var s = String(v == null ? '' : v).trim();
    if (!s) s = String(e.atTxt || '').trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return +s;
    var t = new Date(s).getTime();
    if (!isNaN(t)) return t;
    /* 'M/D HH:MM' ＝ 年が入っていない古い書き方。今年として読む。 */
    var m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (m){
      var y = new Date().getFullYear();
      var dt = new Date(y, +m[1] - 1, +m[2], +(m[3] || 0), +(m[4] || 0), 0, 0);
      if (!isNaN(dt.getTime())) return dt.getTime();
    }
    return null;
  }
  /* 画面に出す時刻の文字（M/D HH:MM） */
  function atText(e){
    var ms = atMs(e);
    if (ms == null) return String((e && (e.atTxt || e.at)) || '');
    var dt = new Date(ms);
    return (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
  }
  /* <input type="datetime-local"> 用の 'YYYY-MM-DDTHH:MM' */
  function atInput(e){
    var ms = atMs(e);
    if (ms == null) return '';
    var dt = new Date(ms);
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + 'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
  }
  function nowInput(){
    var dt = new Date(); dt.setSeconds(0, 0);
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + 'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
  }

  /* ---------- 担当を読む ---------- */
  /* 🔴🔴 v2.22.0（2026-08-28・事故を受けて）**アプリが勝手にやったことは「自動」と出す。**
     🗣 ゆうた「自動処理にもかかわらず高橋が動かしたことになっている」
     ＝ 自動処理はその画面を開いた端末で走るので、**たまたまログインしていた人**の名前が
        押されていた。濡れ衣になるうえ、原因を探す時間まで奪う。
     ⚠ 端末は `dev` に残してあるが、**ここでは出さない**（出すと結局その人の名前が並ぶ）。
     🔴 「やった人」を答えるのはここ1本。画面ごとに `e.staff || e.by` と書き写さないこと。 */
  function byOf(e){
    if (e && e.auto) return '自動';
    return String((e && (e.staff || e.by)) || '');
  }

  /* 🔴 v1.55.0（ゆうた指定）**いま操作している人の名前**。
     ・アクション記録の担当は、開いた時点で**この名前が選ばれた状態**にする。
     ・連絡中→パーツ待ち のような**自動で入る記録にも、この名前を自動で入れる**。
     ⚠ 使うのは**呼び名（CoreMembers の表示名）**＝画面の担当セレクトや表紙印刷と同じ名前。
        本名を入れると「候補に無い名前」になって、担当が空欄に見えてしまう。
     ⚠ 名簿に居ないアカウントの時は、ログイン名をそのまま使う（空にしない）。
     🔴 **ここ以外で「操作した人」を組み立てないこと。** 物差しは1つ。 */
  function meName(){
    try { if (w.pitCurrentStaffName){ var n = pitCurrentStaffName(); if (n) return String(n); } } catch(err){}
    try { var m = w.fb && w.fb.currentMember; if (m && m.name) return String(m.name); } catch(err){}
    return '';
  }
  w.pitFlowMe = meName;
  /* ---------- 見出しの言葉を読む ----------
     ⚠ **素の文字**を返す（HTMLではない）。描く側で icoText()／esc() を通すこと。 */
  function textOf(e){ return String((e && (e.label || e.text)) || ''); }
  /* 直す入力欄に入れる文字＝タグを外した見たままの言葉。
     ⚠ v1.42.0 より前に保存された記録には `<i data-ic=…>` の文字が混ざっている。
        入力欄にそのまま出すと**タグが丸見え**になるので、ここで外す（保存側も setText で外す）。 */
  function plainText(e){ return textOf(e).replace(/<[^>]*>/g, '').trim(); }
  /* 工程の自動記録か＝見出しの言葉は直せない */
  function isPhase(e){ return !!(e && e.type === 'phase'); }
  /* 見出しに出す言葉（工程の記録は「前 → 後」に組み立てる）。
     🔴 工程の記録は label/text を持っていないので、textOf だけだと**見出しが空**になる。ここを通すこと。 */
  function titleOf(e){
    if (isPhase(e)){
      var sl = w.statusLabel || function(x){ return x; };
      return e.from ? (sl(e.from) + ' → ' + sl(e.to)) : (sl(e.to) + ' へ');
    }
    return textOf(e);
  }
  /* 手で足した記録か＝消せる・言葉も直せる */
  function isManual(e){ return !!(e && e.manual); }

  /* ===================================================================
     🪜🪜 v2.22.0（2026-08-28・ゆうた指定）**フローは「大きい節目」を主役にして、
     　　 そのあいだに起きた細かいことは畳む。**
     -------------------------------------------------------------------
     🗣「車ごとのフローは大きなところ**フェーズ移動とか**を表示して、
     　　**その中で起きた細かいところはそのフロー部分を展開できるように**したいな」

     ◎なぜ要るか
       v2.22.0 で「予約カードの中身を直したら記録を残す」を入れた＝**行が一気に増える**。
       全部を同じ大きさで並べると、**いちばん見たい節目（入庫・完TEL・返車）が埋もれる。**
       ＝ 節目だけ並べて、そのあいだの細かい行は **▸ で開く**。

     ◎大きい＝節目（そのまま出す）
       ・フェーズ移動（type:'phase'）
       ・入庫／完TEL／返車／実績／キャンセル／アーカイブ／承認 まわり（下の MAJOR_RE）
     ◎細かい＝畳む
       ・「編集：…」（欄の書き換え）・PIT配置図の出し入れ・手で足した用件 など

     🔴 **大きいか細かいかを決めるのはここ1本。** 画面ごとに文字列で判定しない
     　 （増やす時はここへ足す＝当日ビューでも同じ答えになる）。
     ⚠ 迷ったら「大きい」に倒す。**畳んで見えなくなるほうが事故る。**
     =================================================================== */
  /* 🔴🔴 **畳むのは「v2.22.0 で増やした細かい記録」だけ。それ以外は全部そのまま出す。**
     ⚠ 最初は「大きいものの一覧」で判定していたが、**手で足した用件**（人がわざわざ残したもの）や
     　 **古い形の記録**まで畳んでしまい、詳細から消せる ✕ が出なくなった（見張り2本が落ちた）。
     　 ＝ **止める側を数える。** 迷ったら大きい＝そのまま出す。
     ⚠ 畳む種類を増やす時は、ここに1行足す。**画面ごとに文字列で判定しないこと。** */
  var MINOR_RE = /^(編集：|PIT配置図)/;
  function isMajor(e){
    if (!e) return true;
    if (e.type === 'phase') return true;                 /* フェーズ移動は必ず節目 */
    if (isManual(e)) return true;                        /* 人が手で足した用件＝残したくて残したもの */
    return !MINOR_RE.test(String(e.label || e.text || ''));
  }
  w.pitFlowIsMajor = isMajor;

  /* 並んだ記録を「節目＋そのあとに起きた細かいこと」の束にする。
     ⚠ 最初の節目より前にある細かい行は、**捨てない**＝先頭の束（head:null）に入れて必ず出す。 */
  function group(log){
    var out = [], cur = null;
    (log || []).forEach(function (e, i) {
      if (isMajor(e)) { cur = { head: e, i: i, kids: [] }; out.push(cur); }
      else if (cur)   { cur.kids.push({ e: e, i: i }); }
      else            { out.push(cur = { head: null, i: i, kids: [{ e: e, i: i }] }); }
    });
    return out;
  }
  w.pitFlowGroup = group;


  /* ===================================================================
     📅 v1.58.0（ゆうた指定）**フローの記録を「本当に動いた実データ」として扱う。**
     -------------------------------------------------------------------
     ◎ゆうたの言葉
       「**各フローの編集は実際のデータとして扱ってほしい。
         例えば見積もり中に入れた日を変えたら、見積もりフェーズのカウント日数自体を改めてほしい**」
     ◎これまで
       「いまの工程に入った時刻」は **`card.phaseAt`** に持っていた。
       これは**工程を動かした瞬間に書いた写し**で、**フローの日時を直しても変わらない**。
       ＝フローを直しても「◯日目」が動かなかった。**写しを作ると片方だけ直って食い違う**、いつもの罠。
     ◎これから
       🔴 **フローの記録（`type:'phase'` で `to` がいまの工程のもの）を先に見る。**
          直せばそのまま日数に効く。
       ⚠ `phaseAt` は**記録を持たない古いカードのための予備**に降格（消しはしない）。
       ⚠ フローを直した時は `phaseAt` も**書き直して揃える**（下の `syncPhaseAt`）＝
          まだ写しを直接見ている所が残っていても食い違わない。
     ⚠ 日数の数え方（何日目とするか）は**画面ごとの決めごと**なので、ここでは
        **「入った時刻(ms)」だけ**を返す。各画面は今までどおりの数え方を続ける。
     =================================================================== */
  function phaseStartMs(c){
    if (!c) return null;
    var log = Array.isArray(c.log) ? c.log : [];
    var st  = String(c.status || '');
    for (var i = log.length - 1; i >= 0; i--){
      var e = log[i];
      if (e && e.type === 'phase' && e.to === st){
        var ms = atMs(e);
        if (ms != null) return ms;
      }
    }
    if (c.phaseAt) return +c.phaseAt;                       /* 記録が無い古いカード */
    if (c.reserveDate){
      var d = new Date(String(c.reserveDate) + 'T00:00:00');
      if (!isNaN(d.getTime())) return d.getTime();          /* それも無ければ入庫日 */
    }
    return null;
  }
  w.pitPhaseStartMs = phaseStartMs;

  /* 🔴 v1.72.0 「その工程に入ったのはいつか」を、いまの工程以外にも聞けるようにした。
     売上サマリーの「作業待ち → 作業完了 → 確定返車日」の日数がこれを使う。
     ⚠ 何度も行き来したカードは **最後に入った時**を返す（`phaseStartMs` と同じ数え方）。
     ⚠ 記録が無ければ null。**入庫日で代用しない**（代用すると「0日で終わった」という嘘の数字になる）。 */
  function phaseEnteredMs(c, status){
    if (!c || !status) return null;
    var log = Array.isArray(c.log) ? c.log : [];
    for (var i = log.length - 1; i >= 0; i--){
      var e = log[i];
      if (e && e.type === 'phase' && e.to === status){
        var ms = atMs(e);
        if (ms != null) return ms;
      }
    }
    /* 記録が無い古いカードでも、**いまその工程にいる**なら写しが使える */
    if (String(c.status || '') === String(status) && c.phaseAt) return +c.phaseAt;
    return null;
  }
  w.pitPhaseEnteredMs = phaseEnteredMs;

  /* フローを直したあと、写し（phaseAt）を記録に合わせて書き直す。
     🔴 **記録が正・写しが従。** 逆にしないこと。 */
  function syncPhaseAt(c){
    if (!c) return;
    var ms = phaseStartMs(c);
    if (ms != null) c.phaseAt = ms;
  }
  w.pitSyncPhaseAt = syncPhaseAt;

  /* ---------- 保存して描き直す ---------- */
  function save(){ try { if (w.PitDB) PitDB.save(); } catch(err){} }
  /* いま開いている画面のフローの面だけ描き直す（タブや位置を保ったまま）。 */
  function repaint(){
    try { if (w.cvFlowRepaint) cvFlowRepaint(); } catch(err){}
    try { if (w.cfFlowRepaint) cfFlowRepaint(); } catch(err){}
  }
  /* 🔴 v1.58.0 「◯日目」は**背後の一覧（タスクボード・予約ビュー・外注）にも出ている**。
     フローを直したらそちらも描き直さないと、**同じカードで数字が2つ**になる。 */
  function refreshViews(){
    try { if (w.showView && w.state && state.currentView) showView(state.currentView); } catch(err){}
  }

  /* ---------- 足す ----------
     ns ＝ 入力欄の id の前置き。詳細（'cv'）と編集（'cf'）で id がぶつからないように分ける。 */
  /* 前に選んだ担当を覚えておく。⚠ まだ何も選んでいない時は**自分**を既定にする（v1.55.0） */
  var _lastStaff = '';
  function defaultStaff(){ return _lastStaff || meName(); }
  function metaOf(ns){
    var sEl = d.getElementById(ns + '-flow-staff');
    var wEl = d.getElementById(ns + '-flow-when');
    var at = Date.now();
    if (wEl && wEl.value){ var t = new Date(wEl.value).getTime(); if (!isNaN(t)) at = t; }
    return { staff: (sEl ? sEl.value : ''), at: at };
  }
  function add(cardId, text, ns){
    var c = card(cardId); if (!c) return false;
    text = String(text == null ? '' : text).trim(); if (!text) return false;
    var m = metaOf(ns || 'cv');
    if (!Array.isArray(c.log)) c.log = [];
    /* 🔴 保存するのは**言葉だけ**（アイコンのタグは入れない） */
    c.log.push({ label: text, at: m.at, manual: true, staff: m.staff || '' });
    _lastStaff = m.staff || '';
    save(); repaint();
    return true;
  }
  function addQuick(cardId, i, ns){ var q = QUICK[i]; return q ? add(cardId, q.label, ns) : false; }
  function addCustom(cardId, ns){
    ns = ns || 'cv';
    var inp = d.getElementById(ns + '-flow-input'); if (!inp) return false;
    var v = String(inp.value || '').trim();
    if (!v){ inp.focus(); return false; }
    inp.value = '';
    return add(cardId, v, ns);
  }
  function setNow(ns){ var el = d.getElementById((ns || 'cv') + '-flow-when'); if (el) el.value = nowInput(); }

  /* ---------- 直す（設定権限のある人だけ） ---------- */
  function setAt(cardId, i, v){
    if (!canEdit()) return false;
    var c = card(cardId); if (!c || !Array.isArray(c.log)) return false;
    var e = c.log[i]; if (!e) return false;
    var t = new Date(String(v || '')).getTime();
    if (isNaN(t)) return false;
    e.at = t;
    /* 🔴 atTxt を持っている記録は、そちらも合わせて書き換える（画面が食い違うため） */
    if ('atTxt' in e) e.atTxt = atText({ at: t });
    /* 🔴 v1.58.0 工程の記録を直したら、**「◯日目」の起点も改める**（ゆうた指定）。
       写し（phaseAt）を記録に合わせて書き直す。 */
    syncPhaseAt(c);
    save(); repaint(); refreshViews();
    return true;
  }
  function setBy(cardId, i, v){
    if (!canEdit()) return false;
    var c = card(cardId); if (!c || !Array.isArray(c.log)) return false;
    var e = c.log[i]; if (!e) return false;
    v = String(v == null ? '' : v);
    /* もともと持っていたキーに合わせる（両方あれば両方） */
    if ('staff' in e || !('by' in e)) e.staff = v;
    if ('by' in e) e.by = v;
    save(); repaint();
    return true;
  }
  function setText(cardId, i, v){
    if (!canEdit()) return false;
    var c = card(cardId); if (!c || !Array.isArray(c.log)) return false;
    /* ⚠ 言葉を直せるのは**手で足した記録だけ**。工程・自動の記録の見出しは工程で決まるので触らせない
       （画面側も手記録の行にしか入力欄を出していない＝ここと揃えること）。 */
    var e = c.log[i]; if (!e || !isManual(e)) return false;
    /* 🔴 保存するのは言葉だけ＝タグは受け付けない */
    v = String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
    if (!v) return false;
    if ('label' in e || !('text' in e)) e.label = v;
    if ('text' in e) e.text = v;
    save(); repaint();
    return true;
  }
  function del(cardId, i){
    var c = card(cardId); if (!c || !Array.isArray(c.log)) return false;
    var e = c.log[i]; if (!e) return false;
    /* 手で足した記録は今までどおり誰でも消せる。自動の記録は設定権限のある人だけ。 */
    if (!isManual(e) && !canEdit()) return false;
    c.log.splice(i, 1);
    /* 🔴 v1.58.0 工程の記録を消した時も起点を改める（1つ前の記録が起点になる） */
    syncPhaseAt(c);
    save(); repaint(); refreshViews();
    return true;
  }

  /* ---------- 「アクションを記録」の見た目 ----------
     詳細（ns='cv'）と編集（ns='cf'）で同じ形を使う。 */
  function addHtml(c, ns){
    ns = ns || 'cv';
    var h = '<div class="pf-flowadd" data-ns="' + esc(ns) + '">';
    h += '<div class="pf-flowlabel">アクションを記録（チップをタップ／自由入力で追加）</div>';
    h += '<div class="pf-flowmeta">';
    /* 🔴 v1.55.0 開いた時点で**自分が選ばれた状態**にする（ゆうた指定）。
       ⚠ 名簿に自分が居ない時のために、居なければ選択肢の先頭に足してから選ぶ＝**空欄にしない**。 */
    var _cur = defaultStaff();
    var _names = ((w.state && state.staff) || []).map(function(s){ return s.name; }).filter(Boolean);
    if (_cur && _names.indexOf(_cur) < 0) _names.unshift(_cur);
    h += '<select id="' + ns + '-flow-staff" class="pf-fin" title="担当者"><option value="">担当 ―</option>';
    _names.forEach(function(nm){
      h += '<option value="' + esc(nm) + '"' + (nm === _cur ? ' selected' : '') + '>' + esc(nm) + '</option>';
    });
    h += '</select>';
    h += '<input id="' + ns + '-flow-when" class="pf-fin pf-flowwhen" type="datetime-local" value="' + nowInput() + '" title="記録時刻（既定は今・昨日の留守などはここを変更）">';
    h += '<button type="button" class="pf-flownow" onclick="pitFlowNow(\'' + ns + '\')" title="時刻を今に戻す">今</button>';
    h += '</div>';
    h += '<div class="pf-flowquick">';
    QUICK.forEach(function(q, i){
      var qi = (w.ico ? ico(q.ic, q.size || 16) : '');
      h += '<button type="button" class="pf-flowchip cf-flowchip" onclick="pitFlowQuick(\'' + esc(c.id) + '\',' + i + ',\'' + ns + '\')">' + qi + ' ' + esc(q.label) + '</button>';
    });
    h += '</div>';
    h += '<div class="pf-flowcustom">';
    h += '<input id="' + ns + '-flow-input" class="pf-fin" placeholder="その他（自由入力）例：代車の件で連絡待ち" '
       + 'onkeydown="if(event.key===\'Enter\'){event.preventDefault();pitFlowCustom(\'' + esc(c.id) + '\',\'' + ns + '\');}">';
    h += '<button type="button" class="pf-flowaddbtn" onclick="pitFlowCustom(\'' + esc(c.id) + '\',\'' + ns + '\')">＋ 追加</button>';
    h += '</div>';
    h += '</div>';
    return h;
  }

  /* ---------- 「本当の編集」の表（設定権限のある人だけ） ----------
     新しい順（下が古い）で、日時・担当・言葉・消す をその場で直せる。 */
  /* 担当の選択肢。⚠ 名簿に居ない名前（辞めた人など）が入っていても消えないよう、
     その名前を選択肢に足してから選ぶ＝**開いただけで担当が消える事故を防ぐ**。 */
  function staffOpts(cur){
    cur = String(cur || '');
    var names = ((w.state && state.staff) || []).map(function(s){ return s.name; }).filter(Boolean);
    if (cur && names.indexOf(cur) < 0) names.unshift(cur);
    var h = '<option value=""' + (cur ? '' : ' selected') + '>担当 ―</option>';
    names.forEach(function(n){
      h += '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>';
    });
    return h;
  }
  function editHtml(c){
    var log = (c && Array.isArray(c.log)) ? c.log : [];
    var h = '<div class="pf-flowedit">';
    if (!log.length){ return h + '<div class="pf-flowempty">記録はまだありません。用件の追加は「カード詳細」のフロー欄からどうぞ。</div></div>'; }
    /* 新しい順に出すが、書き換えは**元の並びの番号**で行う（並べ替えても迷子にならない） */
    log.map(function(e, i){ return { e: e, i: i }; }).reverse().forEach(function(r){
      var e = r.e, i = r.i;
      var ttl = titleOf(e);
      var kind = isPhase(e) ? '工程' : (isManual(e) ? '手記録' : '自動');
      h += '<div class="pf-ferow" data-i="' + i + '">';
      h += '<div class="pf-fetop"><span class="pf-fekind pf-fekind-' + (isManual(e) ? 'man' : 'auto') + '">' + esc(kind) + '</span>';
      if (isPhase(e) || !isManual(e)){
        h += '<span class="pf-fettl">' + (w.icoText ? icoText(ttl) : esc(ttl)) + '</span>';
      } else {
        h += '<input class="pf-fin pf-fettlin" type="text" value="' + esc(plainText(e)) + '" title="記録の言葉"'
           + ' onchange="pitFlowSetText(\'' + esc(c.id) + '\',' + i + ',this.value)">';
      }
      h += '<button type="button" class="pf-fedel" title="この記録を消す" onclick="pitFlowDel(\'' + esc(c.id) + '\',' + i + ')">' + (w.ico ? ico('trash', 15) : '×') + '</button>';
      h += '</div>';
      h += '<div class="pf-febot">';
      h += '<label class="pf-fef"><span>日時</span><input class="pf-fin" type="datetime-local" value="' + esc(atInput(e)) + '"'
         + ' onchange="pitFlowSetAt(\'' + esc(c.id) + '\',' + i + ',this.value)"></label>';
      h += '<label class="pf-fef"><span>担当</span><select class="pf-fin" onchange="pitFlowSetBy(\'' + esc(c.id) + '\',' + i + ',this.value)">'
         + staffOpts(byOf(e)) + '</select></label>';
      if (e.amount != null && e.amount !== ''){
        h += '<span class="pf-feamt">' + esc(e.amountKind || '') + ' ¥' + Number(e.amount).toLocaleString() + '</span>';
      }
      h += '</div></div>';
    });
    return h + '</div>';
  }

  /* ---------- 画面から呼ぶ入口 ---------- */
  w.pitFlowQuick   = function(id, i, ns){ addQuick(id, i, ns); };
  w.pitFlowCustom  = function(id, ns){ addCustom(id, ns); };
  w.pitFlowNow     = function(ns){ setNow(ns); };
  w.pitFlowSetAt   = function(id, i, v){ setAt(id, i, v); };
  w.pitFlowSetBy   = function(id, i, v){ setBy(id, i, v); };
  w.pitFlowSetText = function(id, i, v){ setText(id, i, v); };
  w.pitFlowDel     = function(id, i){ del(id, i); };

  w.PitFlowLog = {
    QUICK: QUICK,
    canEdit: canEdit,
    atMs: atMs, atText: atText, atInput: atInput, nowInput: nowInput,
    byOf: byOf, textOf: textOf, titleOf: titleOf, plainText: plainText, isPhase: isPhase, isManual: isManual,
    add: add, addQuick: addQuick, addCustom: addCustom,
    setAt: setAt, setBy: setBy, setText: setText, del: del,
    addHtml: addHtml, editHtml: editHtml, repaint: repaint
  };
  console.log('[flow-pit] ready（フローの足す／直す）');
})(window, document);

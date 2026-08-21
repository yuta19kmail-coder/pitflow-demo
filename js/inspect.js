/* ========================================
   inspect.js  -  🩺 点検（健康診断）の**画面**  PitFlow v1.168.0
   ----------------------------------------
   ◎ここが受け持つこと＝**並べて見せるだけ。**
     🔴 何が「おかしい」かの判定は **js/inspect-rules.js の規則表1本**。
        ここに条件を1行も書かないこと（画面と規則が食い違ったら、直しようがなくなる）。
     ・重さ（要対応／確認／気づき）と分類の**名前も色もあちらの表から引く**。ここで綴らない。

   ◎使い方（ゆうた）
     ① 左のメニュー「点検」を開く → その場で全カードを見て、気になる所を並べます
     ② 1件ずつ、右のボタンで札を貼れます
          見た … 目は通した。まだ直していない（次も出る）
          これは仕様 … うちではこれで正しい（次から**この1件だけ**出さない）
          直した … 直した（次の点検で自然に消える）
     ③ 「この規則は出さない」＝その**規則まるごと**黙らせる（あとで戻せます）
     ④ 「書き出し」＝②の突合・③のAI判断へ渡す JSON を落とします

   ⚠ 点検は**1文字も書き換えません**（札の記録だけ）。読んで、数えて、並べるだけ。
   ======================================== */
(function () {
  'use strict';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function man(n){ var m = (+n||0)/10000; return (Math.abs(m)>=100 ? Math.round(m) : Math.round(m*10)/10).toLocaleString() + '万'; }

  /* 画面の覚え（絞り込みと、開いている規則）。⚠ データではないので保存しない */
  var UI = window._insp = window._insp || { level:'', cat:'', done:false, open:{}, all:{}, res:null };
  if (!UI.all) UI.all = {};
  var ROWS_CAP = 20;   /* 1つの規則で最初に出す件数（超えたぶんは「ほか◯件」で開く） */

  function cats(){ return window.PIT_INSPECT_CATS || []; }
  function levels(){ return window.PIT_INSPECT_LEVELS || []; }
  function markDefs(){ return window.PIT_INSPECT_MARKS || []; }
  function rules(){ return window.PIT_INSPECT_RULES || []; }
  function ruleById(id){ return rules().filter(function(r){ return r.id === id; })[0] || {}; }
  function levelOf(id){ return levels().filter(function(l){ return l.id === id; })[0] || {}; }
  function catOf(id){ return cats().filter(function(c){ return c.id === id; })[0] || {}; }

  /* ===== 点検する（データは触らない） ===== */
  function run(){
    UI.res = window.pitInspectRun ? window.pitInspectRun() : null;
    return UI.res;
  }

  window.renderInspect = function () {
    var body = document.getElementById('inspect-body');
    if (!body) return;
    if (!window.pitInspectRun){
      body.innerHTML = '<div class="ins-empty">点検の規則が読み込めていません。画面を開き直してください。</div>';
      return;
    }
    var res = run();
    var mutes = (window.state && state.inspectMutes) || {};

    /* ---- 絞り込みを通したあとの所見 ---- */
    var list = res.findings.filter(function (f) {
      if (!UI.done && f.mark) return false;             /* 札を貼ったものは既定で隠す */
      if (UI.level && f.level !== UI.level) return false;
      if (UI.cat && f.cat !== UI.cat) return false;
      return true;
    });

    var h = '';

    /* ===== 上の帯（いつ・何台・いくつ） ===== */
    h += '<div class="ins-head">'
       +   '<div class="ins-when">' + esc(res.today) + ' の点検 ／ 対象 <b>' + res.cards + '</b>台 ／ 規則 <b>' + res.rules + '</b>本'
       +     (res.muted ? ' ／ 黙らせている規則 ' + res.muted + '本' : '')
       +   '</div>'
       +   '<div class="ins-actions">'
       +     '<button class="ins-btn" onclick="renderInspect()">もう一度点検</button>'
       +     '<button class="ins-btn" onclick="pitInspectDownload()">書き出し</button>'
       +   '</div>'
       + '</div>';

    /* ===== 重さのタイル（押すと絞り込み） ===== */
    h += '<div class="ins-tiles">';
    levels().forEach(function (l) {
      var v = res.byLevel[l.id] || { n:0, open:0 };
      h += '<button class="ins-tile' + (UI.level === l.id ? ' on' : '') + '"'
         +   ' style="--ins-c:' + l.color + '" onclick="pitInspectFilter(\'level\',\'' + l.id + '\')">'
         +   '<span class="ins-tile-n">' + v.open + '</span>'
         +   '<span class="ins-tile-l">' + esc(l.label) + '</span>'
         +   '<span class="ins-tile-note">' + esc(l.note) + '</span>'
         + '</button>';
    });
    h += '<div class="ins-tile-sum">'
       +   '片づけた（見た・仕様・直した）<b>' + res.marked + '</b>件'
       + '</div>';
    h += '</div>';

    /* ===== 分類のタブ ＋ 片づけたものも見る ===== */
    h += '<div class="ins-bar">'
       +   '<button class="ins-tab' + (UI.cat === '' ? ' on' : '') + '" onclick="pitInspectFilter(\'cat\',\'\')">すべて</button>';
    cats().forEach(function (c) {
      var v = res.byCat[c.id] || { n:0, open:0 };
      h += '<button class="ins-tab' + (UI.cat === c.id ? ' on' : '') + '" title="' + esc(c.note) + '"'
         +   ' onclick="pitInspectFilter(\'cat\',\'' + c.id + '\')">' + esc(c.label)
         +   '<span class="ins-tab-n">' + v.open + '</span></button>';
    });
    h += '<label class="ins-chk"><input type="checkbox"' + (UI.done ? ' checked' : '')
       +   ' onchange="pitInspectToggleDone(this.checked)"> 片づけたものも見る</label>';
    h += '</div>';

    /* ===== 中身（規則ごとにまとめる） ===== */
    if (!list.length){
      h += '<div class="ins-ok">'
         +   '<b>気になるところはありません。</b>'
         +   '<span>' + (UI.level || UI.cat ? 'いまの絞り込みでは 0件です。' : 'いま見ている ' + res.cards + '台に、規則にひっかかる車はありませんでした。') + '</span>'
         + '</div>';
    } else {
      var groups = [], byRule = {};
      list.forEach(function (f) {
        if (!byRule[f.ruleId]) { byRule[f.ruleId] = []; groups.push(f.ruleId); }
        byRule[f.ruleId].push(f);
      });
      groups.forEach(function (rid) {
        var fs = byRule[rid], r0 = fs[0], lv = levelOf(r0.level), ct = catOf(r0.cat);
        var open = (UI.open[rid] !== false);       /* 既定は開いておく（見落とさないように） */
        h += '<section class="ins-g' + (open ? '' : ' shut') + '" style="--ins-c:' + lv.color + '">'
           +   '<div class="ins-g-h" onclick="pitInspectOpen(\'' + rid + '\')">'
           +     '<span class="ins-g-lv">' + esc(lv.label) + '</span>'
           +     '<span class="ins-g-t">' + esc(r0.title) + '</span>'
           +     '<span class="ins-g-cat">' + esc(ct.label) + '</span>'
           +     '<span class="ins-g-n">' + fs.length + '件</span>'
           +     '<span class="ins-g-x">' + (open ? '▾' : '▸') + '</span>'
           +   '</div>';
        if (open){
          h += '<div class="ins-g-why">'
             +   '<div><b>なぜ出したか</b>' + esc(r0.why) + '</div>'
             +   '<div><b>どうする</b>' + esc(r0.fix) + '</div>'
             +   '<button class="ins-mute" onclick="pitInspectMuteUI(\'' + rid + '\')">'
             +     (mutes[rid] ? 'この規則をまた出す' : 'この規則は出さない（うちはこれで正しい）') + '</button>'
             + '</div>';
          /* 🔴 1つの規則で何百件も出ることがある（古いデータの抜けなど）。
             全部そのまま並べると**画面が使えなくなり、ほかの規則が見えなくなる**ので、
             最初は上から少しだけ出して、押した時だけ全部出す。
             ⚠ 隠した件数は必ず言う（黙って切り捨てない）。 */
          var cap = (UI.all[rid] ? fs.length : ROWS_CAP);
          h += '<div class="ins-rows">';
          fs.slice(0, cap).forEach(function (f) { h += row(f); });
          h += '</div>';
          if (fs.length > cap){
            h += '<button class="ins-more" onclick="pitInspectAll(\'' + rid + '\')">'
               +   'ほか ' + (fs.length - cap) + '件を出す</button>';
          } else if (UI.all[rid] && fs.length > ROWS_CAP){
            h += '<button class="ins-more" onclick="pitInspectAll(\'' + rid + '\')">上の ' + ROWS_CAP + '件だけにする</button>';
          }
        }
        h += '</section>';
      });
    }

    body.innerHTML = h;
    if (window.pitIcons) try { pitIcons(body); } catch(e){}
  };

  /* 1件ぶんの行 */
  function row(f){
    var mk = markDefs().filter(function(m){ return m.id === f.mark; })[0];
    var who = esc(f.name || '');
    var sub = [];
    if (f.car)   sub.push(esc(f.car));
    if (f.plate) sub.push(esc(f.plate));
    if (f.state) sub.push(esc(f.state));
    if (f.div)   sub.push(esc(f.div));
    if (f.amount) sub.push(man(f.amount));
    if (f.resNo) sub.push('No.' + esc(f.resNo));

    var h = '<div class="ins-row' + (f.mark ? ' done' : '') + '">'
          +   '<div class="ins-row-m">'
          +     '<div class="ins-row-who">' + who + (mk ? '<span class="ins-badge">' + esc(mk.label) + '</span>' : '') + '</div>'
          +     (sub.length ? '<div class="ins-row-sub">' + sub.join('　/　') + '</div>' : '')
          +     '<div class="ins-row-txt">' + esc(f.text) + '</div>'
          +   '</div>'
          +   '<div class="ins-row-b">';
    if (f.kind === 'card' && f.refId) h += '<button class="ins-open" onclick="pitInspectGo(\'' + esc(f.refId) + '\')">開く</button>';
    if (f.kind === 'veh')             h += '<button class="ins-open" onclick="showView(\'fleet\')">車両管理</button>';
    markDefs().forEach(function (m) {
      h += '<button class="ins-mk' + (f.mark === m.id ? ' on' : '') + '" title="' + esc(m.note) + '"'
         +   ' onclick="pitInspectMarkUI(\'' + esc(f.key) + '\',\'' + m.id + '\')">' + esc(m.label) + '</button>';
    });
    h += '</div></div>';
    return h;
  }

  /* ===== ボタンの受け口 ===== */
  window.pitInspectFilter = function (kind, v) {
    if (kind === 'level') UI.level = (UI.level === v ? '' : v);
    else UI.cat = v;
    renderInspect();
  };
  window.pitInspectToggleDone = function (on) { UI.done = !!on; renderInspect(); };
  window.pitInspectOpen = function (rid) { UI.open[rid] = (UI.open[rid] === false); renderInspect(); };
  window.pitInspectAll = function (rid) { UI.all[rid] = !UI.all[rid]; renderInspect(); };

  window.pitInspectMarkUI = function (key, v) {
    var cur = (window.state && state.inspectMarks && state.inspectMarks[key] && state.inspectMarks[key].v) || '';
    window.pitInspectMark(key, cur === v ? '' : v);   /* もう一度押したらはがす */
    renderInspect();
  };

  window.pitInspectMuteUI = function (rid) {
    var on = !!((window.state && state.inspectMutes) || {})[rid];
    if (on) { window.pitInspectMute(rid, false); renderInspect(); return; }
    var r = ruleById(rid);
    var ask = window.pitAsk ? pitAsk : function (m, o) { return Promise.resolve(true); };
    ask('この規則を出さないようにしますか？', {
      title: r.title || '規則を黙らせる',
      detail: '「' + (r.title || rid) + '」を、これから点検で出さなくなります。\n'
            + 'うちのやり方ではこれで正しい、という時に使ってください。\n\n'
            + '⚠ あとから同じ場所の「この規則をまた出す」で戻せます。',
      ok: '出さないようにする', cancel: 'やめる'
    }).then(function (yes) {
      if (!yes) return;
      window.pitInspectMute(rid, true);
      renderInspect();
    });
  };

  /* カードを開く。⚠ 開き方は card-detail.js の1本（ここで窓を作らない） */
  window.pitInspectGo = function (id) { if (window.openDetail) openDetail(id); };

  /* ②突合・③AI判断へ渡す JSON を落とす */
  window.pitInspectDownload = function () {
    var out = window.pitInspectExport(UI.res || run());
    var name = 'PitFlow点検_' + out.今日 + '.json';
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    if (window.pitToast) pitToast(name + ' を書き出しました');
  };
})();

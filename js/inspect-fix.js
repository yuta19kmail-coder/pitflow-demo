/* ========================================
   inspect-fix.js  -  🩺 データチェックの「ここを直す」  PitFlow v1.170.0
   ================================================================================
   ◎なぜ作ったか（2026-08-22・ゆうた指定）
     🗣「大きな変化で、ここからは**アーカイブ車両であっても、該当箇所だけは修正を
        だれでもかけられる**ようにしたい／**ほかの箇所は触れない**／
        **確定金額と確定日だけはこれまで通り管理者のみ**」

     ◎なにが困っていたか
       本番 377台のデータチェックで出た所見 260件のうち、**129件が返車の済んだ車**だった。
       アーカイブまで行った車は「管理者以外は触れない」ので、
       **抜けているのが分かっているのに、誰も直せない**状態だった。
       ＝ 直せないものが毎回出続けて、**いま動かせる車が埋もれる**。

   ◎この仕組みの考え方（いちばん大事）
     🔴🔴 **開くのはカードではなく「指摘された欄」だけ。**
        カード詳細をアーカイブ済みでも開けるようにする、のではない。
        データチェックが「ここが空です」と言った**その欄だけ**を小窓に出して直す。
        ＝ ほかの欄は**画面に出てこない**ので、触れない（ゆうた指定そのまま）。
     🔴🔴 **確定金額（amountFinal）と確定日（completedAt / returnDateFinal）は管理者だけ。**
        物差しは **card-view.js の `pitCanEditFinal()` を借りる**（＝`pitIsAdmin()` の1本）。
        ⚠ ここに `pitIsAdmin()` を書き写さないこと。書き写した日から、片方だけ直る事故が始まる。
     🔴 **どの規則が、どの欄を指しているか**は下の `RULE_FIX` 表1本。
        規則を足したら**ここにも1行足す**（足さなければ「ここを直す」が出ないだけ＝黙って壊れない）。

   ◎ここが返すもの
     pitFixFieldsFor(finding) … その所見で直せる欄の一覧（[] なら「ここを直す」を出さない）
     pitFixOpen(key)          … 小窓を開く（key＝所見の key＝規則ID:対象ID）
     PIT_FIX_FIELDS           … 欄の表（見張りが読む）
     PIT_RULE_FIX             … 規則→欄の表（見張りが読む）

   ⚠ 読み込みは card-miss.js / card-view.js / inspect-rules.js より後ろ、inspect.js より前。
   ================================================================================ */
(function (w) {
  'use strict';

  function t(v){ return String(v == null ? '' : v).trim(); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function num(v){ v = +String(v==null?'':v).replace(/[^0-9\-]/g,''); return isFinite(v) ? v : 0; }
  function st(){ return (w.state || {}); }

  /* 選べるものの一覧は**設定の表から引く**（ここで「待・当・預」と綴らない） */
  function optsDrop(){ return (st().dropTypes || []).map(function(x){ return { id:x.id, label:x.label }; }); }
  function optsRepeat(){ return (st().repeatTypes || []).map(function(x){ return { id:x.id, label:x.label }; }); }
  function optsWork(){ return (st().workTypes || []).filter(function(x){ return !x.combinable; })
                              .map(function(x){ return { id:x.id, label:x.label }; }); }
  function optsBoard(){ return (st().boards || []).map(function(b){ return { id:b.id, label:b.name || b.id }; }); }
  /* フロント担当＝メンバーの表から。⚠ 「front」の見分けはメンバー設定の持ち物（ここで決めない） */
  function optsFront(){ return (st().staff || []).filter(function(x){ return x && x.front; })
                               .map(function(x){ return { id:x.name, label:(w.pitStaffCall ? w.pitStaffCall(x.name) : x.name) }; }); }

  /* ================================================================
     1. 直せる欄の表（🔴 ここ1本。画面で欄を組み立てない）
     ----------------------------------------------------------------
       id     … 欄の名前（＝カードの持ち物の名前。card-miss.js の key と揃える）
       label  … 人に見せる名前
       type   … text / textarea / date / time / money / tel / pick
       admin  … true ＝ **管理者だけ**（確定金額・確定日）
       hint   … 小窓に出す一言
       get/set… カードとのやりとり（入れ子の欄はここで吸収する）
     ================================================================ */
  var FIELDS = [
    /* ---- お客様・車 ---- */
    { id:'customer',   label:'お客様名（漢字）', type:'text',  hint:'車検証のとおりに' },
    { id:'kana',       label:'カナ',            type:'text',  hint:'カタカナで' },
    { id:'tel',        label:'TEL',             type:'tel',   hint:'数字とハイフンだけ' },
    { id:'plate',      label:'ナンバー',        type:'text',  hint:'例）品川 300 あ 12-34' },
    { id:'maker',      label:'メーカー',        type:'text',  hint:'例）トヨタ' },
    { id:'car',        label:'車種（グレード）', type:'text' },
    { id:'menu',       label:'作業内容',        type:'textarea' },
    { id:'resNo',      label:'予約番号',        type:'text' },
    { id:'repeat',     label:'初回／リピーター', type:'pick', opts: optsRepeat },
    { id:'boardId',    label:'国産車／輸入車',   type:'pick', opts: optsBoard },
    { id:'dropType',   label:'受付タイプ',      type:'pick',  opts: optsDrop },
    { id:'workType',   label:'作業タイプ',      type:'pick',  opts: optsWork },
    { id:'frontStaff', label:'フロント担当',    type:'pick',  opts: optsFront,
      hint:'フロント別の売上は、ここで決まります' },

    /* ---- 日付 ---- */
    { id:'reserveDate', label:'入庫日',        type:'date' },
    { id:'reserveTime', label:'入庫時刻',      type:'time' },
    { id:'returnDate',  label:'返車予定日',    type:'date' },
    { id:'returnTime',  label:'返車時間',      type:'time' },
    { id:'paymentDate', label:'入金予定日',    type:'date' },
    { id:'outsourceDue',label:'外注の戻り予定日', type:'date' },
    { id:'outsourceTo', label:'外注先',        type:'text' },
    { id:'loanerFrom',  label:'貸出から',      type:'date' },
    { id:'loanerTo',    label:'貸出まで',      type:'date' },
    /* 車検の「行く日」は入れ子（c.inspSchedule.decided）＝ここで吸収する */
    { id:'shakenDecided', label:'陸運局へ行く日', type:'date',
      hint:'決めた日を入れると、当日ボードと前日のお知らせに出ます',
      get: function(c){ return t((c.inspSchedule || {}).decided); },
      set: function(c, v){ c.inspSchedule = c.inspSchedule || {}; c.inspSchedule.decided = v; } },

    /* ---- お金 ---- */
    { id:'estAmount',   label:'概算金額',   type:'money' },
    { id:'amountQuote', label:'見積金額',   type:'money' },
    { id:'amountOrder', label:'受注金額',   type:'money' },
    { id:'feeAmount',   label:'諸費用（車検）', type:'money', hint:'0円と決めたなら 0 を入れてください' },

    /* ---- 🔴🔴 ここから下は**管理者だけ**（ゆうた指定・これまで通り） ---- */
    { id:'amountFinal', label:'確定金額（請求額）', type:'money', admin:true,
      hint:'伝票の金額。売上の実績がこの数字で決まります' },
    { id:'completedAt', label:'実績カウント日', type:'date', admin:true,
      hint:'売上をこの日に数えます。返車日も同じ日に揃います',
      /* ⚠ 3つ揃える手順は card-view.js の1本を借りる（ここで書き写さない） */
      set: function(c, v){ if (w.pitApplyResultDate) w.pitApplyResultDate(c, v); else c.completedAt = v; } },
    { id:'returnDateFinal', label:'確定返車日', type:'date', admin:true }
  ];

  var BY_ID = {};
  FIELDS.forEach(function(f){ BY_ID[f.id] = f; });

  /* ================================================================
     2. 規則 → 直せる欄（🔴 ここ1本）
     ----------------------------------------------------------------
     ⚠ 載っていない規則は「ここを直す」が**出ない**（説明だけ）。
        欄が1つに決まらないもの（タスクの列を動かす・代車カレンダー・PIT配置図・
        顧客とつなぐ など）は、**わざと載せていない**。
        小窓で直せるふりをすると、直したつもりで直っていない、が起きる。
     ⚠ 値は配列 か、カードを見て決める関数（D01/D02/D09＝抜けている欄そのもの）。
     ================================================================ */
  /* 抜けている必須／推奨の欄を、そのまま直せる欄にする（card-miss.js の表 1本から） */
  function missKeys(c, which){
    var m = w.pitCardMisses ? w.pitCardMisses(c) : { red:[], yellow:[] };
    return (m[which] || []).map(function(x){ return x.key; })
      /* ⚠ 代車の3つは代車カレンダー側で決まるので、ここでは出さない（loanerId は選び直しが要る） */
      .filter(function(k){ return k !== 'loanerId' && BY_ID[k]; });
  }

  /* ⚠ v1.172.2（ゆうた指定）**規則表から13本消した**ので、その行もここから消した
     （M05 / M10 / F01 / S01 / S06 / S08 / D06。ほかの6本はもともとここに載せていない）。
     🔴 **規則を消したら、この表からも消す**（表が指す規則が実在することを見張りが見ている）。 */
  var RULE_FIX = {
    /* お金 */
    M01: ['amountOrder'],
    M02: ['amountFinal'],
    M03: ['amountOrder', 'amountQuote'],
    M04: ['amountQuote', 'amountOrder'],
    M06: ['amountFinal'],
    M07: ['amountFinal', 'amountQuote'],
    M08: ['amountFinal', 'amountOrder', 'amountQuote'],
    /* 日付・進行 */
    F03: ['returnDate', 'returnTime'],
    F04: ['completedAt'],
    F05: ['reserveDate', 'returnDate'],
    F06: ['completedAt', 'reserveDate'],
    F07: ['returnDate'],
    F10: ['outsourceDue', 'outsourceTo'],
    /* 予約 */
    R01: ['reserveDate'],
    R02: ['reserveDate', 'returnDate'],
    R03: ['resNo'],
    R04: ['reserveDate', 'returnDate'],
    /* 車検 */
    S02: ['shakenDecided'],
    S05: ['shakenDecided'],
    /* データの抜け（抜けている欄そのものを出す） */
    D01: function(c){ return missKeys(c, 'red'); },
    D09: function(c){ return missKeys(c, 'red'); },
    D02: function(c){ return missKeys(c, 'yellow'); },
    D03: ['customer'],
    D04: ['tel'],
    D05: ['tel'],
    D08: ['customer', 'kana'],
    /* 状態の矛盾 */
    T04: ['frontStaff'],
    T07: ['amountFinal', 'amountOrder']
  };

  /* ================================================================
     3. その所見で直せる欄を出す
     ================================================================ */
  function cardOf(id){
    return ((w.state && state.cards) || []).filter(function(c){ return c && c.id === id; })[0] || null;
  }

  function pitFixFieldsFor(f){
    if (!f || f.kind !== 'card' || !f.refId) return [];      /* 車両（代車・社用車）は車両管理で直す */
    var c = cardOf(f.refId);
    if (!c) return [];
    var v = RULE_FIX[f.ruleId];
    if (!v) return [];
    var keys = (typeof v === 'function') ? (v(c) || []) : v;
    var out = [];
    keys.forEach(function(k){
      var fd = BY_ID[k];
      if (fd && out.indexOf(fd) < 0) out.push(fd);
    });
    return out;
  }

  /* 🔴 管理者だけの欄か。物差しは card-view.js の1本（ここで役割を判定しない） */
  function canEditAdminField(){
    return !w.pitCanEditFinal || !!w.pitCanEditFinal();
  }

  function valOf(fd, c){
    if (fd.get) return fd.get(c);
    var v = c[fd.id];
    if (fd.type === 'money') return (v == null || v === '') ? '' : String(num(v));
    return t(v);
  }

  /* ================================================================
     4. 小窓
     ================================================================ */
  var OPEN = null;   /* { key, cardId, fields } */

  function close(){
    OPEN = null;
    var el = document.getElementById('ins-fix');
    if (el) el.remove();
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e){ if (e.key === 'Escape'){ e.stopPropagation(); close(); } }

  function pitFixOpen(key){
    var res = (w._insp && w._insp.res) || null;
    var f = res ? res.findings.filter(function(x){ return x.key === key; })[0] : null;
    if (!f){ if (w.pitToast) pitToast('この所見が見つかりません。もう一度チェックを押してください'); return; }
    var c = cardOf(f.refId);
    if (!c){ if (w.pitToast) pitToast('この車のカードが見つかりません'); return; }
    var fields = pitFixFieldsFor(f);
    if (!fields.length){ if (w.pitToast) pitToast('この所見は、直す欄が1つに決まりません（説明のとおりに直してください）'); return; }

    OPEN = { key: key, cardId: c.id, fields: fields };
    var archived = !!(w.PitArchive && PitArchive.cardArchived && PitArchive.cardArchived(c));
    var who = (w.pitCustName ? w.pitCustName(c) : t(c.customer)) || '（未入力）';
    var carLabel = (w.pitCarLabel ? w.pitCarLabel(c) : t(c.car));

    var h = '<div class="ins-fix-bg" onclick="pitFixClose()"></div><div class="ins-fix-win" role="dialog" aria-modal="true">'
          + '<div class="ins-fix-h">'
          /* 🔢 v1.178.0 開いた小窓にも、その所見の番号を出す（押すとコピー）。
             ⚠ 番号は所見が持っているものをそのまま出す。**ここで作り直さない。** */
          +   (f.no ? '<button class="ins-no" title="押すと番号をコピーします"'
                    + ' onclick="pitInspectCopyNo(\'' + esc(f.no) + '\')">' + esc(f.no) + '</button>' : '')
          +   '<div class="ins-fix-t">' + esc(f.title) + '</div>'
          +   '<button class="ins-fix-x" onclick="pitFixClose()" aria-label="閉じる">✕</button>'
          + '</div>'
          + '<div class="ins-fix-who">' + esc(who) + ' 様'
          +   (carLabel ? '　<span>' + esc(carLabel) + '</span>' : '')
          +   (t(c.plate) ? '　<span>' + esc(c.plate) + '</span>' : '')
          + '</div>'
          + '<div class="ins-fix-txt">' + esc(f.text) + '</div>';

    /* 🔴 アーカイブ済みの車は、**なぜ触れるのか**をその場で言う（黙って開けない） */
    if (archived){
      h += '<div class="ins-fix-arch">この車は<b>アーカイブ済み</b>です。'
         + 'データチェックが指摘した<b>下の欄だけ</b>直せます（ほかの欄は開きません）。</div>';
    }

    h += '<div class="ins-fix-grid">';
    fields.forEach(function(fd){
      var v = valOf(fd, c);
      var locked = fd.admin && !canEditAdminField();
      h += '<div class="ins-fix-row">'
         +   '<div class="ins-fix-l">' + esc(fd.label)
         +     (fd.admin ? '<span class="ins-fix-lock">' + (locked ? '🔒 管理のみ' : '🔒 確定') + '</span>' : '')
         +   '</div>';
      if (locked){
        /* 🔴🔴 ゆうた指定「確定金額と確定日だけはこれまで通り管理者のみ」
           ＝ **見えるが直せない**。欄ごと消すと「無い」のか「触れない」のか分からなくなる。 */
        h += '<div class="ins-fix-ro">' + (v ? esc(fd.type === 'money' ? Number(v).toLocaleString() : v) : '—') + '</div>'
           + '<div class="ins-fix-hint">直せるのは、設定権限（管理）のある人だけです。</div>';
      } else {
        h += fieldInput(fd, v);
        if (fd.hint) h += '<div class="ins-fix-hint">' + esc(fd.hint) + '</div>';
      }
      h += '</div>';
    });
    h += '</div>'
       + '<div class="ins-fix-b">'
       +   '<button class="ins-fix-cancel" onclick="pitFixClose()">やめる</button>'
       +   '<button class="ins-fix-save" onclick="pitFixSave()">この欄だけ直す</button>'
       + '</div>'
       + '<div class="ins-fix-note">⚠ ここで直せるのは、上に出ている欄だけです。ほかの欄は変わりません。</div>'
       + '</div>';

    var box = document.createElement('div');
    box.id = 'ins-fix'; box.className = 'ins-fix';
    box.innerHTML = h;
    document.body.appendChild(box);
    document.addEventListener('keydown', onKey, true);
    var first = box.querySelector('input,select,textarea');
    if (first) try { first.focus(); } catch(e){}
  }

  function fieldInput(fd, v){
    var id = 'ins-fix-f-' + fd.id;
    if (fd.type === 'pick'){
      var list = fd.opts ? (fd.opts() || []) : [];
      var h = '<select class="ins-fix-in" id="' + id + '"><option value="">（決めない）</option>';
      list.forEach(function(o){
        h += '<option value="' + esc(o.id) + '"' + (String(o.id) === String(v) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      });
      /* いまの値が一覧に無い時＝消された設定を指している。黙って空にしない */
      if (v && !list.some(function(o){ return String(o.id) === String(v); })){
        h += '<option value="' + esc(v) + '" selected>' + esc(v) + '（いまの設定にありません）</option>';
      }
      return h + '</select>';
    }
    if (fd.type === 'textarea') return '<textarea class="ins-fix-in ins-fix-ta" id="' + id + '" rows="3">' + esc(v) + '</textarea>';
    if (fd.type === 'date')  return '<input class="ins-fix-in" id="' + id + '" type="date" value="' + esc(v) + '">';
    if (fd.type === 'time')  return '<input class="ins-fix-in" id="' + id + '" type="time" value="' + esc(v) + '">';
    if (fd.type === 'money') return '<span class="ins-fix-yen">¥</span><input class="ins-fix-in ins-fix-money" id="' + id + '" type="text" inputmode="numeric" value="' + esc(v) + '">';
    if (fd.type === 'tel')   return '<input class="ins-fix-in" id="' + id + '" type="tel" inputmode="tel" value="' + esc(v) + '">';
    return '<input class="ins-fix-in" id="' + id + '" type="text" value="' + esc(v) + '">';
  }

  function pitFixSave(){
    if (!OPEN) return;
    var c = cardOf(OPEN.cardId);
    if (!c){ if (w.pitToast) pitToast('この車のカードが見つかりません'); close(); return; }

    var changes = [];
    var stop = '';
    OPEN.fields.forEach(function(fd){
      if (stop) return;
      if (fd.admin && !canEditAdminField()) return;      /* 🔴 ここでも止める（画面を消しただけにしない） */
      var el = document.getElementById('ins-fix-f-' + fd.id);
      if (!el) return;
      var nv = t(el.value);
      if (fd.type === 'money') nv = (nv === '') ? '' : String(num(nv));
      var ov = valOf(fd, c);
      if (nv === ov) return;
      /* 🔴 実績カウント日は空にできない（空＝どの月にも数えられなくなる） */
      if (fd.id === 'completedAt' && !nv){ stop = '実績カウント日は空にできません（どの月にも数えられなくなります）'; return; }
      changes.push({ fd: fd, from: ov, to: nv });
    });

    if (stop){ if (w.pitToast) pitToast(stop); return; }
    if (!changes.length){ if (w.pitToast) pitToast('変わっていません'); close(); return; }

    changes.forEach(function(ch){
      var fd = ch.fd;
      if (fd.set) fd.set(c, ch.to);
      else if (fd.type === 'money') c[fd.id] = (ch.to === '' ? null : num(ch.to));
      else c[fd.id] = ch.to;
    });

    /* 🔴 何を直したかは必ず残す（アーカイブ済みの車をあとから触っているので、なおさら） */
    var word = changes.map(function(ch){
      return ch.fd.label + ' ' + (ch.from || '（空）') + ' → ' + (ch.to || '（空）');
    }).join('／');
    try { if (w.logFlow) logFlow(c, 'データチェックから直した：' + word); } catch(e){}
    try {
      if (w.pitLog) pitLog('データチェックから直した', { cardId: c.id, kind: 'inspect',
        label: ((w.pitCustName ? pitCustName(c) : t(c.customer)) || '') + ' 様　' + word });
    } catch(e){}

    if (w.PitDB && w.PitDB.save) PitDB.save();

    /* 🔴 **「直した」の札は自動で貼らない。**
       ◎なぜ
         直したのに所見が残る＝**まだ直り切っていない**（別の欄も空、など）。
         そこへ自動で「直した」を貼ると、**残っている問題を自分で隠す**ことになる。
       ＝ 本当に直っていれば、次の描き直しで**その所見は消える**。それが答え。 */
    close();
    if (w.pitToast) pitToast('直しました：' + word);
    if (w.renderInspect) renderInspect();
  }

  w.PIT_FIX_FIELDS   = FIELDS;
  w.PIT_RULE_FIX     = RULE_FIX;
  w.pitFixFieldsFor  = pitFixFieldsFor;
  w.pitFixOpen       = pitFixOpen;
  w.pitFixSave       = pitFixSave;
  w.pitFixClose      = close;
  console.log('[inspect-fix] ready（直せる欄 ' + FIELDS.length + '／規則 ' + Object.keys(RULE_FIX).length + '本にひもづけ）');
})(window);

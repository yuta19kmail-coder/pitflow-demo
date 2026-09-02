/* ========================================
   maint-pit.js  -  🔧 代車の作業予定ボード（PitFlow v2.44.0）
   ----------------------------------------
   ◎なにをするもの（2026-08-31・ゆうた指定）
     🗣「代車管理の仕組みの変更。車両カレンダーと代車一覧の間に **代車作業予定** の欄を追加。
     　ココには直近半年分の予定が入る。また壊れた場合の予定の入力もここから手入力。
     　ここではあくまで **月の目標（やるべきこと）** として入力。修理の場合は **急ぎ** もあり。
     　今の車両カレンダーに予定が乗る。この時 **枠を抑えてない場合は警告** というか
     　『早くやれよ』の合図がでる」
     🗣「基本的な考え方は作業予定ボードの各カードに、**飛び地の作業予定とか、各種警告、等がまとまる**イメージ」

   ◎このファイルが持つもの
     pitMaintRows(today)   … ボードに出す行（月の目標＋保存済みの候補/確定＋警告を1つにまとめたもの）
     flMaintBoardHtml()    … ボードのHTML（renderFleet が呼ぶ）
     pitMaintBadges(v, ym) … 月カレンダーのバッジ（fleet.js が呼ぶ）
     flMaintAdd/Save/Drop  … 修理の手入力・取り下げ
     flMaintGoto           … 「日を決める」＝代車カレンダーへ飛ぶ

   🔴 **月の目標は保存しない。**車検・12ヶ月点検は満了日から計算で出す（loaner-free.js の pitLoanerMaintPlans）。
      保存するのは **人が作ったものだけ**＝修理の月の目標／日の候補／確定／「今日はやらない」。
      ＝ 画面を開いただけでクラウドに書かない。

   🔴🔴 **車検の満了を過ぎても貸出は止めない**（ゆうた指定「どんなにあっても、もともと生命線だから落とすことはない」）。
      ここは **赤で知らせるだけ**。`pitLoanerUsable` には絶対に手を出さないこと。

   🔴🔴 v2.49.0 **置き場所は `state.cards`（ふつうの予約カード）。** fleetEvents ではもう無い。
      カード1枚＝作業1本、候補（飛び地）はそのカードの `maintSpans` 配列。形は pit-share.js に書いた。
      ＝箱は増えないどころか**1つ減った**し、MHS は pitCards を読んでいるので**連動もタダ**。
   ⚠ 読み込みは loaner-free.js より後ろ・fleet.js より前。
   ======================================== */
(function (w) {
  'use strict';

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]; }); }
  function arr(v){ return Array.isArray(v) ? v : []; }
  function today(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function ymOf(ds){ return String(ds || '').slice(0, 7); }
  function ymAdd(ym, n){
    var p = String(ym).split('-'), y = +p[0], m = +p[1] - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + String(m + 1).padStart(2, '0');
  }
  function _pd(s){ var p = String(s).split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
  function md(ds){ var p = String(ds).split('-'); return p.length === 3 ? (+p[1]) + '/' + (+p[2]) : ds; }
  function ymText(ym){ var p = String(ym).split('-'); return p.length === 2 ? (+p[1]) + '月' : ym; }
  function daysBetween(a, b){
    var pa = String(a).split('-'), pb = String(b).split('-');
    return Math.round((new Date(+pb[0],+pb[1]-1,+pb[2]) - new Date(+pa[0],+pa[1]-1,+pa[2])) / 86400000);
  }
  function vehicles(){ return arr(w.state && w.state.loaners).concat(arr(w.state && w.state.companyCars)); }
  function vehName(v){ return (v && (v.model || v.name)) || '（車種未登録）'; }
  function vehNo(v){ return (v && v.number != null && v.number !== '') ? String(v.number) : ''; }
  function isLoaner(v){ return arr(w.state && w.state.loaners).some(function(x){ return x.id === v.id; }); }

  /* ==================================================================
     🔴🔴 v2.49.0（ゆうた確定 2026-08-31）**保存先を「カード」にした。**
     ------------------------------------------------------------------
     🗣「というか表示しているのは代車作業予定ボード。という扱いにはできない？」
     🗣「予約カードとしては存在している、ただし、表示はさせない」

     ◎前まで（v2.48.0）
       整備の枠は `state.fleetEvents` の別レコードだった。だから
       ・当日ビュー・MHS・予約カレンダーに出すには、**そのつど専用の道**が要った
       ・入庫のたびに**カードを新しく作っていた**（＝二重にできる穴があった。v2.48.0 で塞いだ）
       ・「消える／消えない」を status ではなく自前の印で持っていた

     ◎いま
       **カード1枚 ＝ 作業1本。** 形は pit-share.js の `pitCardMaint` の所に書いた。
       ・候補（飛び地）は **1枚のカードの `maintSpans` 配列**。何本置いてもカードは1枚
       ・確定 ＝ `reserveDate` が入って `intakeTbd:false` ＝ **ふつうの予約に変わるだけ**
       ・入庫 ＝ `status` を進めるだけ（**カードを作らない**＝二重入庫が構造的に起きない）
       ・MHS は `pitCards` を読んでいるので、**MHS 側は1行も触らずに**乗る

     ⚠ このファイルの組み立て（ボード・バッジ・日ビュー）は `recs()` の形に乗っているので、
        **`recs()` がカードから同じ形を作る**ことで、そこから先は前のまま使える。
        ＝ 直した所を最小にするための作り。**ここの形を変えるときは下も一緒に見ること。**
     ================================================================== */

  /* 整備カード（＝1作業1枚）。予約の段階のものだけ。 */
  function mcards(){
    return arr(w.state && w.state.cards).filter(function(c){
      return w.pitCardMaint ? w.pitCardMaint(c) : !!(c && c.internKind === 'loanercar' && Array.isArray(c.maintSpans));
    });
  }
  function cardOf(id){ return mcards().filter(function(c){ return c.id === id; })[0] || null; }
  /* 候補1本ごとに新しい鍵を振る。**並び順（index）で指さない**＝1本消すと他がずれるため。 */
  function newSid(){ return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
  /* rec の id ＝ カードid ＋ 候補の鍵。ここ以外で組み立てない。 */
  function recId(c, sp){ return c.id + '#' + sp.sid; }
  function splitRecId(id){ var i = String(id).indexOf('#'); return i < 0 ? { cid:String(id), sid:'' } : { cid:String(id).slice(0,i), sid:String(id).slice(i+1) }; }
  function spanOf(id){
    var k = splitRecId(id), c = cardOf(k.cid); if (!c) return null;
    var sp = (c.maintSpans || []).filter(function(x){ return x.sid === k.sid; })[0];
    return sp ? { card:c, span:sp } : null;
  }

  /* 🔴 **前と同じ形**（stage / fromDate / toDate / groupId …）に見せる。
        こうしておくと、ボード・バッジ・日ビューの組み立てを書き換えずに済む。 */
  function recs(){
    var out = [];
    mcards().forEach(function(c){
      var started = !!c.actualInAt || (c.status !== 'reserved');
      var done    = (c.status === 'returned');
      /* ① 月の目標（手で入れたもの）＝候補が1本も無いカード */
      if (!(c.maintSpans || []).length){
        out.push({ id:c.id, card:c, cardId:c.id, vehicleId:c.maintVehId, maint:true, stage:'month',
                   work:c.workType, ym:c.maintYm, urgent:!!c.urgent, memo:c.memo || '',
                   fromDate:(c.maintYm || '') + '-01', toDate:(c.maintYm || '') + '-28',
                   skipped:arr(c.maintSkipped), started:started, done:done, groupId:c.id });
        return;
      }
      /* ② 候補・確定＝候補1本＝1レコード */
      (c.maintSpans || []).forEach(function(sp){
        out.push({ id:recId(c, sp), card:c, cardId:c.id, sid:sp.sid, vehicleId:c.maintVehId, maint:true,
                   stage:(c.maintFixSid === sp.sid ? 'fixed' : 'candidate'),
                   work:c.workType, ym:c.maintYm, urgent:!!c.urgent, memo:c.memo || '',
                   fromDate:sp.from, toDate:sp.to, skipped:arr(c.maintSkipped),
                   started:started, done:done, groupId:c.id });
      });
    });
    return out;
  }
  /* 束ねる鍵＝**カードid そのもの**（1作業1カードなので、計算で作る鍵はもう要らない）。
     ⚠ まだカードが無い（月の目標が計算だけで出ている）ものは、下の `groupIdOf` の形で仮の鍵を作る。 */
  function groupIdOf(vehId, work, ym){ return 'mg_' + vehId + '_' + work + '_' + ym; }
  /* 仮の鍵から、実体のカードを探す（無ければ null＝まだ1本も置いていない） */
  function cardForPlan(vehId, work, ym){
    return mcards().filter(function(c){
      return c.maintVehId === vehId && c.workType === work && c.maintYm === ym && c.status === 'reserved';
    })[0] || null;
  }
  function saveCards(){ if (w.PitDB) w.PitDB.save(); }

  /* 🔴 作業タイプは **社内区分「代車」の相方4つ（PIT_LOANER_MATES）と同じ**にそろえる。
     ＝入庫でカードを起こす時、そのまま `workType` に渡せる（変換表を持たない）。
     ⚠ 「修理」は独立した作業タイプではない＝**一般**（設定の説明も「通常の修理作業」）。
        独自の 'fix' を作ると、カードにする時に必ず変換表が要る＝そこが古くなる。 */
  /* 🔧 自社の代車の整備の色。**JS と CSS で別々に綴らない**（CSS は --pit-maint に受け取る）。 */
  var MAINT_COLOR = '#d6a846';
  w.PIT_MAINT_COLOR = MAINT_COLOR;
  try { document.documentElement.style.setProperty('--pit-maint', MAINT_COLOR); } catch (e) {}

  var WORK_LB = { shaken:'車検', '12pt':'12ヶ月点検', general:'一般（修理）', bp:'B.P' };
  var WORK_CLS = { shaken:'mb-k-shaken', '12pt':'mb-k-12', general:'mb-k-fix', bp:'mb-k-gen' };

  /* ==================================================================
     ボードに出す行を組み立てる
     ------------------------------------------------------------------
     1行 ＝ 1つの整備予定。中身は
       plan（月の目標・計算） ＋ candidates（保存） ＋ fixed（保存） ＋ 状態 ＋ 警告
     ⚠ **直近半年ぶん**（ゆうた指定）。ただし**過ぎたもの・超過は必ず出す**（消えると事故る）。
     ================================================================== */
  function rows(todayStr){
    var td = todayStr || today();
    var horizon = ymAdd(ymOf(td), 6);      /* 直近半年 */
    var out = [];
    vehicles().forEach(function(v){
      if (v.retired) return;
      /* ① 車検・12ヶ月点検＝計算で出る目標 */
      var plans = (w.pitLoanerMaintPlans ? w.pitLoanerMaintPlans(v, td) : []);
      plans.forEach(function(p){
        if (!p.overdue && !p.slipped && p.ym > horizon) return;   /* 半年より先はまだ出さない */
        /* 🔴 v2.53.0 この月・この作業の「完了する」を押してあれば、もう出さない。
           ⚠ 車検は満了日を進めれば勝手に消えるが、**12ヶ月点検は満了日から計算している**ので
              満了日が動かない＝押した印を見ないと永久に出続ける。 */
        var _done = cardForPlan(v.id, p.work, p.ym);
        if (_done && _done.maintDone) return;
        out.push(buildRow(v, p, td));
      });
      /* ② 計算で出ない予定＝**カードが実体を持っているもの**（修理・B.P、手で足した車検 など）
         🔴 v2.49.0 前は「候補が1本も無いカード（stage:'month'）」だけを拾っていた。
            それだと**候補を1本置いた瞬間に、この行がボードから消えた**（①でも②でも拾えなくなる）。
            いまは**計算の目標と噛み合わないカードを全部**ここで拾う。 */
      mcards().forEach(function(c){
        if (c.maintVehId !== v.id) return;
        /* 🔴🔴 v2.53.0（ゆうた 2026-09-01）**入庫では消さない。「完了する」を押すまで残す。**
           ◎前まで … `status !== 'reserved'` で外していた（＝入庫した瞬間にボードから消えた）。
             そのせいで「終わったのかどうか」をボードで確かめられず、
             車検は満了日が動かないので**別の行がずっと残る**、という食い違いが起きていた。
           ◎いま … 終わりを名乗れるのは**「完了する」を押した時（maintDone）だけ**。
             🗣「押し忘れて残っているのが目に入るほうが良い」＝自動では消さない。
           ⚠ だから入庫中・返車済みの行もここに出る。状態は buildRow が出し分ける。 */
        if (c.maintDone) return;                             /* 完了を押した＝ボードの仕事は終わり */
        var matched = plans.some(function(p){ return p.work === c.workType && p.ym === c.maintYm; });
        if (matched) return;                                 /* ①がもう出している */
        var ym = c.maintYm || ymOf(td);
        var slip = ym < ymOf(td);
        out.push(buildRow(v, {
          work: c.workType || 'general', label: WORK_LB[c.workType || 'general'] || '整備', vehicleId: v.id,
          dueDate: '', openFrom: (slip ? ymOf(td) : ym) + '-01', openTo: '',
          months: [ym], ym: (slip ? ymOf(td) : ym), overdue: false, slipped: slip,
          inWindow: true, manualId: c.id, urgent: !!c.urgent, memo: c.memo || ''
        }, td));
      });
    });
    /* 並び＝赤 → 警告 → 動いているもの → まだ先。同じ強さなら期限が近い順 */
    /* 🔴 v2.53.0 「完了する」待ちは**いちばん上**。押し忘れが目に入るように（ゆうた指定） */
    var rank = { done:0, bad:1, warn:2, doing:3, go:4, idle:5 };
    out.sort(function(a, b){
      return (rank[a.level] - rank[b.level]) || (String(a.sortKey) < String(b.sortKey) ? -1 : 1);
    });
    return out;
  }

  function buildRow(v, p, td){
    /* 🔴 v2.49.0 束ねる鍵＝**実体のカードがあればそのid**。まだ1本も置いていなければ計算の仮鍵。
       ⚠ 仮鍵のまま置きにいくと、置く時に「どの月の目標か」が分からなくなる（PF-3056）。
          なので `flMaintPlaceSave` は vehId / work / ym から実体を作る（または探す）。 */
    var _card = p.manualId ? cardOf(p.manualId) : cardForPlan(v.id, p.work, p.ym);
    var gid = (_card && _card.id) || p.manualId || groupIdOf(v.id, p.work, p.ym);
    var mine = recs().filter(function(r){
      if (r.vehicleId !== v.id) return false;
      if ((r.stage || '') === 'month') return false;
      return (r.groupId || '') === gid;
    });
    var cands = mine.filter(function(r){ return (r.stage || 'candidate') === 'candidate'; })
                    .sort(function(a,b){ return a.fromDate < b.fromDate ? -1 : 1; });
    var fixed = mine.filter(function(r){ return r.stage === 'fixed'; })[0] || null;

    var live = cands.filter(function(r){ return r.toDate >= td; });     /* まだ来ていない候補 */
    var level = 'idle', msg = '', msgCls = 'g';

    /* 🔴🔴 v2.53.0 **実績（数えない側）に入った＝「完了する」を聞く番。**
       ここが「終わり」を名乗れる唯一の場所。押すまで行は消えない。 */
    var doneReady = !!(_card && _card.status === 'returned' && !_card.maintDone);
    if (doneReady){
      level = 'done'; msgCls = 'g';
      msg = '実績に入りました。内容を確かめて「完了する」を押してください';
    }
    else if (fixed && fixed.started){ level = 'doing'; msg = '作業中。完TELを通ると、残っている候補は消えます'; }
    else if (fixed){ level = 'go'; msg = '当日ビューに出ます。入庫したらタスクボードへカードが起きます'; }
    else if (p.overdue){
      level = 'bad'; msgCls = 'b';
      msg = '🚨 車検の満了を過ぎています（' + daysBetween(p.dueDate, td) + '日超過）。すぐ手配してください';
    }
    else if (!live.length && p.inWindow){
      level = 'warn'; msgCls = 'w';
      /* ⚠ 言い方は3通り。**満了があるもの／繰り越したもの／手で入れたもの**で噛み合う文が違う。
         「今月に入りましたが」を修理に出すと意味が通らない（満了が無いので）。 */
      if (p.slipped){
        msg = '⚠ ' + ymText(p.months[0]) + 'にできませんでした。' + ymText(p.ym) + 'へスライドしています';
      } else if (p.manualId){
        msg = p.urgent ? '🚨 急ぎです。まだ日が決まっていません。早めに枠を取ってください'
                       : '⚠ まだ日が決まっていません。早めに枠を取ってください';
        if (p.urgent) msgCls = 'b';
      } else {
        msg = '⚠ 今月に入りましたが候補がまだ1本もありません。早めに枠を取ってください';
      }
    }
    else if (live.length){ level = 'go'; msg = '候補 ' + live.length + '本。当日ビューに毎日出ています'; }
    else { level = 'idle'; msg = ''; }

    return {
      vehicleId: v.id, veh: v, isLoaner: isLoaner(v),
      work: p.work, workLabel: p.label || WORK_LB[p.work] || '整備',
      groupId: gid, plan: p, candidates: cands, live: live, fixed: fixed,
      level: level, msg: msg, msgCls: msgCls,
      card: _card || null, doneReady: doneReady,
      urgent: !!p.urgent, memo: p.memo || '',
      sortKey: p.dueDate || (p.ym + '-99')
    };
  }

  /* ==================================================================
     月カレンダーのバッジ（fleet.js が1マスごとに呼ぶ）
     🔴 車検は **満了月＋その前2ヶ月の3ヶ月**（ゆうた指定「満了日の前2月分にも」）。
     ================================================================== */
  function badges(v, ym, todayStr){
    var td = todayStr || today();
    var out = [];
    if (!v || v.retired) return out;
    rows(td).forEach(function(r){
      if (r.vehicleId !== v.id) return;
      var p = r.plan;
      /* 満了超過＝今月の列に赤で出す（消えないように） */
      if (p.overdue && ym === ymOf(td)){
        out.push({ cls:'bad', text:'🚨 ' + r.workLabel + '超過', title:'満了 ' + p.dueDate + '（貸出は止めていません）', gid:r.groupId, ym:ym });
        return;
      }
      if (p.months.indexOf(ym) < 0 && p.ym !== ym) return;
      /* 確定・候補がその月にあれば実体のバッジ */
      var inMonth = r.candidates.filter(function(c){ return ymOf(c.fromDate) === ym; });
      var hit = (r.fixed && ymOf(r.fixed.fromDate) === ym) ? r.fixed : inMonth[0];
      if (hit){
        /* ⚠ 1マスしかないので、同じ月に候補が2本以上ある時は**まとめて数で出す**
           （1本目だけ出すと、残りが無いように見える） */
        var txt = (hit.stage !== 'fixed' && inMonth.length > 1)
                ? (r.workLabel + ' 候補' + inMonth.length + '本')
                : (r.workLabel + ' ' + md(hit.fromDate) + (hit.fromDate === hit.toDate ? '' : ('〜' + md(hit.toDate))));
        out.push({ cls: (hit.stage === 'fixed' ? 'fixed' : 'plan'), text: txt,
                   title: (hit.stage === 'fixed' ? '確定' : ('候補 ' + inMonth.map(function(c){ return md(c.fromDate) + '〜' + md(c.toDate); }).join(' / '))),
                   gid:r.groupId, ym:ym });
      } else {
        out.push({ cls:'plan' + (r.level === 'warn' ? ' warn' : ''), text:r.workLabel + (r.plan.slipped ? '（繰越）' : ''),
                   title:'日を決めるにはクリック', gid:r.groupId, ym:ym });
      }
      /* 満了日そのものの月には、赤で満了日 */
      if (p.dueDate && ymOf(p.dueDate) === ym){
        out.push({ cls:'due', text:'満了 ' + md(p.dueDate), title:p.dueDate, gid:r.groupId, ym:ym });
      }
    });
    return out;
  }

  /* ==================================================================
     ボードのHTML
     ================================================================== */
  function boardHtml(){
    var td = today();
    var list = rows(td);
    var nBad = list.filter(function(r){ return r.level === 'bad'; }).length;
    var nWarn = list.filter(function(r){ return r.level === 'warn'; }).length;

    var h = '<div class="fl-card">'
      + '<div class="fl-h"><span><i data-ic=wrench data-ics=16></i> 代車作業予定'
      + (nBad ? '<span class="mb-cnt bad">要対応 ' + nBad + '</span>' : '')
      + (nWarn ? '<span class="mb-cnt warn">警告 ' + nWarn + '</span>' : '')
      + '</span>'
      + '<span class="fl-note">直近半年ぶん／過ぎたものは消えずに残ります　'
      + '<button class="vh-btn" onclick="flMaintAdd()"><i data-ic=plus data-ics=16></i> 予定を足す</button></span></div>';

    if (!list.length){ h += '<div class="fl-empty">予定はありません</div></div>'; return h; }

    h += '<div class="mb-rows">';
    list.forEach(function(r){
      var p = r.plan;
      h += '<div class="mb-row mb-' + r.level + '">'
        + '<div class="mb-veh"><div class="mb-nm">' + esc(vehName(r.veh)) + '</div>'
        + '<div class="mb-no">' + (r.isLoaner ? ('代車' + esc(vehNo(r.veh))) : '社用車') + '</div>'
        + '<span class="mb-kind ' + (WORK_CLS[r.work] || 'mb-k-gen') + '">' + esc(r.workLabel) + '</span>'
        + (r.urgent ? '<span class="mb-urgent">急ぎ</span>' : '')
        + '</div>'
        + '<div class="mb-mid">';

      /* 1行目＝期限まわり */
      h += '<div class="mb-line">';
      if (p.dueDate){
        h += '<span class="mb-due">満了 ' + esc(p.dueDate) + '</span>';
        var dd = daysBetween(td, p.dueDate);
        h += '<span>' + (dd >= 0 ? ('あと' + dd + '日') : ((-dd) + '日超過')) + '</span>';
        if (p.openFrom) h += '<span>受けられる期間 ' + md(p.openFrom) + '〜' + md(p.openTo) + '</span>';
      } else {
        h += '<span class="mb-due">' + esc(ymText(p.months[0])) + ' の予定</span>';
        if (p.slipped) h += '<span>→</span><span class="mb-due">' + esc(ymText(p.ym)) + ' へ繰り越し</span>';
        if (r.memo) h += '<span>' + esc(r.memo) + '</span>';
      }
      h += '</div>';

      /* 2行目＝飛び地の候補 */
      h += '<div class="mb-line"><span>候補</span><span class="mb-slots">';
      if (r.fixed){
        h += '<span class="mb-chip fixed">' + md(r.fixed.fromDate) + '〜' + md(r.fixed.toDate) + ' で確定</span>';
      }
      r.candidates.forEach(function(c){
        var gone = c.toDate < td;
        h += '<span class="mb-chip' + (gone ? ' gone' : '') + '" title="' + esc(c.fromDate + '〜' + c.toDate) + '">'
           + md(c.fromDate) + (c.fromDate === c.toDate ? '' : ('〜' + md(c.toDate))) + '</span>';
      });
      if (!r.fixed) h += '<span class="mb-chip add" onclick="flMaintGoto(\'' + r.vehicleId + '\',\'' + p.ym + '\')">＋ 候補を置く</span>';
      h += '</span></div>';

      if (r.msg) h += '<div class="mb-msg ' + r.msgCls + '">' + esc(r.msg) + '</div>';
      h += '</div><div class="mb-act">'
        /* 🔴 v2.53.0 実績に入ったら、ここが「完了する」に変わる（日を決める・取り下げは出さない） */
        + (r.doneReady
            ? '<button class="vh-btn mb-done" onclick="flMaintFinish(\'' + (r.card && r.card.id) + '\')"><i data-ic=check data-ics=16></i> 完了する</button>'
            : ((r.fixed ? '' : '<button class="vh-btn" onclick="flMaintGoto(\'' + r.vehicleId + '\',\'' + p.ym + '\')">日を決める</button>')
             + (p.manualId ? '<button class="vh-btn mb-del" onclick="flMaintDrop(\'' + p.manualId + '\')">取り下げ</button>' : '')))
        + '</div></div>';
    });
    h += '</div></div>';
    return h;
  }

  /* ==================================================================
     修理などを手で足す（月の目標。**日はここでは決めない**）
     ================================================================== */
  w.flMaintAdd = function(){
    var td = today();
    var vs = vehicles().filter(function(v){ return !v.retired; });
    var opts = vs.map(function(v){
      return '<option value="' + v.id + '">' + esc(vehName(v)) + (vehNo(v) ? ('（' + esc(vehNo(v)) + '）') : '') + '</option>';
    }).join('');
    var yms = []; for (var i = 0; i < 7; i++){ var y = ymAdd(ymOf(td), i); yms.push('<option value="' + y + '">' + y.replace('-', '年') + '月</option>'); }
    _modal(
      '<h3 class="lo-modal-h"><i data-ic=wrench data-ics=16></i> 代車の作業予定を足す</h3>'
      + '<label class="lo-modal-f">車両<select id="mba-veh">' + opts + '</select></label>'
      + '<div class="lo-modal-row">'
      + '<label class="lo-modal-f">作業<select id="mba-work">'
      + '<option value="general">一般（修理）</option><option value="bp">B.P</option>'
      + '<option value="12pt">12ヶ月点検</option><option value="shaken">車検</option></select></label>'
      + '<label class="lo-modal-f">いつまでに<select id="mba-ym">' + yms + '</select></label>'
      + '</div>'
      + '<label class="lo-modal-f">ひとことメモ<input id="mba-memo" maxlength="40" placeholder="例：エアコンが効かない"></label>'
      + '<label class="lo-modal-f" style="display:flex;align-items:center;gap:7px"><input type="checkbox" id="mba-urgent" style="width:auto;margin:0"> 急ぎ</label>'
      + '<div class="lo-modal-note">ここで決めるのは<b>月の目標（やるべきこと）</b>だけです。日は「日を決める」から代車カレンダーで置きます。</div>'
      + '<div class="lo-modal-foot"><button onclick="flMaintClose()">キャンセル</button>'
      + '<button class="primary" onclick="flMaintSave()">足す</button></div>'
    );
  };
  w.flMaintSave = function(){
    var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
    var veh = g('mba-veh'), work = g('mba-work'), ym = g('mba-ym'), memo = String(g('mba-memo') || '').trim();
    var urgent = !!(document.getElementById('mba-urgent') || {}).checked;
    if (!veh || !work || !ym){ w.pitAlert('車両・作業・いつまでに を入れてください', { code:'PF-3050' }); return; }
    if (!memo){ w.pitAlert('ひとことメモを入れてください', { code:'PF-3051',
      detail:'あとで見た人が「何の作業か」分かるように、ひとことだけ入れてください。' }); return; }
    newMaintCard(veh, work, ym, { urgent: urgent, memo: memo });
    saveCards();
    try { if (w.pitLog) w.pitLog('代車の作業予定を足した', { kind:'loaner', label: (WORK_LB[work]||'') + ' ' + ym + '（' + memo + '）' }); } catch(e){}
    flMaintClose(); if (w.renderFleet) w.renderFleet();
  };
  /* 🔴 v2.49.0（ゆうた確定）取り下げ＝**カードごと消去する。**
     🗣「消去する」
     ⚠ 代車の整備予定は売上も来店履歴も持たないので、予約キャンセルで残しても読む人がいない。
        年に何十本も建つので、残すとアーカイブが代車で溢れる。
     ⚠ 予約番号は**欠番として残る**（再利用しない＝ふつうのカードの消去と同じ）。 */
  w.flMaintDrop = function(cardId){
    var c = cardOf(cardId);
    if (!c) return;
    w.pitAsk('この予定を取り下げますか？', { code:'PF-3052', title:'作業予定の取り下げ', danger:true, ok:'取り下げる',
      detail:(WORK_LB[c.workType] || '整備') + '　' + (c.maintYm || '') + '\n' + (c.memo || '')
           + '\n\n候補も一緒に消えます。カードごと無くなり、元に戻せません。' })
      .then(function(yes){
        if (!yes) return;
        var lb = (WORK_LB[c.workType]||'') + ' ' + (c.maintYm||'');
        /* ⚠ 代車の予定も外す（ふつうのカードの消去と同じ道・v1.154.0） */
        if (w.pitLoanerReleaseForCard) w.pitLoanerReleaseForCard(c.id, '整備予定の取り下げ');
        w.state.cards = arr(w.state.cards).filter(function(x){ return x.id !== c.id; });
        saveCards();
        try { if (w.pitLog) w.pitLog('代車の作業予定を取り下げた（カードを消去）', { kind:'delete', label:lb }); } catch(e){}
        if (w.renderFleet) w.renderFleet();
        if (w.state && w.state.currentView && w.showView) w.showView(w.state.currentView);
      });
  };

  /* ==================================================================
     整備カードを1枚作る（**ここ1か所だけ**）
     🔴 予約番号は「候補を置いた時に振る」（ゆうた確定）＝カードが生まれる時に振る。
     ⚠ お客様欄は入庫の時にナンバーで引き当てて上書きする（`_ownerFill`）。
        ここでは自社の名前で置いておく＝**空のカードを作らない**（v1.56.1 の教訓）。
     ================================================================== */
  function newMaintCard(vehId, work, ym, opt){
    opt = opt || {};
    var v = vehOf(vehId);
    var c = {
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      resNo: (w.pitGenResNo ? w.pitGenResNo() : ''),
      status: 'reserved',
      intakeTbd: true,                    /* 🔴 日はまだ決まっていない＝予約カレンダーには乗らない */
      boardId: 'default', bayId: null, division: null,
      internKind: 'loanercar',            /* 🔴 売上・台数・突合から外れる受け皿（v2.6.0） */
      customer: '自社代車', customerId: '', kana: '', tel: '',
      maker: (v && v.maker) || '', car: vehName(v), plate: (v && v.plate) || '', karteNo: '',
      workType: work, workTypes: [work],
      reserveDate: '', reserveTime: '', returnDate: '',
      maintVehId: vehId, maintYm: ym, maintSpans: [], maintFixSid: '', maintSkipped: [],
      urgent: !!opt.urgent, memo: opt.memo || '',
      consult: false, needLoaner: false, needWash: false,
      workSpecials: [], tentative: false, approvalPending: false,
      log: [{ label: '代車の作業予定を立てた（' + (WORK_LB[work] || '整備') + '・' + ym + '）', at: Date.now() }]
    };
    if (!Array.isArray(w.state.cards)) w.state.cards = [];
    w.state.cards.push(c);
    try { if (w.pitLog) w.pitLog('代車の作業予定を足した', { cardId:c.id, kind:'loaner',
      label:(WORK_LB[work]||'') + ' ' + ym + (opt.memo ? '（' + opt.memo + '）' : '') }); } catch(e){}
    return c;
  }

  /* 「日を決める」＝**いまもある「月をクリック → 日ビュー」をそのまま使う**（ゆうた指定 2026-08-31）。
     🔴 代車カレンダーへは飛ばさない。車両管理の中で完結させる。
     　 （車両管理の日ビューは代車カレンダーの出張所＝データは同じ部品から来ている） */
  w.flMaintGoto = function(vehId, ym){
    var p = String(ym || '').split('-');
    if (w.flZoomTo && p.length === 2) w.flZoomTo(vehId, +p[0], +p[1] - 1);
    else if (w.flZoom && p.length === 2) w.flZoom(+p[0], +p[1] - 1);
  };

  /* 軽量モーダル（代車カレンダーのものを借りる＝写しを作らない） */
  function _modal(html){
    flMaintClose();
    var ov = document.createElement('div'); ov.id = 'mb-modal'; ov.className = 'lo-modal-ov';
    ov.innerHTML = '<div class="lo-modal-box">' + html + '</div>';
    ov.addEventListener('click', function(e){ if (e.target === ov) flMaintClose(); });
    document.body.appendChild(ov);
  }
  w.flMaintClose = function flMaintClose(){ var m = document.getElementById('mb-modal'); if (m) m.remove(); };
  var flMaintClose = w.flMaintClose;


  /* ==================================================================
     段取り3 ── 日ビューで「日の候補」を置く／直す／取り下げ
     ------------------------------------------------------------------
     🗣「カレンダーに飛ぶのではなくて、**今も管理カレンダーの月をクリックすると日ビューにかわる仕様**、
     　それをそのまま使うイメージで」
     🔴 置く場所は**車両管理の日ビュー**（代車カレンダーではない）。
     🔴 セルを押したら**選択肢を出す**（代車カレンダーの空きと同じ考え方）。
        いままでの「セル＝代車自身の予定を追加」は**3つ目として残す**（消さない）。
     ================================================================== */

  /* その車・その日に置ける整備予定（月の目標）の一覧 */
  function plansFor(vehId, ds){
    var ym = ymOf(ds);
    return rows(today()).filter(function(r){
      if (r.vehicleId !== vehId) return false;
      if (r.fixed) return false;                       /* もう確定しているものには置かない */
      var p = r.plan;
      if (p.openFrom && ds < p.openFrom) return false; /* 受けられる期間より前には置けない */
      return p.months.indexOf(ym) >= 0 || p.ym === ym || (p.overdue || p.slipped);
    });
  }

  /* 🔧 v2.46.0 なぞった範囲（from〜to）で受ける。クリックだけなら from===to。 */
  w.flMaintCellMenu = function(vehId, ds, to){
    to = to || ds;
    var ps = plansFor(vehId, ds);
    var per = (ds === to) ? md(ds) : (md(ds) + '〜' + md(to));
    var h = '<div class="lo-bpop-h">' + esc(per) + (ds === to ? '' : '<small>（' + (Math.round((_pd(to) - _pd(ds)) / 86400000) + 1) + '日）</small>') + '</div>';
    ps.forEach(function(r){
      h += '<button class="lo-bpop-b" onclick="flMaintPlace(\'' + r.groupId + '\',\'' + vehId + '\',\'' + ds + '\',\'candidate\',\'\',\'' + r.work + '\',\'' + to + '\',\'' + r.plan.ym + '\')">'
         + '<span class="mb-dot"></span>🔧 ' + esc(r.workLabel) + ' の<b>候補</b>を置く<small>この期間のどこかでやる、の提示</small></button>';
      h += '<button class="lo-bpop-b" onclick="flMaintPlace(\'' + r.groupId + '\',\'' + vehId + '\',\'' + ds + '\',\'fixed\',\'\',\'' + r.work + '\',\'' + to + '\',\'' + r.plan.ym + '\')">'
         + '<span class="mb-dot fixed"></span>🔧 ' + esc(r.workLabel) + ' を<b>ここで確定</b><small>枠を押さえる（代車は貸せなくなる）</small></button>';
    });
    if (!ps.length){
      h += '<div class="lo-bpop-note">この車に、この月の整備予定がありません。<br>作業予定ボードの「＋ 予定を足す」から先に置いてください。</div>';
    }
    h += '<button class="lo-bpop-b" onclick="flMaintPopClose();flOpenEventModal(\'' + vehId + '\',\'' + ds + '\')">'
       + '🗓 代車自身の予定を追加<small>車検入庫・リースアップなど（いままでどおり）</small></button>';
    _pop(h);
  };

  /* 置く／直す の窓（期間） */
  /* ⚠ `work` は**呼ぶ側から渡す**。ここで groupId から引き直すと、
     引けなかった時に黙って「一般」に落ちる（画面には出るので気づけない）。 */
  w.flMaintPlace = function(gid, vehId, ds, mode, recId, work, dsTo, ym){
    flMaintPopClose();
    var cur = recId ? recs().filter(function(r){ return r.id === recId; })[0] : null;
    var from = cur ? cur.fromDate : ds, to = cur ? cur.toDate : (dsTo || ds);
    var lb = (mode === 'fixed') ? '確定' : '候補';
    _modal(
      '<h3 class="lo-modal-h">🔧 整備の' + lb + (cur ? 'を直す' : 'を置く') + '</h3>'
      + '<div class="lo-modal-row"><label class="lo-modal-f">から<input type="date" id="mbp-from" value="' + from + '"></label>'
      + '<label class="lo-modal-f">まで<input type="date" id="mbp-to" value="' + to + '"></label></div>'
      + '<div class="lo-modal-note">'
      + (mode === 'fixed'
          ? '<b>確定</b>＝この期間は代車を貸せなくなります（枠を押さえます）。'
          : '<b>候補</b>＝「この期間のどこかでやる」の提示です。<b>代車は今までどおり貸せます</b>が、'
            + '「代車ありの最短入庫日」の案内からは外れます。')
      + '</div>'
      + '<div class="lo-modal-foot"><button onclick="flMaintClose()">キャンセル</button>'
      + '<button class="primary" onclick="flMaintPlaceSave(\'' + gid + '\',\'' + vehId + '\',\'' + mode + '\',\'' + (recId || '') + '\',\'' + (work || (cur && cur.work) || '') + '\',\'' + (ym || (cur && cur.ym) || '') + '\')">'
      + (cur ? '直す' : '置く') + '</button></div>'
    );
  };
  /* 🔴 v2.49.0 保存先はカード。**まだカードが無ければ、ここで1枚作る**（＝候補を置いた時に生まれる）。
     ⚠ `work` と `ym` は呼ぶ側から来る。ここで鍵から引き直さない（引けないと黙って「一般」に落ちる）。 */
  w.flMaintPlaceSave = function(gid, vehId, mode, recId, work, ym){
    var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
    var from = g('mbp-from'), to = g('mbp-to');
    if (!from || !to){ w.pitAlert('期間を入れてください', { code:'PF-3053' }); return; }
    if (to < from){ w.pitAlert('「まで」は「から」以降にしてください', { code:'PF-3054' }); return; }
    if (!work){ w.pitAlert('どの作業か分かりませんでした', { code:'PF-3056',
      detail:'作業予定ボードの「日を決める」から置き直してください。' }); return; }

    if (recId){                                   /* 直す */
      var hit = spanOf(recId);
      if (!hit){ w.pitAlert('この候補が見つかりません', { code:'PF-3059' }); return; }
      hit.span.from = from; hit.span.to = to;
      if (mode === 'fixed') _fixSpan(hit.card, hit.span);
      else if (hit.card.maintFixSid === hit.span.sid) _unfixCard(hit.card);
      else if (hit.card.reserveDate) hit.card.reserveDate = hit.card.reserveDate;   /* 触らない */
    } else {                                      /* 新しく置く */
      var c = cardOf(gid) || cardForPlan(vehId, work, ym || ymOf(from));
      if (!c) c = newMaintCard(vehId, work, ym || ymOf(from), {});
      if (!Array.isArray(c.maintSpans)) c.maintSpans = [];
      var sp = { sid: newSid(), from: from, to: to };
      c.maintSpans.push(sp);
      if (mode === 'fixed') _fixSpan(c, sp);
    }
    saveCards();
    try { if (w.pitLog) w.pitLog(mode === 'fixed' ? '整備の枠を確定した' : '整備の候補を置いた',
      { kind:'loaner', label:(WORK_LB[work]||'') + ' ' + md(from) + '〜' + md(to) }); } catch(e){}
    flMaintClose(); if (w.renderFleet) w.renderFleet();
    if (w.state && w.state.currentView && w.showView) w.showView(w.state.currentView);
  };

  /* 確定＝**ふつうの予約に変わる**。ここ1か所だけが reserveDate を入れる。 */
  function _fixSpan(c, sp){
    c.maintFixSid = sp.sid;
    c.reserveDate = sp.from;      /* 期間の初日を入庫日にする（当日ビューは期間で見るので中日でも出る） */
    c.intakeTbd   = false;        /* 🔴 これで予約カレンダー・MHS に乗る */
    if (w.logFlow) try { w.logFlow(c, '整備の枠を確定した（' + md(sp.from) + '〜' + md(sp.to) + '）'); } catch(e){}
  }
  /* 確定をやめる＝未定（候補待ち）に戻す。 */
  function _unfixCard(c){
    c.maintFixSid = ''; c.reserveDate = ''; c.reserveTime = ''; c.intakeTbd = true;
  }
  w.pitMaintUnfix = _unfixCard;

  /* 日ビューの黄色いチップを押した時 */
  w.flMaintChip = function(recId){
    var r = recs().filter(function(x){ return x.id === recId; })[0];
    if (!r) return;
    var isC = (r.stage || 'candidate') === 'candidate';
    _pop('<div class="lo-bpop-h">🔧 ' + esc(WORK_LB[r.work] || '整備') + ' <small>' + md(r.fromDate) + '〜' + md(r.toDate)
        + '（' + (isC ? '候補' : '確定') + '）</small></div>'
      + (isC ? '<button class="lo-bpop-b" onclick="flMaintPopClose();flMaintFix(\'' + recId + '\')"><span class="mb-dot fixed"></span>この枠で確定する</button>' : '')
      + '<button class="lo-bpop-b" onclick="flMaintPopClose();flMaintPlace(\'' + r.groupId + '\',\'' + r.vehicleId + '\',\'' + r.fromDate + '\',\'' + (r.stage||'candidate') + '\',\'' + recId + '\',\'' + (r.work||'') + '\',\'\',\'' + (r.ym||'') + '\')">期間を直す</button>'
      + '<button class="lo-bpop-b danger" onclick="flMaintPopClose();flMaintDelRec(\'' + recId + '\')">この' + (isC ? '候補' : '確定') + 'を取り消す</button>');
  };
  w.flMaintFix = function(recId){
    var hit = spanOf(recId);
    if (!hit) return;
    _fixSpan(hit.card, hit.span);
    saveCards();
    try { if (w.pitLog) w.pitLog('整備の枠を確定した', { cardId:hit.card.id, kind:'loaner',
      label:(WORK_LB[hit.card.workType]||'') + ' ' + md(hit.span.from) + '〜' + md(hit.span.to) }); } catch(e){}
    if (w.renderFleet) w.renderFleet();
    if (w.state && w.state.currentView && w.showView) w.showView(w.state.currentView);
  };
  /* 候補を1本取り消す。
     ⚠ 最後の1本を取り消しても**カードは消さない**（＝月の目標として残る）。
        カードごと無くすのはボードの「取り下げ」だけ＝**消える道を増やさない**（v2.22.0）。 */
  w.flMaintDelRec = function(recId){
    var hit = spanOf(recId);
    if (!hit) return;
    var c = hit.card, sp = hit.span;
    c.maintSpans = arr(c.maintSpans).filter(function(x){ return x.sid !== sp.sid; });
    if (c.maintFixSid === sp.sid) _unfixCard(c);
    saveCards();
    try { if (w.pitLog) w.pitLog('整備の枠を取り消した', { cardId:c.id, kind:'loaner',
      label:(WORK_LB[c.workType]||'') + ' ' + md(sp.from) + '〜' + md(sp.to) }); } catch(e){}
    if (w.renderFleet) w.renderFleet();
    if (w.state && w.state.currentView && w.showView) w.showView(w.state.currentView);
  };

  /* ==================================================================
     段取り4 ── 当日ビュー
     ------------------------------------------------------------------
     🗣「当日ビュー→未入庫→消滅」＝候補の枠は「この期間のどの日でもいいですよ」の提示なので、
        **1日ずつ出て、やらなかった日はその日ぶんだけ消える。**
     🔴🔴 **未入庫に溜めない。**ふつうの予約と違って追いかける相手がいないので、
        残すと未入庫が黄色で埋まって誰も見なくなる。
     🗣（見せ方）「基本は既存の物を出来る限り代車に寄せるレベルでいいよ。
     　名前　自社代車　車種名　作業バッチ　車検・代車　みたいな感じで」
     ⚠ v1.131.0 の「当日ビューに車検の枠は出さない」は**お客様の車検予定**の話。
        これは**自社の代車を入庫させる**話なので別物（入庫の列に出る）。
     ================================================================== */
  function vehOf(id){ return vehicles().filter(function(v){ return v.id === id; })[0] || null; }

  /* 🔴🔴 v2.49.0 **「その日に出すか」は pit-share.js の `pitMaintSpanOn` 1本。**
     ここで条件を書かない＝ MHS の Today ボードが**まったく同じものを借りる**（写しを作らない）。
     ⚠ ゆうた確定「ここは PitFlow の当日も揃えて、言ったように特例として出してほしい」
        ＝ 日がまだ確定していない候補も、その日が期間に入っていれば**当日ビューに出す**。
           これは代車の**特例**（ふつうの車は日が決まっていないと出ない）。 */
  function todayList(ds){
    var cards = arr(w.state && w.state.cards);
    var hits = w.pitMaintCardsOn ? w.pitMaintCardsOn(cards, ds) : [];
    var out = [];
    hits.forEach(function(x){
      var v = vehOf(x.card.maintVehId); if (!v || v.retired) return;
      out.push({ rec:{ id: recId(x.card, x.span), card:x.card, cardId:x.card.id, sid:x.span.sid,
                       fromDate:x.span.from, toDate:x.span.to, work:x.card.workType },
                 veh:v, work:x.card.workType, label:(WORK_LB[x.card.workType] || '整備'),
                 fixed:x.fixed, urgent:!!x.card.urgent, memo:x.card.memo || '' });
    });
    return out;
  }

  /* 🔴🔴 v2.48.0（ゆうた指摘「網掛けがはいった変な表示」）
     **ふつうの入庫行と同じ骨格で組む。**
     ◎前まで
       `tr-side` という当日ビューに無い入れ物を使い、CSS で網掛けをかけて区別していた。
       ＝ **当日ビューの中に、うちだけ違う見た目の行**があった。
     🔴 いまは `tr-time` / `tr-front` / `tr-main` / `tr-tags`（3スロット）＝**ふつうの行と同じ並び**。
        区別は**担当バッジの「代車」と帯の色**だけでつく（網掛けは要らない）。
     ⚠ 作業バッジの出し方も、ふつうの行と同じ `state.workTypes` の色をそのまま使う。 */
  function todayHtml(ds){
    var list = todayList(ds);
    if (!list.length) return '';
    var h = '';
    list.forEach(function(x){
      var wt = arr(w.state && w.state.workTypes).filter(function(t){ return t.id === x.work; })[0];
      /* ⚠ v2.48.0 ナンバーと同じ行に入るので**短く**（長いと2行に折れて、行の高さがふつうの行とずれる） */
      var span = md(x.rec.fromDate) + '〜' + md(x.rec.toDate);
      var note = x.fixed ? (span + ' で確定') : ('候補 ' + span);
      h += '<div class="today-row tod-maint' + (x.urgent ? ' is-urgent' : '') + '"'
         + ' onclick="pitMaintTodayTap(\'' + x.rec.id + '\')" style="--team:' + MAINT_COLOR + '">'
         + '<div class="tr-time">終日</div>'
         + '<div class="tr-front is-div" style="background:' + MAINT_COLOR + '" title="自社の代車">代車</div>'
         + '<div class="tr-main">'
         +   '<div class="tr-headline"><span class="tr-customer">自社代車</span>'
         +   '<span class="tr-carname">' + esc(vehName(x.veh)) + '</span></div>'
         +   '<div class="tr-plateline">'
         +     (x.veh.plate ? '<span class="tr-plate">' + esc(x.veh.plate) + '</span>' : '')
         +     '<span class="tod-note">' + esc(note) + '</span>'
         +   '</div>'
         + '</div>'
         + '<div class="tr-tags">'
         +   '<div class="tr-tag-slot">' + (x.urgent ? '<span class="tag-side consult">急ぎ</span>' : '') + '</div>'
         /* ⚠ v2.48.0 受付タイプ（預かり／待ち／当日）の場所は**代車には無い**ので空ける。
            🔴 確定か候補かは `tod-note` の文字で言う。**他の意味のタグを借りない**
               （前は `tag-drop-drop` を借りていて、「預かり」とまったく同じ緑に見えた）。 */
         +   '<div class="tr-tag-slot"></div>'
         +   '<div class="tr-tag-slot tr-tag-work">'
         +     (wt ? '<span class="tag-work' + (wt.label.length >= 4 ? ' long' : '')
                   + '" style="background:' + wt.color + '20;color:' + wt.color + ';border-color:' + wt.color + ';">'
                   + esc(wt.label) + '</span>' : '')
         +   '</div>'
         + '</div>'
         + '</div>';
    });
    return h;
  }


  /* 🔴🔴 v2.48.0（ゆうた指摘「POPアップの画面も自前出し」）
     **当日ビュー共通のアクションシート（`pitTodaySheet`）に乗せる。**
     前までは代車カレンダー用の小さいポップ（`lo-bpop`）を自前で出していた＝
     同じ当日ビューの中に、押し方も閉じ方も違う窓が2種類あった。
     🔴 殻は today.js の1本。ここは**中身（ボタンの並び）だけ**を渡す。
     ⚠ ボタンの並びも、ふつうの車と同じ順にそろえてある
        （主ボタン＝入庫済みにする／見るだけ＝詳細／取り消し系＝いちばん下）。 */
  w.pitMaintTodayTap = function(recId){
    var r = recs().filter(function(x){ return x.id === recId; })[0];
    if (!r) return;
    var v = vehOf(r.vehicleId); if (!v) return;
    var wt = arr(w.state && w.state.workTypes).filter(function(t){ return t.id === r.work; })[0];
    var span = md(r.fromDate) + '〜' + md(r.toDate);
    if (!w.pitTodaySheet){ if (w.pitToast) w.pitToast('当日ビューが読み込めていません', 'PF-3057'); return; }
    w.pitTodaySheet(
      '<div class="ta-head"><b>自社代車</b>　' + esc(vehName(v))
        + (v.plate ? '<span class="ta-plate">' + esc(v.plate) + '</span>' : '')
        + '<div class="ta-sub">🔧 ' + esc(WORK_LB[r.work] || '整備')
        + (wt ? '' : '') + '・' + (r.stage === 'fixed' ? span + ' で確定' : '候補 ' + span + ' のうち今日')
        + (r.urgent ? '　<span class="ret-pend ret-pend-row">急ぎ</span>' : '') + '</div></div>'
      + '<button class="ta-btn primary" onclick="pitMaintIntake(\'' + recId + '\')">'
        + '<b><i data-ic=download data-ics=16></i> 入庫済みにする</b>'
        + '<span>タスクボードにカードが起きます（社内区分「代車」）</span></button>'
      + '<button class="ta-btn" onclick="pitMaintGotoFromToday(\'' + recId + '\')">'
        + '<b><i data-ic=clipboard data-ics=16></i> 詳細を見る</b>'
        + '<span>車両管理の日ビューで、この車の枠を見る・直す</span></button>'
      + '<button class="ta-btn danger" onclick="pitMaintSkip(\'' + recId + '\')">'
        + '<b><i data-ic=ban data-ics=16></i> 今日はやらない</b>'
        + '<span>この日ぶんだけ消えます（次の候補日を待ちます・未入庫には溜めません）</span></button>'
      + '<button class="ta-cancel" onclick="pitTodayActionClose()">閉じる</button>');
  };

  /* 当日ビューの「詳細を見る」＝車両管理の日ビューへ（飛び先は flMaintGoto の1本） */
  w.pitMaintGotoFromToday = function(recId){
    var r = recs().filter(function(x){ return x.id === recId; })[0];
    if (w.pitTodayActionClose) w.pitTodayActionClose();
    if (!r) return;
    if (w.flMaintGoto) w.flMaintGoto(r.vehicleId, String(r.fromDate || '').slice(0, 7));
  };


  /* 「今日はやらない」＝その日だけ消す（枠そのものは残る） */
  w.pitMaintSkip = function(recId, ds){
    var hit = spanOf(recId);
    if (w.pitTodayActionClose) w.pitTodayActionClose();   /* ⚠ v2.48.0 共通シートから押される */
    if (!hit) return;
    var c = hit.card, d = ds || today();
    if (!Array.isArray(c.maintSkipped)) c.maintSkipped = [];
    if (c.maintSkipped.indexOf(d) < 0) c.maintSkipped.push(d);
    saveCards();
    try { if (w.pitLog) w.pitLog('整備の枠を今日は見送った', { cardId:c.id, kind:'loaner',
      label:(WORK_LB[c.workType]||'') + ' ' + md(d) }); } catch(e){}
    if (w.renderToday) w.renderToday();
  };

  /* ==================================================================
     段取り5 ── 入庫 → タスクボードにカードを起こす
     ------------------------------------------------------------------
     🔴 受け皿（社内区分「代車」＋相方・売上非カウント）は **v2.6.0 でもう出来ている。**
        ここでやるのは「その形のカードを作って、点検待ちに置く」だけ。
     🔴 お客様は **自社（小林モータース）**。代車マスタに結び先が無いので、
        **ナンバーで顧客控えを引いて当てる**（見つかった時だけ代車マスタに覚える＝人の操作の中で書く）。
     ================================================================== */
  function ownerOf(v){
    if (!v) return null;
    /* すでに結んであればそれ */
    if (v.custId){
      var c0 = arr(w.state && w.state.customers).filter(function(c){ return c.id === v.custId; })[0];
      if (c0) return { cust:c0, veh: arr(c0.vehicles).filter(function(x){ return x.id === v.custVehId; })[0] || null };
    }
    var key = String(v.plate || '').replace(/\s/g, '');
    if (!key) return null;
    var hit = null;
    arr(w.state && w.state.customers).forEach(function(c){
      if (hit) return;
      arr(c.vehicles).forEach(function(x){
        if (hit) return;
        if (String(x.plate || '').replace(/\s/g, '') === key) hit = { cust:c, veh:x };
      });
    });
    return hit;
  }
  w.pitMaintOwner = ownerOf;

  /* 🔴🔴 v2.49.0 **入庫は `status` を進めるだけ。カードは作らない。**
     ＝ v2.48.0 で塞いだ「二重にカードができる」穴が、**構造的に起きえなくなった。**
     ⚠ ふつうの車の `pitTodayCheckIn` と同じことをしている（予約 → 点検待ち）。
        別の道を作っているのではなく、**同じ階段を、代車の窓から上っている**だけ。 */
  w.pitMaintIntake = function(recId){
    var hit = spanOf(recId);
    if (!hit){ w.pitAlert('この枠が見つかりません', { code:'PF-3060',
      detail:'画面を開き直してください。' }); return; }
    var c = hit.card, sp = hit.span;
    var v = vehOf(c.maintVehId);
    if (!v){ w.pitAlert('この車両が見つかりません', { code:'PF-3055' }); return; }
    if (c.status !== 'reserved' || c.actualInAt){
      w.pitAlert('この枠はもう入庫しています', { code:'PF-3058',
        detail:'タスクボードにカードがあります。そちらから進めてください。' });
      return;
    }
    var td = today();
    var own = ownerOf(v);
    var det = 'お客様＝自社（社内区分「代車」）。売上・完TEL・洗車・伝票はありません。\n'
            + (own ? ('顧客控え：' + (own.cust.name || '（名前なし）')) : '⚠ ナンバーで顧客控えを引けませんでした（そのまま入庫できます）');
    if (w.pitTodayActionClose) w.pitTodayActionClose();
    w.pitAsk('この代車を入庫させますか？', { title:(WORK_LB[c.workType] || '整備') + '　' + vehName(v), ok:'入庫する', detail:det })
      .then(function(yes){ if (yes) _intakeGo(c, sp, v, own, td); });
  };
  function _intakeGo(c, sp, v, own, td){
    /* ① その候補で確定させ、期間を実際に合わせる（④で完TELのときにもう一度縮む／伸びる） */
    c.maintFixSid = sp.sid;
    sp.from = td; if (sp.to < td) sp.to = td;
    /* ② 見つかったら代車マスタに覚える（人が押した操作の中なので書いてよい） */
    if (own && own.cust){
      v.custId = own.cust.id; if (own.veh) v.custVehId = own.veh.id;
      c.customer   = own.cust.name || c.customer;
      c.customerId = own.cust.id;
      if (own.veh && own.veh.karteNo) c.karteNo = own.veh.karteNo;
    }
    /* ③ 🔴 カードを作らない。**status を進めるだけ**（ふつうの車と同じ階段） */
    c.status      = 'check';
    c.intakeTbd   = false;
    c.reserveDate = td;
    c.bookedAt    = c.bookedAt || td;
    c.actualInAt  = td;
    if (w.logFlow) try { w.logFlow(c, '代車の整備で入庫した'); } catch(e){}
    saveCards();
    try { if (w.pitLog) w.pitLog('代車を整備で入庫した', { cardId:c.id, kind:'in',
      label: vehName(v) + ' / ' + (WORK_LB[c.workType] || '整備') }); } catch(e){}
    if (w.pitToast) w.pitToast('入庫しました → タスク「点検待ち」へ');
    if (w.renderToday) w.renderToday();
    if (w.state && w.state.currentView && w.showView) w.showView(w.state.currentView);
  }

  /* 🏁 完TEL関門を通った時＝**残りの候補をまとめて消す**（ゆうた指定「入庫時ではなく完TELで」）。
     ＋ ④ 本黄色を**実際の入庫〜返車に合わせる**。
     ⚠ 呼ぶのは intern-pit.js（社内車両の実績化）の1か所だけ。ここに条件を書き写さない。 */
  /* ==================================================================
     🏁 v2.53.0（ゆうた 2026-09-01）**「完了する」＝ボードで終わりを名乗る唯一の場所**
     ------------------------------------------------------------------
     🗣「実績（非カウント）に送られた時点で、代車作業予定のカードが完了に切替わり、
     　　2年足した満了日を表示。問題なければ『完了する』みたいなボタンがあって、
     　　押したら更新され、カードが消える。満了日が変わるようであればピッカーで選んで完了する」
     🗣「12点や一般等であれば、日付が出なくて『非実績に乗った日に終わりました』みたいな聞き方。挙動は同じ」

     ◎なぜ人に押させるのか
       車検は**更新**なので、新しい満了日は「通した日＋2年」ではなく「**いまの満了日＋2年**」。
       ただし車種や状況で1年のこともあるので、**必ず目で確かめてもらう**（既定を出して、違えば直す）。
     ◎押すと何が起きるか
       ・車検 … 車両の満了日を進める → 計算の目標が次の年へ動く＝行が消える
       ・12点 … 満了日は動かないので、**カードに済んだ印**（maintDone）を付けて行を消す
       ・一般・B.P・手で足したもの … 同じく済んだ印だけ
     ⚠ 自動では消さない。押し忘れて残っているのは**目に入ったほうが良い**（ゆうた指定）。
     ================================================================== */
  w.flMaintFinish = function(cardId){
    var c = cardOf(cardId);
    if (!c){ if (w.pitAlert) w.pitAlert('カードが見つかりません', { code:'PF-3062' }); return; }
    var v = vehOf(c.maintVehId);
    var isShaken = (c.workType === 'shaken');
    var cur = (v && v.shakenDate) || '';
    var next = cur ? _plus2y(cur) : '';
    var endDay = c.completedAt || c.returnDate || today();

    var h = '<h3 class="lo-modal-h"><i data-ic=check data-ics=16></i> ' + esc(WORK_LB[c.workType] || '整備') + ' を完了にする</h3>'
      + '<div class="lo-modal-b">'
      + '<div class="lo-modal-note">' + esc(vehName(v)) + '　' + esc(md(endDay)) + ' に終わりました。</div>';
    if (isShaken){
      h += '<div class="lo-modal-note">車検は<b>更新</b>なので、新しい満了日は「いまの満了日 ' + esc(cur || '（まだ入っていません）') + ' の2年後」です。'
         + '車検証と違っていたら直してください。</div>'
         + '<div class="lo-modal-row"><label class="lo-modal-f">新しい車検満了日'
         + '<input type="date" id="mbf-shaken" value="' + esc(next) + '"></label></div>';
    } else {
      h += '<div class="lo-modal-note">この作業には満了日がありません。日付は動きません。</div>';
    }
    h += '</div><div class="lo-modal-foot"><button onclick="flMaintClose()">キャンセル</button>'
       + '<button class="primary" onclick="flMaintFinishSave(\'' + c.id + '\')">完了する</button></div>';
    _modal(h);
  };

  /* いまの満了日の2年後（2/29 は 2/28 に寄せる） */
  function _plus2y(iso){
    var p = String(iso || '').split('-'); if (p.length !== 3) return '';
    var d = new Date(+p[0] + 2, +p[1] - 1, +p[2]);
    if (d.getMonth() !== (+p[1] - 1)) d = new Date(+p[0] + 2, +p[1], 0);   /* 末日はみ出し（2/29→2/28）を戻す */
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  w.flMaintFinishSave = function(cardId){
    var c = cardOf(cardId); if (!c) return;
    var v = vehOf(c.maintVehId);
    var isShaken = (c.workType === 'shaken');
    var newDue = '';
    if (isShaken){
      var el = document.getElementById('mbf-shaken');
      newDue = el ? String(el.value || '').trim() : '';
      if (!newDue){ if (w.pitAlert) w.pitAlert('新しい車検満了日を入れてください', { code:'PF-3063' }); return; }
      var cur = (v && v.shakenDate) || '';
      if (cur && newDue <= cur){
        if (w.pitAlert) w.pitAlert('新しい満了日が、いまの満了日（' + cur + '）より前になっています。'
          + '車検は更新なので、ふつうは先の日付になります。', { code:'PF-3064' }); return;
      }
    }
    /* ① 車検なら車両の満了日を進める（12ヶ月点検の目安もここから計算されるので一緒に動く） */
    if (isShaken && v){
      var before = v.shakenDate || '';
      v.shakenDate = newDue;
      if (w.PitDB) w.PitDB.save();
      try { if (w.pitLog) w.pitLog('車検満了日を更新した', { kind:'loaner',
        label: vehName(v) + '　' + (before || '（空）') + ' → ' + newDue }); } catch(e){}
    }
    /* ② 済んだ印＝ボードから行が消える唯一の合図 */
    c.maintDone = true;
    c.maintDoneAt = today();
    saveCards();
    try { if (w.pitLog) w.pitLog('代車の作業予定を完了にした', { cardId:c.id, kind:'loaner',
      label: (WORK_LB[c.workType] || '整備') + '　' + vehName(v) + (isShaken ? ('　次の満了 ' + newDue) : '') }); } catch(e){}
    flMaintClose();
    if (w.renderFleet) w.renderFleet();
    if (w.pitToast) w.pitToast('完了にしました' + (isShaken ? ('（次の車検満了 ' + newDue + '）') : ''));
  };

  w.pitMaintOnComplete = function(c){
    if (!c || !(w.pitCardMaint ? w.pitCardMaint(c) : Array.isArray(c.maintSpans))) return;
    var td = today();
    var keep = (c.maintSpans || []).filter(function(x){ return x.sid === c.maintFixSid; });
    var gone = (c.maintSpans || []).length - keep.length;
    if (keep[0]){
      keep[0].to = c.returnDate || c.completedAt || td;      /* 実際に合わせて縮む／伸びる */
      if (keep[0].to < keep[0].from) keep[0].to = keep[0].from;
    }
    c.maintSpans = keep;                                     /* 🔴 残りの候補はここで消える */
    /* ⚠⚠ v2.53.0 **ここで `maintDone` を立てない。**
       `maintDone` は「ボードで**完了するを押した**」という意味に変わった（flMaintFinish）。
       実績に入っただけで立ててしまうと、**車検満了日を進める前に行が消える**＝
       次の年の目標が出てこないまま、誰も気づけない。
       ここがやるのは「残りの候補を消す」と「期間を実際に合わせる」だけ。 */
    saveCards();
    try { if (w.pitLog && gone) w.pitLog('整備が終わったので残りの候補を消した', { cardId:c.id, kind:'loaner',
      label:'候補 ' + gone + '本' }); } catch(e){}
  };

  /* ==================================================================
     🚚 v2.49.0 **引っ越し（fleetEvents の整備の枠 → 予約カード）**
     ------------------------------------------------------------------
     🔴 **自動で走らせない。**人が設定画面のボタンを押した時だけ動く。
        画面を開いただけでクラウドに書く道は作らない（v2.22.0・「勝手に動く」を一番嫌う所）。
     🔴 元のレコードは**消さずに `migrated` の印を付けるだけ**。取り違えても元が残る。
     ⚠ 束ね方＝**同じ groupId のものが1枚のカード**（1作業＝1カード）。
        stage:'month' しか無いものも、候補が無いカードとして1枚作る。
     ================================================================== */
  function migrateList(){
    return arr(w.state && w.state.fleetEvents).filter(function(e){ return e && e.maint && !e.migrated; });
  }
  w.pitMaintMigrateCount = function(){
    var g = {}; migrateList().forEach(function(e){ g[e.groupId || e.id] = 1; });
    return { recs: migrateList().length, cards: Object.keys(g).length };
  };
  w.pitMaintMigrate = function(){
    var list = migrateList();
    if (!list.length) return { cards:0, recs:0 };
    var groups = {};
    list.forEach(function(e){
      var k = e.groupId || e.id;
      if (!groups[k]) groups[k] = [];
      groups[k].push(e);
    });
    var made = 0;
    Object.keys(groups).forEach(function(k){
      var es = groups[k];
      var month = es.filter(function(e){ return (e.stage||'') === 'month'; })[0] || null;
      var head  = month || es[0];
      var ym    = (month && month.ym) || ymOf(head.fromDate);
      var c = newMaintCard(head.vehicleId, head.work || 'general', ym,
                           { urgent: !!head.urgent, memo: head.memo || '' });
      es.forEach(function(e){
        if ((e.stage||'') === 'month') return;
        var sp = { sid: newSid(), from: e.fromDate, to: e.toDate };
        c.maintSpans.push(sp);
        if (e.stage === 'fixed') _fixSpan(c, sp);
        arr(e.skipped).forEach(function(d){ if (c.maintSkipped.indexOf(d) < 0) c.maintSkipped.push(d); });
      });
      es.forEach(function(e){ e.migrated = true; });
      made++;
    });
    saveCards();
    try { if (w.pitLog) w.pitLog('整備の枠をカードに引っ越した', { kind:'clean',
      label: made + ' 枚（元 ' + list.length + ' 件）' }); } catch(e){}
    return { cards: made, recs: list.length };
  };

  /* 設定画面に「引っ越し」の入口を出す。
     🔴🔴 v2.49.1（ゆうた報告「これがでないよ」）**必ず何か出す。**
     ◎やってしまったこと
       v2.49.0 は「引っ越すものが0件なら箱ごと出さない」作りだった。
       すると **「もう済んでいる」と「読み込めていない・壊れている」の区別がつかない。**
       押す人は「出ないんだけど」としか言いようがなくなる。
     🔴 だから**3つの顔を必ず出す**：やることがある／済んでいる／そもそも前の形が無い。
        ＝ **この箱が1つも出ない＝ v2.49.x が読み込まれていない**、と分かるようにする。
     ⚠ 見た目は自前で持つ。**他の機能のCSSを借りない**
        （前は blank-cards.js の `.pit-blank-box` を借りていたので、
          あちらが出ていない時は**枠も色も付かない裸の文字**になっていた）。 */
  function migCss(){
    if (document.getElementById('pit-maint-mig-css')) return;
    var st = document.createElement('style'); st.id = 'pit-maint-mig-css';
    st.textContent = [
      '.pit-mig-box{margin:18px 0;padding:14px 16px;border:1px solid var(--border,rgba(255,255,255,.14));',
      '  border-radius:12px;background:var(--bg2,#141a22);line-height:1.7}',
      '.pit-mig-box h4{margin:0 0 8px;font-size:14px;font-weight:800;display:flex;align-items:center;gap:6px}',
      '.pit-mig-box p{margin:0 0 10px;font-size:12.5px;color:var(--text2,#9aa7b4)}',
      '.pit-mig-box .pit-mig-n{font-weight:800;color:var(--text,#e6edf3)}',
      '.pit-mig-box .pit-mig-go{border:1px solid var(--accd);background:var(--accd);color:#fff;',
      '  border-radius:9px;padding:9px 18px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}',
      '.pit-mig-box .pit-mig-go:hover{filter:brightness(1.12)}',
      '.pit-mig-box.done{opacity:.75}',
      /* ⚠ 色は必ず変数から。ここに緑やピンクの数字を書かない（test_pit_rules が見張っている） */
      '.pit-mig-box .pit-mig-ok{font-size:12.5px;color:var(--green);font-weight:700}'
    ].join('');
    document.head.appendChild(st);
  }
  function appendMigrateBox(){
    /* 🗂 v2.50.0 設定画面がグループに分かれたので、**「道具」の中**に入る。
       ⚠ 場所が無い版（古い端末・別の並び）でも落ちないように、無ければ今までどおり一番下へ。 */
    var host = document.getElementById('ps-tools-body') || document.getElementById('view-settings-body');
    var old = document.getElementById('pit-maint-mig');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (!host) return;
    migCss();
    /* 🔴🔴 v2.49.2 **読み終わる前に「無い」と言わない。**
       v1.2.1 の決めごと（読む前に書かない）は、**数えて言い切る時にも同じ**。
       クラウドを読み終わる前に開くと、まだ空の手元を見て
       「前の形が1件も見つかりません」と**嘘をつく**（そして押す人はそれを信じる）。 */
    if (w.PIT_CLOUD && w.PitDB && !w.PitDB._loaded){
      var wait = document.createElement('div');
      wait.id = 'pit-maint-mig'; wait.className = 'pit-mig-box done';
      wait.innerHTML = '<h4><i data-ic=wrench data-ics=16></i> 代車の整備の枠を、予約カードに引っ越す</h4>'
        + '<p>まだクラウドを読み終わっていません。読み終わったらここに件数が出ます。'
        + '（この画面を開き直してください）</p>';
      host.appendChild(wait);
      try { if (w.icoBoot) w.icoBoot(wait); } catch (e) {}
      return;
    }
    var all  = arr(w.state && w.state.fleetEvents).filter(function(e){ return e && e.maint; });
    var done = all.filter(function(e){ return e.migrated; }).length;
    var n = w.pitMaintMigrateCount();
    var cards = mcards().length;

    var body;
    if (n.recs){
      body = '<p>v2.49.0 から、代車・自社車両の整備の予定は<b>ふつうの予約カード</b>になりました。'
           + 'それより前に置いた枠が <span class="pit-mig-n">' + n.recs + '</span> 件（作業 '
           + '<span class="pit-mig-n">' + n.cards + '</span> 本）残っています。<br>'
           + '押すと<b>作業1本につきカード1枚</b>を作り、候補（飛び地）はそのカードにまとめます。<br>'
           + '⚠ 元のデータは<b>消しません</b>（済みの印を付けるだけ）。取り違えても元が残ります。</p>'
           + '<button class="pit-mig-go" onclick="pitMaintMigrateGo()">この ' + n.cards + ' 本を引っ越す…</button>';
    } else if (done){
      body = '<p class="pit-mig-ok">✅ 引っ越し済みです（元データ ' + done + ' 件はそのまま残してあります）。</p>'
           + '<p>いま整備のカードは <span class="pit-mig-n">' + cards + '</span> 枚です。'
           + '作業予定ボード・当日ビュー・予約▸未定の「代車・自社車両」BOX で見られます。</p>';
    } else {
      body = '<p>引っ越すものはありません。<b>前の形（v2.48.0 まで）の枠が1件も見つかりません。</b><br>'
           + 'いま整備のカードは <span class="pit-mig-n">' + cards + '</span> 枚です。'
           + (cards ? 'こちらはもう新しい形なので、そのまま使えます。'
                    : '⚠ 心当たりがあるのに0枚なら、まだクラウドを読み終わっていないか、'
                      + '前の枠が消えている可能性があります。'
                      + '画面を開き直しても0枚のままなら、そう伝えてください。')
           + '</p>';
    }
    var box = document.createElement('div');
    box.id = 'pit-maint-mig';
    box.className = 'pit-mig-box' + (n.recs ? '' : ' done');
    box.innerHTML = '<h4><i data-ic=wrench data-ics=16></i> 代車の整備の枠を、予約カードに引っ越す</h4>' + body;
    host.appendChild(box);
    try { if (w.icoBoot) w.icoBoot(box); } catch (e) {}
  }
  w.pitMaintMigrateGo = function(){
    var n = w.pitMaintMigrateCount();
    if (!n.recs) return;
    w.pitAsk('整備の枠を予約カードに引っ越しますか？', {
      title:'代車の整備の引っ越し', ok:'引っ越す',
      detail:'作業 ' + n.cards + ' 本ぶんのカードを作ります（元の ' + n.recs + ' 件は消さずに残します）。\n'
           + '引っ越したあとは、作業予定ボード・当日ビュー・未定タブの「代車・自社車両」BOX で見られます。'
    }).then(function(yes){
      if (!yes) return;
      var r = w.pitMaintMigrate();
      if (w.pitToast) w.pitToast('引っ越しました（カード ' + r.cards + ' 枚）');
      if (w.showView) w.showView('settings');
    });
  };
  /* ⚠ 掛かったら止める。掛かっていない時だけ待つ（前は掛かったあとも待ち続けていた）。 */
  (function hookSettings(){
    if (typeof w.renderSettings === 'function'){
      if (w.renderSettings.__pitMaintMig) return;                /* もう掛かっている */
      var orig = w.renderSettings;
      var f = function(){ var r = orig.apply(this, arguments); try { appendMigrateBox(); } catch(e){} return r; };
      f.__pitMaintMig = 1; w.renderSettings = f;
      return;
    }
    setTimeout(hookSettings, 400);
  })();

  /* 小窓（代車カレンダーのものを借りる） */
  function _pop(html){
    flMaintPopClose();
    var p = document.createElement('div');
    p.id = 'mb-pop'; p.className = 'lo-bpop mb-pop'; p.innerHTML = html;
    document.body.appendChild(p);
    setTimeout(function(){ document.addEventListener('mousedown', _popOut, true); }, 0);
  }
  function _popOut(e){
    var p = document.getElementById('mb-pop');
    if (p && !p.contains(e.target)) flMaintPopClose();
  }
  w.flMaintPopClose = function(){
    var p = document.getElementById('mb-pop'); if (p) p.remove();
    document.removeEventListener('mousedown', _popOut, true);
  };

  w.pitMaintToday     = todayList;
  w.pitMaintTodayHtml = todayHtml;
  w.pitMaintPlansFor  = plansFor;

  w.pitMaintRows   = rows;
  w.pitMaintRecs   = recs;      /* ⚠ 見張り用。画面からは呼ばない（カードを直に見ればよい） */
  w.pitMaintBadges = badges;
  w.flMaintBoardHtml = boardHtml;
  w.PIT_MAINT_WORK_LB = WORK_LB;
})(window);

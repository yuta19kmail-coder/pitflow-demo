/* ========================================
   sales.js  -  売上ビュー（PitFlow v0.102.0）
   ----------------------------------------
   ・当月ビュー（既定）＝「今月の売上は順調か」を一目で。
     返車ベースの実績を最終確定として、パイプラインを確度別に積む：
       目標 / 実績(返車済) / 確定(パーツ待ち以降・実績前) / 予定(連絡中・見積済) /
       見込(入庫済・受注前=概算) / 予測(未入庫予約・月内に実績化可=概算)
     日次の累計と目標ペースを並べて進捗を明確化。1課/2課→フロント別に細分化。
   ・月間ビュー＝通年の月別実績と目標、昨対（前年の返車実績があれば）。
   金額：実績=amountFinal → 確定=amountOrder → 予定=amountQuote → 見込/予測=estAmount（無ければタイプ平均）
   ======================================== */
(function(){
  'use strict';

  /* 🔴 v1.167.0（ゆうた指定 2026-08-21）**「確定」から「実績待」を切り出して6区分にした。**
     🗣「実際にはここには**完了してるけど返車してないだけ**と**完了してないこれから作業する**が混ざっちゃってる」
     ⚠ **区分に入るかどうかを決めるのは sales-count.js の `pitSalesTier` 1本。**
        ここは**名前・色・説明**を持つだけ。条件をここに書かないこと。
     ⚠ 並びは**確からしい順**。画面はこの表の順に出す（表を並べ替えれば画面もそろって変わる）。 */
  var TIERS = [
    { id:'actual',     label:'実績',   color:'#1db97a', note:'返車済み（実績カレンダーに入った・確定売上）' },
    /* 🎨 v2.124.0（ゆうた指定 2026-09-26「実績と実績待の色の差が少なくて非常に見にくい」）
       青緑（#14b8a6）→ 黄緑。実績の緑と並べても一目で分かれ、確定の青とも混ざらない。 */
    { id:'actualWait', label:'実績待', color:'#84cc16', note:'作業完了・返車待ち（実績カレンダーにはまだ入っていない）' },
    { id:'confirmed',  label:'確定',   color:'#2563eb', note:'受注済・これから作業する（返車予定日がこの月）' },
    { id:'planned',    label:'予定',   color:'#38bdf8', note:'連絡中・見積提示済（返車予定日がこの月）' },
    { id:'prospect',   label:'見込',   color:'#f59e0b', note:'入庫済・受注前（返車予定日がこの月・概算）' },
    { id:'forecast',   label:'予測',   color:'#9ca3af', note:'未入庫予約・返車予定がこの月（概算）' }
  ];
  var TIER_BY = {}; TIERS.forEach(function(t){ TIER_BY[t.id] = t; });
  /* 🔴 v1.167.0 「ぜんぶ」「ほぼ確実」「確度高」の3つも**ここ1本**。
     ⚠ 画面ごとに `['actual','confirmed',…]` と並べ直さないこと（区分を足した時に必ず取りこぼす）。 */
  var TIER_IDS  = TIERS.map(function(t){ return t.id; });          /* ぜんぶ＝着地見込み */
  var TIER_NEAR = ['actual','actualWait'];                          /* 実績見込み＝もう作業は終わっている */
  var TIER_HIGH = ['actual','actualWait','confirmed'];              /* 確度高＝受注まで済んでいる */
  /* フロント別の表に出す区分（台数の多い順ではなく、確からしい順） */
  var TIER_FRONT = ['actual','actualWait','confirmed','planned'];

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function num(v){ v = +v; return isFinite(v) ? v : 0; }
  function man(n){ var m = n/10000; return (Math.abs(m)>=100 ? Math.round(m) : Math.round(m*10)/10).toLocaleString() + '万'; }
  function pd(s){ var p=String(s||'').split('-'); return new Date(+p[0],(+p[1])-1,+p[2]); }
  function ymdL(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function course(c){ if (c.division==='div1'||c.division==='div2') return c.division; return c.boardId==='import'?'div2':'div1'; }
  function estA(c){ return num(c.estAmount) || (window.pitEstAmount?num(pitEstAmount(c.workType, window.pitTeamKey?pitTeamKey(c):'default')):0); }

  /* 🔴 v1.61.0（ゆうた指定）「売上をどの月に数えるか」は js/sales-count.js の物差し1本に集約した。
        ここは**その日が、いま見ている期間に入っているか**を聞くだけ。**写しを作らないこと。**
        ・実績＝実績カウント日（completedAt）
        ・確定／予定／見込＝**返車予定日**。翌月以降ならその月へずらす。未定・予定日超過は当月に寄せる
        ・予測＝返車予定日。無ければ 入庫予定日＋概算 預かり日数 */
  function countDate(c){ return window.pitSalesCountDate ? pitSalesCountDate(c) : String(c.completedAt || c.returnDateFinal || c.returnDate || ''); }
  /* 🔴 v1.99.0 「売上なしでアーカイブ」した車か。**判定は sales-count.js の1本**（ここで c.noSale を直に見ない） */
  function noSale(c){ return !!(window.pitCardNoSale && pitCardNoSale(c)); }
  function inRange(c, fromStr, toStr, todayStr){
    if (window.pitSalesInRange) return pitSalesInRange(c, fromStr, toStr, todayStr);
    var d = countDate(c); return !!d && d>=fromStr && d<=toStr;
  }

  // カードがどの確度区分に入るか（当月[moS,moE]・本日todayStr基準）。該当なしは null
  function tierOf(c, moS, moE, todayStr){
    var tier = window.pitSalesTier ? pitSalesTier(c) : null;
    if (!tier) return null;
    return inRange(c, moS, moE, todayStr) ? tier : null;
  }
  /* 🔴 v1.167.0（ゆうた指定）**実績と実績待は、同じ拾い方にする。**
     ＝ `pitFinalAmountOf`（pit-share.js の1本）＝**確定 → 受注 → 見積 → 概算**。
     ◎なぜ
       実績待は**完TELを通っていて確定金額が入っている**ことが多い。
       実績化のときと同じ順で拾えば、**実績になった瞬間に数字が動かない**。
     ⚠ 拾う順をここに書き写さないこと（実績化の窓と食い違う）。 */
  function amtOf(c, tier){
    if (tier==='actual' || tier==='actualWait'){
      return window.pitFinalAmountOf ? num(pitFinalAmountOf(c))
           : (num(c.amountFinal)||num(c.amountOrder)||num(c.amountQuote)||estA(c));
    }
    if (tier==='confirmed') return num(c.amountOrder)||num(c.amountFinal)||num(c.amountQuote)||estA(c);
    if (tier==='planned')   return num(c.amountQuote)||estA(c);
    return estA(c);   // prospect / forecast ＝概算
  }
  /* 🆕 v2.146.0（ゆうた指定 2026-10-06「確定金額、見積金額、概算金額みたいな感じでどの状態かはっきりさせたい」）
     amtOf が**どの欄から拾ったか**＝'確定'／'受注'／'見積'／'概算'。
     🔴 拾う順は amtOf（実績・実績待は pitFinalAmountOf）と同じ。amtOf の順を変えたらここも一緒に変える。 */
  function amtKindOf(c, tier){
    function has(v){ return v != null && v !== ''; }
    if (tier==='actual' || tier==='actualWait'){
      if (has(c.amountFinal)) return '確定';
      if (has(c.amountOrder)) return '受注';
      if (has(c.amountQuote)) return '見積';
      return '概算';
    }
    if (tier==='confirmed'){
      if (num(c.amountOrder)) return '受注';
      if (num(c.amountFinal)) return '確定';
      if (num(c.amountQuote)) return '見積';
      return '概算';
    }
    if (tier==='planned') return num(c.amountQuote) ? '見積' : '概算';
    return '概算';
  }

  function target(){ var t=(state.settings&&state.settings.target)||{}; return { min: num(t.monthMin)||15000000, max: num(t.monthMax)||20000000 }; }
  /* 🆕 v2.124.0（ゆうた指定 2026-09-26「課の均等分配750万と1000万に縦線」）
     課ごとの目標＝月目標を**国産の％（ルール画面の ratioD・既定50）**で割ったもの。輸入＝全体−国産。
     ⚠ 割り方は rules.js の「部門に分ける」と同じ。app-summary.js（FlowDesk の売上ボード）もこれを借りる＝写しを作らない。 */
  function ratioD(){ var s=(state.settings&&state.settings.target)||{}; var r = s.ratioD!=null ? +s.ratioD : 50; return isFinite(r) ? r : 50; }
  function divTarget(k){
    var tg = target(), r = ratioD();
    var d1 = { min: Math.round(tg.min*r/100), max: Math.round(tg.max*r/100) };
    return k==='div1' ? d1 : { min: Math.round(tg.min)-d1.min, max: Math.round(tg.max)-d1.max };
  }

  // ===== 当月の集計 =====
  function collectMonth(moS, moE){
    var _td = new Date(); _td.setHours(0,0,0,0); var todayStr = ymdL(_td);
    var tiers = {}; TIERS.forEach(function(t){ tiers[t.id] = { sum:0, count:0 }; });
    var byCourse = { div1:{}, div2:{} };
    ['div1','div2'].forEach(function(k){ TIERS.forEach(function(t){ byCourse[k][t.id]={sum:0,count:0}; }); });
    var lastDay = pd(moE).getDate();
    var dayActual = []; for (var i=0;i<=lastDay;i++) dayActual[i]=0;   // 1..lastDay
    var fronts = {};   // frontStaff -> { 区分ごとの金額 … , count }（区分は TIER_FRONT）
    var rows = [];     /* 🆕 v2.122.0 1台ずつの内訳（FlowDesk の売上ボード用・app-summary.js が読む）。画面は使わない */
    /* 🆕 v2.145.0（ゆうた指定 2026-10-06）**保険・社員の「まだ実績でない分」は集計に足さず、参考の別枠へ。**
       🗣「実績になった社員と保険（入金により実績化）は入れてOK。抜いて欲しいのは実績待ちから下の予想値」
       ＝ 実績（actual）は今までどおり数える。実績待〜予測だけを ref に分ける。
       ⚠ rows には残す（`ref` に '保険'/'社員'）＝分析用の書き出し・AIレポートは今までどおり全台を引ける。
          **rows を足して合計を作る側は `r.ref` を飛ばすこと**（app-summary.js がそう）。 */
    var ref = { tiers:{}, byCourse:{ div1:{}, div2:{} }, rows:[] };
    TIERS.forEach(function(t){ ref.tiers[t.id]={sum:0,count:0}; ref.byCourse.div1[t.id]={sum:0,count:0}; ref.byCourse.div2[t.id]={sum:0,count:0}; });
    (state.cards||[]).forEach(function(c){
      var tier = tierOf(c, moS, moE, todayStr); if (!tier) return;
      var amt = amtOf(c, tier);
      var rk = (tier!=='actual' && window.pitSalesRefKind) ? pitSalesRefKind(c) : '';
      if (rk){
        var rcs = course(c);
        var rr = { c:c, tier:tier, amt:amt, course:rcs, front:(c.frontStaff||c.staff||'（未割当）'), ref:rk };
        rows.push(rr); ref.rows.push(rr);
        ref.tiers[tier].sum += amt; ref.tiers[tier].count++;
        ref.byCourse[rcs][tier].sum += amt; ref.byCourse[rcs][tier].count++;
        return;
      }
      tiers[tier].sum += amt; tiers[tier].count++;
      var cs = course(c); byCourse[cs][tier].sum += amt; byCourse[cs][tier].count++;
      rows.push({ c:c, tier:tier, amt:amt, course:cs, front:(c.frontStaff||c.staff||'（未割当）') });
      if (tier==='actual'){
        var d = countDate(c); var dd = pd(d).getDate();
        if (dd>=1 && dd<=lastDay) dayActual[dd] += amt;
      }
      /* 🔴 v1.167.0 フロント別にも**実績待**の列を足した（区分は TIER_FRONT 1本） */
      if (TIER_FRONT.indexOf(tier) >= 0){
        var fn = (c.frontStaff||c.staff||'（未割当）');
        if (!fronts[fn]){ fronts[fn] = { count:0 }; TIER_FRONT.forEach(function(id){ fronts[fn][id]=0; }); }
        fronts[fn][tier] += amt; fronts[fn].count++;
      }
    });
    // 日次累計
    var cum = []; cum[0]=0; for (var k=1;k<=lastDay;k++) cum[k] = cum[k-1] + dayActual[k];
    return { tiers:tiers, byCourse:byCourse, lastDay:lastDay, cum:cum, fronts:fronts, rows:rows, ref:ref };
  }
  /* 🆕 v2.122.0（2026-09-17 ゆうた：FlowDesk のサイドバーに PitFlow の売上カード）
     🔴 **app-summary.js の売上ボード（sections.salesBoard）は、この画面と同じ集め方を借りる。**
        区分・金額・課・フロントの見分けを向こうで書き直すと、画面と FlowDesk の数字が食い違う（写しの罠）。
     ⚠ ここは**呼び口だけ**。数え方を変える時は collectMonth / target の1本を直す。 */
  window.pitSalesMonthCollect = collectMonth;
  window.PIT_SALES_TIERS = TIERS;   /* 📊 v2.143.0 分析用の書き出し（analytics-pit.js）が区分の名前を引く。条件は持たない */
  window.pitSalesTarget = target;
  window.pitSalesDivTarget = divTarget;

  function sumTiers(t, ids){ var s=0; ids.forEach(function(id){ s += t[id].sum; }); return s; }

  /* ================= 🔴 v1.72.0（ゆうた指定）日次グラフの「当日の前後◯日」 =================
     ◎ゆうたの言葉
       「グラフの描写が当日の前後5日ぐらいの描写で、**ラベルの数字とかを再描写**するイメージ」
     ◎どういうことか
       月まるごとの1本の線だと、日々の動きが**平べったくなって読めない**。
       そこで **当日を真ん中に置いて、その前後◯日ぶんだけを描き直す**。
       🔴 **横軸（日付）だけでなく、縦軸（金額）の目盛りもその範囲に合わせて引き直す。**
          ＝0 から描かずに「その期間の下から上まで」を使うので、線の傾きがはっきり出る。
     ⚠ **数字そのものは1円も変えていない。**（実績・目標ペース・着地予測の計算は同じもの）
     ⚠ 当日が無い月（過去月・未来月）は当日を真ん中に置けないので**全体のまま**。 */
  /* 🔴 v1.72.1（ゆうた指定）並びは **広い → 狭い**（全体 → ±10日 → ±5日）。
     右へ行くほど拡大していく、という読み方に合わせる。 */
  var FOCUS_OPTS = [[0,'全体'],[10,'±10日'],[5,'±5日']];
  window.svSetFocus = function(n){ window._svFocus = +n||0; renderSales(); };
  function focusBtns(canFocus){
    var cur = +(window._svFocus||0);
    return '<span class="sv-focus'+(canFocus?'':' is-off')+'">'
      + FOCUS_OPTS.map(function(o){
          return '<button type="button" class="sv-fbtn'+(cur===o[0]?' on':'')+'"'
               + (canFocus?'':' disabled')+' onclick="svSetFocus('+o[0]+')">'+o[1]+'</button>';
        }).join('')
      + '</span>';
  }
  /* 目盛りの数字を「読める丸い数字」にする（1.3万・25万 のような刻み） */
  function niceStep(span, want){
    var raw = span/Math.max(1,(want||4));
    if (!(raw>0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(raw)/Math.LN10));
    var n = raw/p;
    var m = (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10);
    return m*p;
  }

  // ===== SVG：日次進捗チャート =====
  function dailyChartSvg(cum, lastDay, todayIdx, min, max, landing, canFocus){
    var W=720, H=232, padL=52, padR=16, padT=16, padB=28;
    var pw=W-padL-padR, ph=H-padT-padB;

    /* 描く日の範囲。全体＝1〜末日／フォーカス＝当日の前後◯日（月の端で切る）。
       ⚠ 当日が無い月（過去・未来）は真ん中に置くものが無いので、必ず全体で描く。 */
    var foc=canFocus ? (+(window._svFocus||0)) : 0, d0=1, d1=lastDay;
    if (foc>0 && todayIdx>=1){
      d0=Math.max(1, todayIdx-foc); d1=Math.min(lastDay, todayIdx+foc);
      if (d1-d0 < 1){ d0=1; d1=lastDay; foc=0; }     /* 幅が無いと線が引けない */
    } else foc=0;

    /* 目標ペースと着地予測は「その日の値」を出せる（どちらも直線）。フォーカスの上下端を測るのに使う。 */
    function paceAt(v, d){ return lastDay<=1 ? v : v*(d-1)/(lastDay-1); }
    function projAt(d){
      if (todayIdx<1 || todayIdx>=lastDay) return cum[todayIdx]||0;
      return cum[todayIdx] + (landing-cum[todayIdx])*(d-todayIdx)/(lastDay-todayIdx);
    }

    /* 縦軸の上下。全体は今までどおり 0 から。フォーカスは**見えている値の下〜上**まで。 */
    var yLo=0, yHi;
    if (!foc){
      yHi = (Math.max(max, landing, cum[lastDay]||0, min) || 1) * 1.08;
    } else {
      var vs=[];
      for (var q=d0;q<=d1;q++){
        vs.push(paceAt(min,q), paceAt(max,q));
        if (todayIdx>=1 && q<=todayIdx) vs.push(cum[q]||0);
        if (todayIdx>=1 && q>=todayIdx) vs.push(projAt(q));
      }
      yLo=Math.min.apply(null,vs); yHi=Math.max.apply(null,vs);
      if (!(yHi>yLo)) { yHi=yLo+1; }
      var pad=(yHi-yLo)*0.12; yLo=Math.max(0,yLo-pad); yHi=yHi+pad;
    }
    function X(day){ return padL + pw * (d1<=d0 ? 0 : (day-d0)/(d1-d0)); }
    function Y(v){ return padT + ph * (1 - (v-yLo)/(yHi-yLo||1)); }
    function clampX(d){ return Math.min(d1, Math.max(d0, d)); }

    var s = '<svg class="sv-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" role="img">';

    /* 🔴 目盛りの数字も引き直す（ここが「ラベルの数字とかを再描写」） */
    var ys=[];
    if (!foc){ ys=[0, min, max]; }
    else { var st=niceStep(yHi-yLo,4); for(var g=Math.ceil(yLo/st)*st; g<=yHi+1e-6; g+=st) ys.push(g); }
    ys.forEach(function(v){ var y=Y(v);
      s+='<line class="sv-grid" x1="'+padL+'" y1="'+y.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+y.toFixed(1)+'"/>';
      s+='<text class="sv-ylab" x="'+(padL-6)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end">'+man(v)+'</text>'; });

    // 目標ペース（0→max / 0→min）。フォーカス中は、その範囲を切り取った線分になる。
    s+='<line class="sv-pace sv-pace-max" x1="'+X(d0)+'" y1="'+Y(paceAt(max,d0)).toFixed(1)+'" x2="'+X(d1)+'" y2="'+Y(paceAt(max,d1)).toFixed(1)+'"/>';
    s+='<line class="sv-pace sv-pace-min" x1="'+X(d0)+'" y1="'+Y(paceAt(min,d0)).toFixed(1)+'" x2="'+X(d1)+'" y2="'+Y(paceAt(min,d1)).toFixed(1)+'"/>';

    if (todayIdx>=1){
      var a0=clampX(d0), a1=clampX(Math.min(todayIdx,d1));
      if (a1>=a0){
        var pts=[]; for(var k=a0;k<=a1;k++){ pts.push(X(k).toFixed(1)+','+Y(cum[k]||0).toFixed(1)); }
        var base=(padT+ph).toFixed(1);   /* 面の下辺＝枠の底（フォーカスで 0 が画面外でも塗りが切れない） */
        s+='<path class="sv-actual-area" d="M'+X(a0).toFixed(1)+','+base+' L'+pts.join(' L')+' L'+X(a1).toFixed(1)+','+base+' Z"/>';
        if (pts.length>1) s+='<polyline class="sv-actual-line" points="'+pts.join(' ')+'"/>';
      }
      if (todayIdx < lastDay && todayIdx <= d1){
        var p0=Math.max(todayIdx,d0);
        s+='<line class="sv-proj" x1="'+X(p0).toFixed(1)+'" y1="'+Y(projAt(p0)).toFixed(1)+'" x2="'+X(d1).toFixed(1)+'" y2="'+Y(projAt(d1)).toFixed(1)+'"/>';
      }
      if (todayIdx>=d0 && todayIdx<=d1){
        s+='<circle class="sv-actual-dot" cx="'+X(todayIdx).toFixed(1)+'" cy="'+Y(cum[todayIdx]||0).toFixed(1)+'" r="3.5"/>';
        s+='<line class="sv-today" x1="'+X(todayIdx).toFixed(1)+'" y1="'+padT+'" x2="'+X(todayIdx).toFixed(1)+'" y2="'+(padT+ph)+'"/>';
      }
    }
    /* 🔴 横軸の日付も引き直す（フォーカス中は1日ずつ） */
    var span=d1-d0+1;
    var step = foc ? (span<=12?1:2) : Math.max(1, Math.ceil(lastDay/8));
    for(var d=d0; d<=d1; d+=step){ s+='<text class="sv-xlab'+(d===todayIdx?' is-today':'')+'" x="'+X(d).toFixed(1)+'" y="'+(H-9)+'" text-anchor="middle">'+d+'</text>'; }
    if ((d1-d0)%step!==0) s+='<text class="sv-xlab" x="'+X(d1).toFixed(1)+'" y="'+(H-9)+'" text-anchor="middle">'+d1+'</text>';
    s+='</svg>';
    return s;
  }

  // ===== SVG：確度別の積み上げ横バー（着地見込み） =====
  function stackBarSvg(tiers, min, max, landing){
    var W=720, H=54, padL=8, padR=8, padT=10, h=22;
    var pw=W-padL-padR;
    var scale = Math.max(max, landing, 1) * 1.02;
    function w(v){ return pw * v/scale; }
    var s='<svg class="sv-stack" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">';
    s+='<rect class="sv-stack-bg" x="'+padL+'" y="'+padT+'" width="'+pw+'" height="'+h+'" rx="6"/>';
    var x=padL;
    TIERS.forEach(function(t){ var v=tiers[t.id].sum; if (v<=0) return; var ww=w(v); s+='<rect x="'+x.toFixed(1)+'" y="'+padT+'" width="'+Math.max(0,ww).toFixed(1)+'" height="'+h+'" fill="'+t.color+'"><title>'+t.label+' '+man(v)+'</title></rect>'; x+=ww; });
    // 目標マーカー（min / max）
    [{v:min,c:'#e5e7eb',lb:'最低 '+man(min)},{v:max,c:'#fbbf24',lb:'最高 '+man(max)}].forEach(function(mk){ var mx=padL+w(mk.v); s+='<line class="sv-mk" x1="'+mx.toFixed(1)+'" y1="'+(padT-6)+'" x2="'+mx.toFixed(1)+'" y2="'+(padT+h+6)+'" stroke="'+mk.c+'"/>'; s+='<text class="sv-mk-lb" x="'+mx.toFixed(1)+'" y="'+(padT+h+18)+'" text-anchor="middle">'+mk.lb+'</text>'; });
    s+='</svg>';
    return s;
  }

  /* ===================================================================
     🆕 v2.124.0（ゆうた指定 2026-09-26）**課別（1課/2課）＝積み上げの階段**
     🗣「それぞれのエリアの金額だけでなく、足していった総額も見たい」
        「実績に実績待ちでいくら → とりあえず黙っててもこれだけは確定ってるな、の判断に」
        「バーのグラフに、課の均等分配 750万と1000万に縦線がほしい」
     ◎形
       ・上＝課の積み上げ帯（全区分）。**最低／最高の縦線**を引く（目標は divTarget＝国産の％で割った額）
       ・下＝区分を確からしい順に1段ずつ足していく表。各段に**そこまでの合計**と**最低目標の何％か**を出し、
         細い帯で「どこまで積めたか」を見せる（その段で足した分だけ濃く・それまでの分は薄く）
       ・節目の段に名前＝実績待まで「ほぼ確実」／確定まで「確度高」／予測まで「着地」（上のヒーローと同じ言葉）
     ⚠ 区分の並び・色・節目は TIERS / TIER_NEAR / TIER_HIGH の1本から引く（ここに並べ直さない）。
     ⚠ 帯の物差しは**1課・2課で共通**（横に並べて長さで比べられるように）。
     =================================================================== */
  var COURSES = [
    { id:'div1', label:'1課', team:'<i data-ic=car data-ics=16></i> 国産',  color:'#1db97a' },
    { id:'div2', label:'2課', team:'<i data-ic=globe data-ics=16></i> 輸入', color:'#ec4899' }
  ];
  function courseStage(id){
    if (id===TIER_NEAR[TIER_NEAR.length-1]) return 'ほぼ確実';
    if (id===TIER_HIGH[TIER_HIGH.length-1]) return '確度高';
    if (id===TIER_IDS[TIER_IDS.length-1])   return '着地';
    return '';
  }
  /* 帯1本（upTo＝この区分までを描く／hi＝濃く描く区分。空なら全部濃く） */
  function courseBar(cc, upTo, hi, scale, tg, cls){
    var h = '<div class="sv-cbar '+(cls||'')+'"><div class="sv-cbar-tr">';
    for (var i=0;i<=upTo;i++){
      var t=TIERS[i], v=cc[t.id].sum; if (v<=0) continue;
      h += '<i class="'+(hi && hi!==t.id ? 'dim' : '')+'" style="width:'+(v/scale*100).toFixed(2)+'%;background:'+t.color+'" title="'+t.label+' '+man(v)+'"></i>';
    }
    h += '</div>';
    h += '<span class="sv-cbar-tk mn" style="left:'+(tg.min/scale*100).toFixed(2)+'%"></span>';
    h += '<span class="sv-cbar-tk mx" style="left:'+(tg.max/scale*100).toFixed(2)+'%"></span>';
    return h + '</div>';
  }
  function courseCards(byCourse){
    var TG = {}; COURSES.forEach(function(d){ TG[d.id] = divTarget(d.id); });
    var scale = Math.max.apply(null, COURSES.map(function(d){ return Math.max(TG[d.id].max, sumTiers(byCourse[d.id],TIER_IDS)); })) * 1.06 || 1;
    var h = '<div class="sv-courses">';
    COURSES.forEach(function(d){
      var cc = byCourse[d.id], tg = TG[d.id];
      var act = cc.actual.sum, land = sumTiers(cc,TIER_IDS), pAct = tg.min>0 ? Math.round(act/tg.min*100) : 0;
      h += '<div class="sv-course" style="--cc:'+d.color+'">';
      h += '<div class="sv-course-h"><span class="sv-course-pill" style="background:'+d.color+'">'+d.label+'</span><span class="sv-course-team">'+d.team+'</span>'
         + '<span class="sv-course-goal">目標 <b>'+man(tg.min)+'</b>〜<b>'+man(tg.max)+'</b></span></div>';
      h += '<div class="sv-course-sum">'
         + '<div><em>実績</em><b style="color:'+TIER_BY.actual.color+'">'+man(act)+'</b><span>最低の '+pAct+'%</span></div>'
         + '<div><em>ほぼ確実</em><b style="color:'+TIER_BY.actualWait.color+'">'+man(sumTiers(cc,TIER_NEAR))+'</b><span>実績＋実績待</span></div>'
         + '<div><em>着地見込み</em><b class="'+(land>=tg.min?'sv-ok':'sv-warn')+'">'+man(land)+'</b><span>'+(land>=tg.max?'最高も超える':land>=tg.min?'最低を超える':'最低まで あと '+man(tg.min-land))+'</span></div>'
         + '</div>';
      /* 上の帯＋縦線のラベル */
      h += '<div class="sv-cbar-lbs"><span class="mn" style="left:'+(tg.min/scale*100).toFixed(2)+'%">最低 '+man(tg.min)+'</span><span class="mx" style="left:'+(tg.max/scale*100).toFixed(2)+'%">最高 '+man(tg.max)+'</span></div>';
      h += courseBar(cc, TIERS.length-1, '', scale, tg, 'big');
      /* 積み上げの階段 */
      h += '<div class="sv-course-grid"><div class="sv-cl sv-cl-h"><span>区分</span><span>この区分</span><span>足した合計</span><span>最低比</span></div>';
      var cum = 0;
      TIERS.forEach(function(tt, i){
        var v = cc[tt.id].sum, n = cc[tt.id].count; cum += v;
        var st = courseStage(tt.id), p = tg.min>0 ? Math.round(cum/tg.min*100) : 0;
        var pc = cum>=tg.max ? 'sv-cl-max' : (cum>=tg.min ? 'sv-cl-ok' : '');
        h += '<div class="sv-cl sv-cc'+(st?' is-stage':'')+(v<=0?' is-zero':'')+'">'
           + '<span class="sv-cl-name"><span class="sv-cc-dot" style="background:'+tt.color+'"></span>'+(i?'<s>＋</s>':'')+'<span class="sv-cc-l">'+tt.label+'</span></span>'
           + '<span class="sv-cl-v">'+man(v)+'<i>'+n+'台</i></span>'
           + '<span class="sv-cl-cum">'+(st?'<em>'+st+'</em>':'')+man(cum)+'</span>'
           + '<span class="sv-cl-p '+pc+'">'+p+'%</span>'
           + courseBar(cc, i, tt.id, scale, tg, '')
           + '</div>';
      });
      h += '</div></div>';
    });
    h += '</div>';
    h += '<div class="sv-note sv-course-note">帯の縦線＝課の目標（<b>実線＝最低</b>・<b style="color:#d97706">点線＝最高</b>）。月目標を国産 '+ratioD()+'%：輸入 '+(100-ratioD())+'% で割った額です（ルール画面の「部門に分ける」）。'
       + '「足した合計」＝上の段からその段までを足した額。<b>実績待まで＝作業は終わっていて、黙っていてもほぼ入る額</b>です。</div>';
    return h;
  }


  /* ===================================================================
     🏢 v2.6.0（ゆうた指定）**参考：数えていない台数**
     -------------------------------------------------------------------
     🗣「中古車の整備があったから（売上ちょっと行かなかった）って理由付け」
     ＝ 売上が届かなかった月に、**その裏付けを数字のすぐ脇に置く**ためのもの。
     🔴 台数だけ。**金額は1円も混ぜない**（混ぜると分母がずれて読み間違いを生む）。
     ⚠ 拾う集合は実績ビューの「数えない側」と同じ＝実績日がこの月／作業完了 or 返車済み／
        `pitCardNoSale`（社内車両＋手で売上なしにした車）。
     =================================================================== */
  function _refNoCount(moS, moE){
    return (state.cards || []).filter(function (c) {
      if (!c || !c.completedAt) return false;
      if (c.completedAt < moS || c.completedAt > moE) return false;
      if (c.status !== 'workDone' && c.status !== 'returned') return false;
      return !!(window.pitCardNoSale && pitCardNoSale(c));
    });
  }
  function _refNoCountHtml(moS, moE){
    var txt = window.pitInternCountText ? pitInternCountText(_refNoCount(moS, moE)) : '';
    if (!txt) return '';
    return '<div class="sv-refnc"><i data-ic=info data-ics=14></i> ' + txt
         + '<span>売上には入っていません（実績ビューの「非カウント一覧」で見られます）</span></div>';
  }

  /* ===================================================================
     🆕 v2.145.0（ゆうた指定 2026-10-06）**参考（保険・社員）＝売上の集計に入れていない車の別枠**
     🗣「保険と社員は集計から抜いてほしい。ビュー自体も参考値として別枠として表示して欲しい」
     🔴 中身は collectMonth の `ref`（見分けは sales-count.js の pitSalesRefKind 1本）。ここで数え直さない。
     =================================================================== */
  function custCar(c){
    var n = window.pitCustName ? pitCustName(c) : String(c.customer||'');
    var car = window.pitCarLabel ? pitCarLabel(c) : String(c.car||'');
    return [n, car].filter(Boolean).join(' ') || '—';   /* 空の言い方は持たない（名前の1本＝pitCustName） */
  }
  function workText(c){ return cardWorkIds(c).map(wtLabel).join('・'); }
  function tierIdx(id){ return TIER_IDS.indexOf(id); }
  function refBox(ref){
    if (!ref || !ref.rows.length) return '';
    var tot = sumTiers(ref.tiers, TIER_IDS);
    var h = '<div class="sv-card sv-ref"><div class="sv-card-h"><span><i data-ic=info data-ics=16></i> 参考（保険・社員の実績待〜予測）＝売上の集計には入れていません</span>'
          + '<span class="sv-ref-tot">'+ref.rows.length+'台・'+man(tot)+'</span></div>';
    h += '<table class="sv-table"><thead><tr><th>課</th>'+TIERS.map(function(x){ return '<th>'+x.label+'</th>'; }).join('')+'<th>計</th></tr></thead><tbody>';
    COURSES.forEach(function(cd){
      var cc = ref.byCourse[cd.id];
      h += '<tr><td class="sv-td-name">'+cd.label+'（'+cd.team+'）</td>'
         + TIERS.map(function(x){ var o=cc[x.id]; return '<td class="sv-num">'+(o.count ? man(o.sum)+'<small> '+o.count+'台</small>' : '—')+'</td>'; }).join('')
         + '<td class="sv-num"><b>'+man(sumTiers(cc,TIER_IDS))+'</b></td></tr>';
    });
    h += '</tbody></table>';
    var list = ref.rows.slice().sort(function(a,b){ return a.course.localeCompare(b.course) || tierIdx(a.tier)-tierIdx(b.tier) || b.amt-a.amt; });
    h += '<table class="sv-table sv-ref-list"><thead><tr><th>課</th><th>区分</th><th>付加</th><th>お客様・車種</th><th>フロント</th><th>金額</th></tr></thead><tbody>';
    list.forEach(function(r){
      var cd = COURSES.filter(function(x){ return x.id===r.course; })[0] || COURSES[0];
      h += '<tr><td class="sv-td-name">'+cd.label+'</td><td>'+TIER_BY[r.tier].label+'</td><td>'+esc(r.ref)+'</td><td>'+esc(custCar(r.c))+'</td><td>'+esc(r.front)+'</td><td class="sv-num">'+man(r.amt)+'</td></tr>';
    });
    h += '</tbody></table>';
    h += '<div class="sv-note">実績になった保険（入金日で実績）・社員は上の集計に入っています。ここは<b>まだ実績でない見込みの値</b>だけです（保険は返車済みでも入金待ちの間はどの月にも出ません）。</div></div>';
    return h;
  }

  /* ===================================================================
     🆕 v2.145.0（ゆうた指定 2026-10-06）**区分別の一覧（実績〜見込）を A4 白黒の紙に**
     🗣「この感じに返車予定日を入れて、A4白黒印刷対応のPDFを自動で作成してDL出来るボタンを」
     ・課ごと（1課→2課）に、区分の合計と「足した合計」→ 区分ごとの1台ずつ → 参考（保険・社員）
     ・予測（未入庫の予約）は載せない（ゆうたの「実績から見込まで」）
     🔴 数字は collectMonth と同じ（区分・金額・どの月か）。紙を描くのは sales-print.js の svExportListPdf。
     =================================================================== */
  var TIER_LIST = TIER_IDS.filter(function(id){ return id!=='forecast'; });
  function md(s){ var p=String(s||'').split('-'); return p.length===3 ? (+p[1])+'/'+(+p[2]) : ''; }
  /* 返車日：返した車＝返車日／まだの車＝返車予定日（＝この月に数える日。未定は空） */
  /* 🆕 v2.146.0（ゆうた指定 2026-10-06「返車日なのか返車予定日ははっきり記載して」）
     返車の日付に**どの日か**の札を付ける。
       済＝返した日／確定＝確定返車日（C）／予定＝受注時にお客様に伝えた返車予定日（B）／🔴 v2.147.0 ゆうた指定「約束→予定」／概算＝入庫日＋預かり日数の目安（A）／未定
     🔴 日付の拾い方は return-slot.js の pitReturnDates 1本（C→B→A＝この月に数える日と同じ順）。 */
  function retOf(c){
    if (c.status==='returned') return { d:String(c.returnDateFinal || c.returnDate || ''), k:'済' };
    if (window.pitReturnDates){
      var r = pitReturnDates(c);
      if (r.c) return { d:String(r.c), k:'確定' };
      if (r.b) return { d:String(r.b), k:'予定' };
      if (r.a) return { d:String(r.a), k:'概算' };
      return { d:'', k:'未定' };
    }
    var d = String(countDate(c)||''); return { d:d, k: d ? '予定' : '未定' };
  }
  function listRow(r){
    var c = r.c, ro = retOf(c), ret = ro.d;
    return { tier:r.tier,
             when: r.tier==='actual' ? md(countDate(c)) : (window.pitCardStatusText ? pitCardStatusText(c) : c.status),
             ret: ret ? ro.k + ' ' + md(ret) : '未定', retKind: ro.k,
             amtKind: amtKindOf(c, r.tier),
             key: (r.tier==='actual' ? String(countDate(c)) : '') + '|' + (ret || '9999'),   /* 並び＝実績日→返車日（未定は最後） */
             name: custCar(c), work: workText(c), front: r.front, amt: r.amt, ref: r.ref||'' };
  }
  function byKey(a,b){ return a.key<b.key ? -1 : a.key>b.key ? 1 : 0; }
  function svListModel(){
    var ym = window._svYM;
    var moS = ymdL(new Date(ym.y, ym.m, 1)), moE = ymdL(new Date(ym.y, ym.m+1, 0));
    var d = collectMonth(moS, moE);
    return { title:'売上 区分別一覧（実績〜見込）', period:ym.y+'年'+(ym.m+1)+'月',
      courses: COURSES.map(function(cd){
        var cc = d.byCourse[cd.id], tg = divTarget(cd.id);
        var mine = d.rows.filter(function(r){ return !r.ref && r.course===cd.id && TIER_LIST.indexOf(r.tier)>=0; });
        var groups = TIER_LIST.map(function(id){
          var g = mine.filter(function(r){ return r.tier===id; }).map(listRow).sort(byKey);
          return { id:id, label:TIER_BY[id].label, note:TIER_BY[id].note, sum:cc[id].sum, count:cc[id].count, rows:g };
        });
        var refRows = d.ref.rows.filter(function(r){ return r.course===cd.id && TIER_LIST.indexOf(r.tier)>=0; })
          .map(listRow).sort(function(a,b){ return tierIdx(a.tier)-tierIdx(b.tier) || byKey(a,b); });
        return { id:cd.id, label:cd.label, team:(cd.id==='div1'?'国産':'輸入'), min:tg.min, max:tg.max, groups:groups, refRows:refRows };
      }) };
  }
  window.svListModel = svListModel;

  /* 🆕 v2.148.0（ゆうた指定 2026-10-06「クォーターの一番上のグラフは売上ビューとおなじ1か月間の全体の数字。メイングラフも同様」）
     売上ビュー（当月）の**上の数字の帯＋積み上げ帯＋日次の進捗**をここ1本にした。売上タブとクォータータブが同じ物を借りる。
     ⚠ 写しを作らないこと（片方だけ直して食い違う）。 */
  function monthTop(ym){
    var moS = ymdL(new Date(ym.y, ym.m, 1));
    var moE = ymdL(new Date(ym.y, ym.m+1, 0));
    var data = collectMonth(moS, moE);
    var t = data.tiers;
    var tg = target();
    var landing   = sumTiers(t, TIER_IDS);    /* 着地見込み＝ぜんぶ */
    var nearSure  = sumTiers(t, TIER_NEAR);   /* 🆕 v1.167.0 実績見込み＝実績＋実績待（もう作業は終わっている） */
    var committed = sumTiers(t, TIER_HIGH);   /* 確度高＝＋確定（受注まで済んでいる） */
    var actual = t.actual.sum;

    // 今日の位置（当月なら本日まで／過去月は満了／未来月は0）
    var today = new Date(); today.setHours(0,0,0,0);
    var isThis = (today.getFullYear()===ym.y && today.getMonth()===ym.m);
    var todayIdx = isThis ? today.getDate() : (ymdL(today) > moE ? data.lastDay : 0);
    var paceTarget = tg.min * (todayIdx/data.lastDay);   // 本日時点の目標ペース(最低)
    var pacePct = paceTarget>0 ? Math.round(actual/paceTarget*100) : 0;

    var h = '';

    // ヒーロー：着地見込み
    h += '<div class="sv-hero">';
    h += '<div class="sv-hero-row">';
    h += '<div class="sv-hero-main"><div class="sv-hero-lb">実績（返車済み）</div><div class="sv-hero-num" style="color:#1db97a">'+man(actual)+'<span>円</span></div>'
       + '<div class="sv-hero-sub">目標 '+man(tg.min)+'〜'+man(tg.max)+' ／ 達成率 <b>'+(tg.min>0?Math.round(actual/tg.min*100):0)+'%</b>（最低比）</div></div>';
    /* 🔴 v1.167.0（ゆうた指定「両方並べる」）
       ・**実績見込み**（実績＋実績待）＝**作業は終わっているので、ほぼこの額は入る**
       ・**確度高**（＋確定）＝受注まで済んでいる分も入れた額 */
    h += '<div class="sv-hero-main"><div class="sv-hero-lb">着地見込み（実績＋パイプライン）</div><div class="sv-hero-num" style="color:'+(landing>=tg.min?'#1db97a':'#f59e0b')+'">'+man(landing)+'<span>円</span></div>'
       + '<div class="sv-hero-sub sv-hero-sub2">'
       + '<span>実績見込み（実績＋実績待）<b style="color:'+TIER_BY.actualWait.color+'">'+man(nearSure)+'</b></span>'
       + '<span>確度高（＋確定）<b style="color:#2563eb">'+man(committed)+'</b></span>'
       + '</div></div>';
    if (isThis && todayIdx>0){
      var pc = pacePct>=100?'ok':(pacePct>=85?'near':'warn');
      h += '<div class="sv-hero-pace sv-pace-'+pc+'"><div class="sv-hero-lb">本日ペース</div><div class="sv-hero-num">'+pacePct+'<span>%</span></div><div class="sv-hero-sub">'+man(actual)+' / ペース目安 '+man(paceTarget)+'</div></div>';
    }
    h += '</div>';
    h += stackBarSvg(t, tg.min, tg.max, landing);
    h += '</div>';
    h += _refNoCountHtml(moS, moE);   /* 🏢 v2.6.0 参考：数えていない台数（社内車両・売上なし） */

    // 日次進捗チャート
    /* 🔴 v1.72.0 見出しに「全体／±5日／±10日」。当日が無い月（過去・未来）は押せない。 */
    var _canFocus = (isThis && todayIdx>=1 && data.lastDay>2);   /* 当月だけ（当日が真ん中に来る月だけ） */
    h += '<div class="sv-card"><div class="sv-card-h"><span><i data-ic=chart data-ics=16></i> 日次の進捗（返車＝実績の累計）</span><span class="sv-legend">'
       + '<i class="sv-lg sv-lg-actual"></i>実績累計 <i class="sv-lg sv-lg-proj"></i>着地予測 <i class="sv-lg sv-lg-min"></i>最低ペース <i class="sv-lg sv-lg-max"></i>最高ペース</span>'
       + focusBtns(_canFocus) + '</div>';
    h += dailyChartSvg(data.cum, data.lastDay, todayIdx, tg.min, tg.max, landing, _canFocus);
    h += '<div class="sv-note">実績は<b>実績カウント日</b>で計上。まだ返していない車は<b>返車予定日の月</b>に積む（予定が翌月ならこの月には出ない）。返車予定日が未定・予定日を過ぎた車は当月に寄せる。点線＝残りを今のパイプラインで積んだ着地予測。'
       + (_canFocus && (+(window._svFocus||0))>0
           ? '<br>🔎 <b>いま「当日の前後'+(+window._svFocus)+'日」だけを描いています。</b>縦の目盛りもこの期間に合わせて引き直しているので、<b>0円から始まっていません</b>（動きを大きく見せるため）。'
           : (_canFocus ? '<br>🔎 <b>±5日／±10日</b>を押すと、当日の前後だけを描き直します（縦の目盛りもその期間に合わせます）。' : ''))
       + '</div></div>';

    return { h:h, data:data, tg:tg, moS:moS, moE:moE };
  }

  // ===== 当月ビュー =====
  function renderMonth(wrap){
    var ym = window._svYM;
    var MT = monthTop(ym), data = MT.data, t = data.tiers, tg = MT.tg, moS = MT.moS, moE = MT.moE;
    var h = header('month', ym) + MT.h;

    // 確度別サマリー（6区分）
    h += '<div class="sv-tiers">';
    h += tierCard('target', '目標', '#eab308', man(tg.min)+'〜'+man(tg.max), '', '月目標（最低〜最高）');
    TIERS.forEach(function(tt){ h += tierCard(tt.id, tt.label, tt.color, man(t[tt.id].sum), t[tt.id].count+'台', tt.note); });
    h += '</div>';

    // 課別（1課/2課）
    h += courseCards(data.byCourse);

    // フロント別
    h += frontTable(data.fronts);

    /* 🆕 v2.145.0 参考（保険・社員）＝集計の外。いちばん下の別枠 */
    h += refBox(data.ref);

    h += '<div class="sv-foot">金額の取り方：実績＝確定額(amountFinal)／確定＝受注額／予定＝見積額／見込・予測＝概算（作業タイプ別平均）。数字はすべて円。<br>どの月に数えるか：実績＝実績カウント日／それ以外＝<b>返車予定日</b>（未定と予定日超過は当月）。<br><b>保険・社員の車は、実績になるまで集計に入れていません</b>（下の「参考」の別枠。実績になったら数えます）。</div>';
    wrap.innerHTML = h;
  }

  function tierCard(id, label, color, big, sub, note){
    return '<div class="sv-tier" style="--tc:'+color+'"><div class="sv-tier-top"><span class="sv-tier-dot" style="background:'+color+'"></span><span class="sv-tier-l">'+label+'</span>'+(sub?'<span class="sv-tier-cnt">'+sub+'</span>':'')+'</div>'
      + '<div class="sv-tier-num">'+big+'</div><div class="sv-tier-note">'+esc(note)+'</div></div>';
  }

  /* 🔴 v1.167.0 列は TIER_FRONT（実績・実績待・確定・予定）1本から作る。
     ⚠ 見出しも色も**区分の表から引く**＝区分を足した時にここが取りこぼさない。 */
  function frontTable(fronts){
    var rows = Object.keys(fronts).map(function(k){
      var f = fronts[k], o = { name:k, count:f.count, total:0 };
      TIER_FRONT.forEach(function(id){ o[id] = f[id]||0; o.total += o[id]; });
      return o;
    });
    rows.sort(function(a,b){ return b.actual-a.actual || b.total-a.total; });
    var labels = TIER_FRONT.map(function(id){ return TIER_BY[id].label; });
    var h = '<div class="sv-card"><div class="sv-card-h"><span><i data-ic=user data-ics=16></i> フロント別（'+labels.join('・')+'）</span></div>';
    if (!rows.length){ h += '<div class="sv-empty">対象データがありません</div></div>'; return h; }
    h += '<table class="sv-table"><thead><tr><th>フロント</th>'
       + TIER_FRONT.map(function(id){ return '<th>'+TIER_BY[id].label+'</th>'; }).join('')
       + '<th>台数</th></tr></thead><tbody>';
    rows.forEach(function(r){
      h += '<tr><td class="sv-td-name">'+esc(r.name)+'</td>'
         + TIER_FRONT.map(function(id){ return '<td class="sv-num" style="color:'+TIER_BY[id].color+'">'+man(r[id])+'</td>'; }).join('')
         + '<td class="sv-num">'+r.count+'</td></tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  // ===== 月間ビュー（通年・昨対） =====
  function renderYear(wrap){
    var y = window._svYear;   // 会計年度の締め年（11月が属する暦年）＝12月(前年)〜11月(この年)
    var tg = target();
    var SLOT = [12,1,2,3,4,5,6,7,8,9,10,11];   // スロット→表示月（0=12月）
    var monA = []; var monP = []; for (var i=0;i<12;i++){ monA[i]=0; monP[i]=0; }
    (state.cards||[]).forEach(function(c){
      if (c.status!=='returned') return;
      var d = countDate(c); if (!d) return;
      var dd = pd(d); var amt = num(c.amountFinal)||num(c.amountOrder)||estA(c);
      var cm=dd.getMonth(), cy=dd.getFullYear();
      var fy=(cm===11)?cy+1:cy, slot=(cm===11)?0:cm+1;   // 12月は翌年11月締めの年度・スロット0
      if (fy===y) monA[slot] += amt; else if (fy===y-1) monP[slot] += amt;
    });
    var yTotal = monA.reduce(function(a,b){return a+b;},0);
    var pTotal = monP.reduce(function(a,b){return a+b;},0);
    var hasPrev = pTotal>0;
    var rangeLbl = (y-1)+'年12月〜'+y+'年11月';
    var prevRange = (y-2)+'/12〜'+(y-1)+'/11';

    var h = '';
    h += header('year', {y:y});
    h += '<div class="sv-hero"><div class="sv-hero-row">';
    h += '<div class="sv-hero-main"><div class="sv-hero-lb">今年度 実績合計（'+rangeLbl+'・返車ベース）</div><div class="sv-hero-num" style="color:#1db97a">'+man(yTotal)+'<span>円</span></div><div class="sv-hero-sub">年目標 '+man(tg.min*12)+'〜'+man(tg.max*12)+'</div></div>';
    if (hasPrev){ var diff=yTotal-pTotal; h += '<div class="sv-hero-main"><div class="sv-hero-lb">前年度（'+prevRange+'）</div><div class="sv-hero-num" style="color:#9ca3af">'+man(pTotal)+'<span>円</span></div><div class="sv-hero-sub">昨対 <b style="color:'+(diff>=0?'#1db97a':'#ef4444')+'">'+(diff>=0?'+':'')+man(diff)+'</b></div></div>'; }
    h += '</div></div>';

    h += '<div class="sv-card"><div class="sv-card-h"><span><i data-ic=chart data-ics=16></i> 月別 実績と目標</span><span class="sv-legend"><i class="sv-lg sv-lg-actual"></i>今年度'+(hasPrev?' <i class="sv-lg sv-lg-prev"></i>前年度':'')+' <i class="sv-lg sv-lg-min"></i>月目標(最低)</span></div>';
    h += yearChartSvg(monA, monP, tg.min, hasPrev, SLOT);
    if (!hasPrev) h += '<div class="sv-note">前年度（'+prevRange+'）の返車実績がまだ無いため、昨対は表示していません。データが貯まると自動で出ます。</div>';
    h += '</div>';

    // 月別テーブル
    h += '<div class="sv-card"><div class="sv-card-h"><span>月別内訳</span></div><table class="sv-table"><thead><tr><th>月</th><th>実績</th><th>目標(最低)</th><th>達成率</th>'+(hasPrev?'<th>前年度</th><th>昨対</th>':'')+'</tr></thead><tbody>';
    for (var m=0;m<12;m++){ var a=monA[m]; var pct=tg.min>0?Math.round(a/tg.min*100):0; var pcc=pct>=100?'#1db97a':(pct>=85?'#eab308':'#ef4444');
      h += '<tr><td class="sv-td-name">'+SLOT[m]+'月</td><td class="sv-num" style="color:#1db97a">'+man(a)+'</td><td class="sv-num">'+man(tg.min)+'</td><td class="sv-num" style="color:'+pcc+'">'+(a>0?pct+'%':'—')+'</td>';
      if (hasPrev){ var pv=monP[m]; var df=a-pv; h += '<td class="sv-num" style="color:#9ca3af">'+man(pv)+'</td><td class="sv-num" style="color:'+(df>=0?'#1db97a':'#ef4444')+'">'+(pv>0||a>0?(df>=0?'+':'')+man(df):'—')+'</td>'; }
      h += '</tr>';
    }
    h += '<tr class="sv-tr-total"><td class="sv-td-name">合計</td><td class="sv-num" style="color:#1db97a">'+man(yTotal)+'</td><td class="sv-num">'+man(tg.min*12)+'</td><td class="sv-num">'+(tg.min>0?Math.round(yTotal/(tg.min*12)*100):0)+'%</td>'+(hasPrev?'<td class="sv-num" style="color:#9ca3af">'+man(pTotal)+'</td><td class="sv-num" style="color:'+(yTotal-pTotal>=0?'#1db97a':'#ef4444')+'">'+((yTotal-pTotal>=0?'+':'')+man(yTotal-pTotal))+'</td>':'')+'</tr>';
    h += '</tbody></table></div>';

    h += '<div class="sv-foot">月間ビューは会計年度（12月〜翌11月）の返車済み実績を月別に集計しています。当月の詳しい進捗は「当月」タブへ。</div>';
    wrap.innerHTML = h;
  }

  function yearChartSvg(monA, monP, min, hasPrev, slot){
    var W=720, H=240, padL=52, padR=16, padT=16, padB=28;
    var pw=W-padL-padR, ph=H-padT-padB;
    var yMax = (Math.max(min, Math.max.apply(null, monA), hasPrev?Math.max.apply(null, monP):0) || 1) * 1.12;
    function Y(v){ return padT + ph*(1 - v/yMax); }
    var bw = pw/12; var barW = bw*(hasPrev?0.34:0.5);
    var s='<svg class="sv-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">';
    [0, min].forEach(function(v){ var y=Y(v); s+='<line class="sv-grid'+(v===min?' sv-grid-min':'')+'" x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'"/>'; s+='<text class="sv-ylab" x="'+(padL-6)+'" y="'+(y+3)+'" text-anchor="end">'+man(v)+'</text>'; });
    for (var m=0;m<12;m++){
      var cx = padL + bw*m + bw/2;
      if (hasPrev){ var pvH=Y(0)-Y(monP[m]); s+='<rect class="sv-bar-prev" x="'+(cx-barW-1).toFixed(1)+'" y="'+Y(monP[m]).toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+Math.max(0,pvH).toFixed(1)+'"><title>'+slot[m]+'月 前年度 '+man(monP[m])+'</title></rect>'; }
      var aH=Y(0)-Y(monA[m]); var ax=hasPrev?(cx+1):(cx-barW/2);
      s+='<rect class="sv-bar-act" x="'+ax.toFixed(1)+'" y="'+Y(monA[m]).toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+Math.max(0,aH).toFixed(1)+'"><title>'+slot[m]+'月 '+man(monA[m])+'</title></rect>';
      s+='<text class="sv-xlab" x="'+cx.toFixed(1)+'" y="'+(H-9)+'" text-anchor="middle">'+slot[m]+'</text>';
    }
    s+='</svg>';
    return s;
  }

  // ===== 作業グループ（車検 > 12点 > 一般。複数ラベルは上位優先・下位切り捨て） =====
  var WGROUPS = [
    { id:'shaken', label:'車検', color:'#ef4444' },
    { id:'12pt',   label:'12点', color:'#f97316' },
    { id:'general',label:'一般', color:'#84cc16' }
  ];
  function cardWorkIds(c){
    var a = (Array.isArray(c.workTypes)&&c.workTypes.length) ? c.workTypes.slice() : [];
    if (c.workType && a.indexOf(c.workType)<0) a.unshift(c.workType);
    (Array.isArray(c.workAddons)?c.workAddons:[]).forEach(function(x){ if(a.indexOf(x)<0) a.push(x); });
    return a;
  }
  function workGroupOf(c){ var ids=cardWorkIds(c); if(ids.indexOf('shaken')>=0) return 'shaken'; if(ids.indexOf('12pt')>=0) return '12pt'; return 'general'; }
  function workSubLabel(c){ var ids=cardWorkIds(c).filter(function(x){return x!=='shaken'&&x!=='12pt';}); var order=['general','oil','bp','coat1y','coat3m']; for(var i=0;i<order.length;i++){ if(ids.indexOf(order[i])>=0) return order[i]; } return ids[0]||'general'; }
  function wtLabel(id){ var w=(state.workTypes||[]).find(function(x){return x.id===id;}); return w?w.label:id; }
  function actAmt(c){ return num(c.amountFinal)||num(c.amountOrder)||estA(c); }
  function orderDateMs(c){ if (Array.isArray(c.log)){ for(var i=0;i<c.log.length;i++){ var e=c.log[i]; if(e && e.type==='phase' && e.to==='parts' && e.at) return e.at; } } if (c.orderedAt) return c.orderedAt; return null; }
  function qOfDay(dd){ return dd<=7?0:dd<=15?1:dd<=23?2:3; }
  function qAlloc(y, m1){ if (window.pitQAlloc){ try{ return pitQAlloc(y, m1); }catch(e){} } return null; }
  function pct(a,b){ return b>0?Math.round(a/b*100):0; }

  // ================= クォーター：当月（月4分割＋確度の区分・翌Qリミット） =================
  function qWindow(y,m,qi){ var last=new Date(y,m+1,0).getDate(); var rr=[[1,7],[8,15],[16,23],[24,last]][qi]; return { s:ymdL(new Date(y,m,rr[0])), e:ymdL(new Date(y,m,rr[1])), f:rr[0], t:rr[1] }; }
  function nextQEnd(y,m,qi){ if(qi<3) return qWindow(y,m,qi+1).e; var nm=new Date(y,m+1,1); return qWindow(nm.getFullYear(),nm.getMonth(),0).e; }
  /* 🔴 v1.170.0 **クォーター（月4分割）の窓を外へ貸す。**
     ◎なぜ
       データチェックの「クォーターチェック」が**同じ区切り**を出す必要がある。
       あちらで `dd<=7?0:…` を書き写すと、区切りを変えた日に**片方だけ古くなる**。
     ⚠ 区切りそのものは上の qOfDay / qWindow の1本のまま。ここは**呼び口**だけ。
     戻り＝{ y, m1（1〜12）, qi（0〜3）, no（1〜4）, s, e, label } */
  window.pitQuarterOf = function (dateStr) {
    var d = dateStr ? pd(dateStr) : new Date();
    if (!d || isNaN(d.getTime())) d = new Date();
    var qi = qOfDay(d.getDate());
    var wq = qWindow(d.getFullYear(), d.getMonth(), qi);
    return { y: d.getFullYear(), m1: d.getMonth() + 1, qi: qi, no: qi + 1,
             s: wq.s, e: wq.e, label: (d.getMonth() + 1) + '月 第' + (qi + 1) + 'クォーター' };
  };
  /* ===================================================================
     🆕 v2.148.0（ゆうた指定 2026-10-06）**クォーター＝Qが終わった直後のMTGの資料**
     🗣「Qをまたいだ日に、そのQの実績、翌Qの予測として簡易的なMTGをしてる。それで使う」
        「今Qでどのくらいやったのか／翌Qでどのぐらい入ってくるのか（金額面）って話ができればいい」
     ◎形
       ・上の切り替え＝Q1〜Q4（「当月／月間（年度）」はやめた。月×Qの達成率の表も、ゆうた「なくしていい」）
       ・いちばん上の数字と日次の進捗＝売上ビューと同じ「その月まるごと」（monthTop を借りる）
       ・Q1〜Q4 の箱はそのまま
       ・1課・2課＝**前Qまでの実績 → 選んだQの実績 → 次Qに入る見込み** の階段
     🔴 決めごと
       ・最初に出るQ＝**いま進行中のQ**（v2.149.0 で「直前に終わったQ」から変更）
       ・次Q＝Q4 の次は**翌月の Q1**（月をまたぐMTGなので）
       ・次Qの見込み＝次Qにもう返した実績 ＋ まだ返していない車で**返車予定日が次Qの終わりまで**のもの
         （予定日を過ぎた・未定の車も入れる＝MTGの日から見て「これから入るお金」）
       ・**次Qがもう終わっていたら見込みは出さない**＝次Qの実績だけ（後から開くと答え合わせになる）
       ・保険・社員の見込み（実績待〜予測）は外す＝売上ビューと同じ（pitSalesRefKind）
       ・金額の拾い方は売上ビューと同じ amtOf（前は実績を actAmt で拾っていて、タブで数字がずれることがあった）
       ・目標の縦線＝**月初から次Qの終わりまでの目標の合計**（営業日配分 qAlloc を課の％で割る）
     =================================================================== */
  /* 🔴 v2.149.0（ゆうた指定 2026-10-06「やっぱり前Qじゃなくて現Qに移動するように」）最初に出るQ＝**いま進行中のQ** */
  function qDefault(){ var t=new Date(); return { y:t.getFullYear(), m:t.getMonth(), q:qOfDay(t.getDate()) }; }
  function qSel(){ if (!window._svQ) window._svQ = qDefault(); return window._svQ; }
  function qNext(o){ if (o.q<3) return { y:o.y, m:o.m, q:o.q+1 }; var d=new Date(o.y, o.m+1, 1); return { y:d.getFullYear(), m:d.getMonth(), q:0 }; }
  function qShift(o, dir){ var q=o.q+dir, d=new Date(o.y, o.m, 1); while(q<0){ q+=4; d=new Date(d.getFullYear(), d.getMonth()-1, 1); } while(q>3){ q-=4; d=new Date(d.getFullYear(), d.getMonth()+1, 1); } return { y:d.getFullYear(), m:d.getMonth(), q:q }; }
  function qName(o){ return (o.m+1)+'月Q'+(o.q+1); }
  function qTarget(o){ var al=qAlloc(o.y, o.m+1), tg=target(); return al ? { min:al.q[o.q].min, max:al.q[o.q].max } : { min:Math.round(tg.min/4), max:Math.round(tg.max/4) }; }
  /* 課の分け方は divTarget と同じ（国産＝ratioD％・輸入＝残り） */
  function qDiv(v, k){ var d1=Math.round(v*ratioD()/100); return k==='div1' ? d1 : Math.round(v)-d1; }
  /* 🆕 v2.150.0（ゆうた指定 2026-10-06「単純割で 1875・3750・5625・7500 で目標を切ってるから、該当Qでその目標分を達成できてるかは表示して」）
     ＝ 課の月目標（divTarget）を**4等分した累計**。Qn までの目標＝月目標×n/4。全体は課の合計。
     ⚠ 上の縦線（営業日配分 qAlloc）とは別物。こちらは会社で決めている「単純割」の物差し。
     ⚠ 万の書き方は小数1桁まで（187.5万を 188万 と丸めない＝ゆうたが持っている数字と同じに見せる） */
  function qSimple(k, q){ var t = k ? divTarget(k) : target(); return { min: t.min*(q+1)/4, max: t.max*(q+1)/4 }; }
  function man1(v){ return (Math.round(v/1000)/10).toLocaleString('ja-JP', { maximumFractionDigits:1 })+'万'; }
  function qGoalOf(Q, k){
    var o = k ? Q.D[k] : qSum(Q), g = qSimple(k, Q.sel.q), act = o.prev + o.sel;
    return { act:act, min:g.min, max:g.max, ok:act>=g.min, okMax:act>=g.max, gap:g.min-act, p:pct(act,g.min) };
  }
  function qGoalHtml(Q, k){
    var G = qGoalOf(Q, k);
    return '<div class="sv-qgoal '+(G.ok?'is-ok':'is-ng')+'"><div><em>Q'+(Q.sel.q+1)+'までの目標（月目標を4等分）</em><b>'+man1(G.min)+'</b><span>最高 '+man1(G.max)+'</span></div>'
      + '<div><em>'+(Q.sel.q ? 'Q1〜Q'+(Q.sel.q+1) : 'Q1')+'の実績</em><b>'+man(G.act)+'</b><span>目標の '+G.p+'%</span></div>'
      + '<div class="sv-qgoal-v">'+(G.ok ? '<b>達成</b><span>＋'+man(-G.gap)+'</span>' : '<b>未達</b><span>あと '+man(G.gap)+'</span>')   /* v2.151.0 ゆうた「最高も達成は分かりにくい。素直に達成＋〇〇に」 */+'</div></div>';
  }

  function collectQuarter(sel){
    var _td=new Date(); _td.setHours(0,0,0,0); var todayStr=ymdL(_td);
    var nx=qNext(sel), sw=qWindow(sel.y,sel.m,sel.q), nw=qWindow(nx.y,nx.m,nx.q);
    var moS=ymdL(new Date(sel.y,sel.m,1)), moE=ymdL(new Date(sel.y,sel.m+1,0));
    var nextDone = nw.e < todayStr;
    /* 🆕 v2.152.0 一覧PDF（該当Q・翌Q・それ以外）のために、どの箱に入ったかの車も残す */
    function blank(){ var o={ prev:0, prevN:0, sel:0, selN:0, next:{}, nextSum:0, nextN:0, rows:[], selRows:[], prevRows:[], laterRows:[], refRows:[] }; TIERS.forEach(function(t){ o.next[t.id]={sum:0,count:0}; }); return o; }
    var D={ div1:blank(), div2:blank() }, qAct=[0,0,0,0], qCnt=[0,0,0,0];
    (state.cards||[]).forEach(function(c){
      var tier = window.pitSalesTier ? pitSalesTier(c) : null; if (!tier) return;
      var o = D[course(c)], d = String(countDate(c)||''), amt;
      if (tier==='actual'){
        if (!d) return;
        amt = amtOf(c,'actual');
        if (d>=moS && d<=moE){ var qi=qOfDay(pd(d).getDate()); qAct[qi]+=amt; qCnt[qi]++; }
        if (d>=moS && d<sw.s){ o.prev+=amt; o.prevN++; o.prevRows.push({ c:c, tier:tier, amt:amt }); }
        else if (d>=sw.s && d<=sw.e){ o.sel+=amt; o.selN++; o.selRows.push({ c:c, tier:tier, amt:amt }); }
        else if (d>=nw.s && d<=nw.e){ o.next.actual.sum+=amt; o.next.actual.count++; o.nextSum+=amt; o.nextN++; o.rows.push({ c:c, tier:tier, amt:amt }); }
        return;
      }
      if (nextDone) return;                                              /* 次Qが終わっている＝見込みは出さない（答え合わせ） */
      amt = amtOf(c, tier);
      var rk = window.pitSalesRefKind ? pitSalesRefKind(c) : '';
      if (rk){ if (!d || d<=nw.e) o.refRows.push({ c:c, tier:tier, amt:amt, ref:rk }); return; }   /* 保険・社員の見込みは外す（一覧の参考には出す） */
      if (d && d>nw.e){ o.laterRows.push({ c:c, tier:tier, amt:amt }); return; }                /* 次Qより先（一覧の「それ以外」） */
      o.next[tier].sum+=amt; o.next[tier].count++; o.nextSum+=amt; o.nextN++; o.rows.push({ c:c, tier:tier, amt:amt });
    });
    /* 目標＝月初〜選んだQの前／選んだQ／次Q */
    var tPrev={min:0,max:0}; for (var i=0;i<sel.q;i++){ var a=qTarget({y:sel.y,m:sel.m,q:i}); tPrev.min+=a.min; tPrev.max+=a.max; }
    var tSel=qTarget(sel), tNext=qTarget(nx);
    var tQ=[0,1,2,3].map(function(i){ return qTarget({y:sel.y,m:sel.m,q:i}); });
    return { sel:sel, nx:nx, sw:sw, nw:nw, todayStr:todayStr, nextDone:nextDone, selDone:(sw.e<todayStr), D:D, qAct:qAct, qCnt:qCnt,
             tPrev:tPrev, tSel:tSel, tNext:tNext, tQ:tQ,
             tAll:{ min:tPrev.min+tSel.min+tNext.min, max:tPrev.max+tSel.max+tNext.max } };
  }
  window.pitSalesQuarterCollect = collectQuarter;   /* 見張り用の呼び口（数え方は持たない） */
  function qSum(Q){
    var o={ prev:0, prevN:0, sel:0, selN:0, next:{}, nextSum:0, nextN:0 };
    TIERS.forEach(function(t){ o.next[t.id]={ sum:Q.D.div1.next[t.id].sum+Q.D.div2.next[t.id].sum, count:Q.D.div1.next[t.id].count+Q.D.div2.next[t.id].count }; });
    ['prev','prevN','sel','selN','nextSum','nextN'].forEach(function(f){ o[f]=Q.D.div1[f]+Q.D.div2[f]; });
    return o;
  }
  function qNextLabel(Q){ return Q.nextDone ? qName(Q.nx)+'の実績' : qName(Q.nx)+'に入る見込み'; }

  /* ===================================================================
     🆕 v2.152.0（ゆうた指定 2026-10-06「売上ビューと同じように該当Qと翌Qだけ・それ以外に分けてチェックPDFを出力できるように」）
     クォーターの一覧（A4白黒）＝売上タブの一覧PDFと同じ紙（sales-print.js drawList）に、帯（該当Q／翌Q／それ以外）を付けて渡す。
     🔴 中身は collectQuarter の箱そのまま（数え直さない）。1台の書き方は売上の一覧と同じ listRow。
     ・該当Q＝選んだQの実績
     ・翌Q＝翌Qの実績＋見込み（区分ごと）
     ・それ以外＝前Qまでの実績／翌Qより先の見込み（集計の外）
     ・参考＝保険・社員の見込み（翌Qまで）
     =================================================================== */
  function svQListModel(){
    var Q = collectQuarter(qSel());
    function grp(id, band, label, note, list, inSum, stage){
      var rows = list.map(listRow).sort(byKey), sum = list.reduce(function(a,r){ return a + r.amt; }, 0);
      return { id:id, band:band, label:label, note:note, sum:sum, count:list.length, rows:rows, inSum:inSum, stage:stage||'' };
    }
    return { title:'クォーター 区分別一覧（'+qName(Q.sel)+' → '+qName(Q.nx)+'）', period:Q.sel.y+'年'+(Q.sel.m+1)+'月',
      sumTitle:'該当Q＋翌Q', goalLabel:'該当Q＋翌Qの目標（単純割）', refTitle:'参考（保険・社員の見込み）', refNote:'翌Qまでに返る予定。集計には入れていません',
      courses: COURSES.map(function(cd){
        var o = Q.D[cd.id], dt = divTarget(cd.id);
        var groups = [ grp('sel', '該当Q：'+qName(Q.sel), qName(Q.sel)+'の実績', '選んだQに実績になった車（実績日）', o.selRows, true, '該当Q') ];
        TIERS.forEach(function(t, i){
          var list = o.rows.filter(function(r){ return r.tier===t.id; });
          /* 区分の説明から「（返車予定日がこの月…）」は外す（クォーターでは「この月」ではないため） */
          var nt = String(t.note||'').replace(/（[^）]*この月[^）]*）/g, '');
          groups.push(grp('nx_'+t.id, (Q.nextDone?'翌Q（実績・答え合わせ）：':'翌Q：')+qName(Q.nx), '翌Q '+t.label, nt, list, true, i===TIERS.length-1 ? '翌Qまで' : ''));
        });
        groups.push(grp('prev', 'それ以外（上の合計には入れていない）', '前Qまでの実績（'+(Q.sel.m+1)+'月）', '選んだQより前に実績になった車', o.prevRows, false));
        groups.push(grp('later', 'それ以外（上の合計には入れていない）', '翌Qより先の見込み', '返車予定日が翌Qの終わりより後', o.laterRows, false));
        return { id:cd.id, label:cd.label, team:(cd.id==='div1'?'国産':'輸入'),
                 min:dt.min/4*2, max:dt.max/4*2, groups:groups,
                 refRows: o.refRows.map(listRow).sort(byKey) };
      }) };
  }
  window.svQListModel = svQListModel;

  /* 🆕 v2.152.0（ゆうた指定「MTG用も売上ビューと同じようにビューのビジュアルそのままの感じで出力」）
     紙の材料＝画面の renderQuarter と同じ物（monthInfo・collectQuarter・qGoalOf）。sales-print.js drawQuarterGraphic が描く。 */
  function qGraphicInfo(Q){
    var A = qSum(Q), last = new Date(Q.sel.y, Q.sel.m+1, 0).getDate(), rr = [[1,7],[8,15],[16,23],[24,last]];
    var today = new Date(), isThis = (today.getFullYear()===Q.sel.y && today.getMonth()===Q.sel.m), todayQ = isThis ? qOfDay(today.getDate()) : -1;
    function goal(k){ var G=qGoalOf(Q,k); return { min:G.min, max:G.max, act:G.act, ok:G.ok, gap:G.gap, p:G.p, minTxt:man1(G.min), maxTxt:man1(G.max) }; }
    return {
      month: monthInfo({ y:Q.sel.y, m:Q.sel.m }),
      selName:qName(Q.sel), nxName:qName(Q.nx), nextLabel:qNextLabel(Q), nextDone:Q.nextDone, selQ:Q.sel.q,
      monthTargetTxt: man1(target().min),
      goalAll: goal(null),
      courses: COURSES.map(function(cd){
        var o = Q.D[cd.id];
        return { label:cd.label, team:(cd.id==='div1'?'国産':'輸入'), color:cd.color, goal:goal(cd.id),
                 prev:o.prev, prevN:o.prevN, sel:o.sel, selN:o.selN, next:o.nextSum, nextN:o.nextN,
                 min:qDiv(Q.tAll.min,cd.id), max:qDiv(Q.tAll.max,cd.id), selMin:qDiv(Q.tSel.min,cd.id), nxMin:qDiv(Q.tNext.min,cd.id),
                 nextTiers: TIERS.map(function(t){ return { label:t.label, color:t.color, sum:o.next[t.id].sum, count:o.next[t.id].count }; }) };
      }),
      qboxes: [0,1,2,3].map(function(i){ return { label:'Q'+(i+1), range:rr[i][0]+'〜'+rr[i][1]+'日', act:Q.qAct[i], cnt:Q.qCnt[i], min:Q.tQ[i].min, max:Q.tQ[i].max,
                 sel:i===Q.sel.q, nx:(Q.nx.y===Q.sel.y && Q.nx.m===Q.sel.m && Q.nx.q===i), now:i===todayQ }; }),
      note: (Q.nextDone ? Q.nx.m+1+'月Q'+(Q.nx.q+1)+'はもう終わっているので、見込みではなく実績です（答え合わせ）。'
                        : '翌Qの見込み＝翌Qにもう返した実績＋まだ返していない車で返車予定日が'+qName(Q.nx)+'の終わりまで（予定日を過ぎた・未定も含む）。保険・社員の見込みは入れていません。')
            + '縦線＝月初から'+qName(Q.nx)+'の終わりまでの目標（営業日配分）。Qnまでの目標＝月目標を4等分した累計。'
    };
  }

  /* 1課・2課の階段 */
  function qCourseCards(Q){
    var scale = Math.max.apply(null, COURSES.map(function(cd){ var o=Q.D[cd.id]; return Math.max(qDiv(Q.tAll.max,cd.id), o.prev+o.sel+o.nextSum); })) * 1.06 || 1;
    var h = '<div class="sv-courses">';
    COURSES.forEach(function(cd){
      var o = Q.D[cd.id], mn = qDiv(Q.tAll.min,cd.id), mx = qDiv(Q.tAll.max,cd.id);
      var land = o.prev+o.sel+o.nextSum, selMin = qDiv(Q.tSel.min,cd.id), nxMin = qDiv(Q.tNext.min,cd.id);
      function W(v){ return (Math.max(0,v)/scale*100).toFixed(2)+'%'; }
      /* 帯：前Qまで（薄い緑）→ 選んだQ（緑）→ 次Q（区分の色） */
      function bar(upTo, hi){
        var seg = [['prev',o.prev,TIER_BY.actual.color,'前Qまでの実績'],['sel',o.sel,TIER_BY.actual.color,qName(Q.sel)+'の実績']];
        TIERS.forEach(function(t){ seg.push(['next',o.next[t.id].sum,t.color,qName(Q.nx)+' '+t.label]); });
        var order = { prev:0, sel:1, next:2 };
        var b = '<div class="sv-cbar'+(upTo==null?' big':'')+'"><div class="sv-cbar-tr">';
        seg.forEach(function(s){
          if (s[1]<=0) return; if (upTo!=null && order[s[0]]>upTo) return;
          var dim = (hi && hi!==s[0]) || (!hi && s[0]==='prev');
          b += '<i class="'+(dim?'dim':'')+'" style="width:'+W(s[1])+';background:'+s[2]+'" title="'+s[3]+' '+man(s[1])+'"></i>';
        });
        b += '</div><span class="sv-cbar-tk mn" style="left:'+W(mn)+'"></span><span class="sv-cbar-tk mx" style="left:'+W(mx)+'"></span></div>';
        return b;
      }
      h += '<div class="sv-course" style="--cc:'+cd.color+'">';
      h += '<div class="sv-course-h"><span class="sv-course-pill" style="background:'+cd.color+'">'+cd.label+'</span><span class="sv-course-team">'+cd.team+'</span>'
         + '<span class="sv-course-goal">'+qName(Q.nx)+'までの目標 <b>'+man(mn)+'</b>〜<b>'+man(mx)+'</b></span></div>';
      h += qGoalHtml(Q, cd.id);   /* 🆕 v2.150.0 単純割の目標を達成しているか */
      h += '<div class="sv-course-sum">'
         + '<div><em>'+qName(Q.sel)+'の実績</em><b style="color:'+TIER_BY.actual.color+'">'+man(o.sel)+'</b><span>Q目標の '+pct(o.sel,selMin)+'%・'+o.selN+'台</span></div>'
         + '<div><em>'+qNextLabel(Q)+'</em><b style="color:#2563eb">'+man(o.nextSum)+'</b><span>Q目標の '+pct(o.nextSum,nxMin)+'%・'+o.nextN+'台</span></div>'
         + '<div><em>'+qName(Q.nx)+'までの着地</em><b class="'+(land>=mn?'sv-ok':'sv-warn')+'">'+man(land)+'</b><span>'+(land>=mx?'最高も超える':land>=mn?'最低を超える':'最低まで あと '+man(mn-land))+'</span></div>'
         + '</div>';
      h += '<div class="sv-cbar-lbs"><span class="mn" style="left:'+W(mn)+'">最低 '+man(mn)+'</span><span class="mx" style="left:'+W(mx)+'">最高 '+man(mx)+'</span></div>';
      h += bar(null, '');
      h += '<div class="sv-course-grid"><div class="sv-cl sv-cl-h"><span>段</span><span>この段</span><span>足した合計</span><span>最低比</span></div>';
      var rowsDef = [
        ['prev', '前Qまでの実績'+(Q.sel.q?'（Q1〜Q'+Q.sel.q+'）':''), o.prev, o.prevN, ''],
        ['sel',  qName(Q.sel)+'の実績', o.sel, o.selN, '実績'],
        ['next', qNextLabel(Q), o.nextSum, o.nextN, '着地']
      ];
      var cum = 0;
      rowsDef.forEach(function(r, i){
        cum += r[2]; var p = mn>0 ? Math.round(cum/mn*100) : 0, pc = cum>=mx ? 'sv-cl-max' : (cum>=mn ? 'sv-cl-ok' : '');
        h += '<div class="sv-cl sv-cc'+(r[4]?' is-stage':'')+(r[2]<=0?' is-zero':'')+'">'
           + '<span class="sv-cl-name">'+(i?'<s>＋</s>':'')+'<span class="sv-cc-l">'+esc(r[1])+'</span></span>'
           + '<span class="sv-cl-v">'+man(r[2])+'<i>'+r[3]+'台</i></span>'
           + '<span class="sv-cl-cum">'+(r[4]?'<em>'+r[4]+'</em>':'')+man(cum)+'</span>'
           + '<span class="sv-cl-p '+pc+'">'+p+'%</span>'
           + bar(i, r[0]) + '</div>';
      });
      h += '</div>';
      /* 次Qの中身（区分ごと） */
      h += '<div class="sv-qnext">'+TIERS.filter(function(t){ return o.next[t.id].count; }).map(function(t){
             return '<span style="--tc:'+t.color+'"><i></i>'+t.label+' <b>'+man(o.next[t.id].sum)+'</b><small>'+o.next[t.id].count+'台</small></span>'; }).join('')
         + (o.nextN ? '' : '<span class="sv-qnext-none">まだありません</span>') + '</div>';
      h += '</div>';
    });
    h += '</div>';
    h += '<div class="sv-note sv-course-note">縦線＝<b>月初から'+qName(Q.nx)+'の終わりまでの目標</b>（営業日配分を国産 '+ratioD()+'%：輸入 '+(100-ratioD())+'% で割った額）。'
       + (Q.nextDone ? qName(Q.nx)+'はもう終わっているので、見込みではなく<b>実績</b>を出しています（答え合わせ）。'
                     : '次Qの見込み＝次Qにもう返した実績＋まだ返していない車で<b>返車予定日が'+qName(Q.nx)+'の終わりまで</b>のもの（予定日を過ぎた・未定の車も入れる）。保険・社員の見込みは入れていません。')
       + '</div>';
    return h;
  }

  function renderQuarter(wrap){
    var sel = qSel(), Q = collectQuarter(sel), ym = { y:sel.y, m:sel.m };
    var h = header('quarter', sel);
    h += monthTop(ym).h;                                     /* 売上ビューと同じ「その月まるごと」 */
    /* Q1〜Q4 の箱。選んだQ・次Qに印 */
    var last = new Date(sel.y, sel.m+1, 0).getDate(), qs = [{f:1,t:7},{f:8,t:15},{f:16,t:23},{f:24,t:last}];
    var today = new Date(), isThis = (today.getFullYear()===sel.y && today.getMonth()===sel.m);
    var todayQ = isThis ? qOfDay(today.getDate()) : -1;
    /* 🔴 v2.149.0（ゆうた指定）箱は**押せない**・**いちばん下**へ（Qの切り替えは上の Q1〜Q4 だけ） */
    var qb = '<div class="sv-card"><div class="sv-card-h"><span><i data-ic=calendar data-ics=16></i> '+(sel.m+1)+'月のクォーター実績（月4分割・営業日配分）</span></div><div class="sv-qcards">';
    for (var i=0;i<4;i++){
      var p = pct(Q.qAct[i], Q.tQ[i].min), pc = p>=100?'ok':(p>=85?'near':'warn');
      var isSel = (i===sel.q), isNx = (Q.nx.y===sel.y && Q.nx.m===sel.m && Q.nx.q===i);
      qb += '<div class="sv-qcard'+((i===todayQ&&isThis)?' now':'')+(isSel?' sel':'')+'"><div class="sv-qcard-h">Q'+(i+1)+' <span>'+qs[i].f+'〜'+qs[i].t+'日</span>'
         + (isSel?'<em class="sel">選択中</em>':'')+(isNx?'<em class="nx">次Q</em>':'')+((i===todayQ&&isThis)?'<em>進行中</em>':'')+'</div>'
         + '<div class="sv-qcard-num" style="color:#1db97a">'+man(Q.qAct[i])+'</div><div class="sv-qbar"><i class="sv-'+pc+'" style="width:'+Math.min(100,p)+'%"></i></div>'
         + '<div class="sv-qcard-sub">目標 '+man(Q.tQ[i].min)+'〜'+man(Q.tQ[i].max)+' ／ <b class="sv-'+pc+'">'+p+'%</b> ／ '+Q.qCnt[i]+'台</div></div>';
    }
    qb += '</div></div>';
    /* 🆕 v2.150.0 全体の「単純割の目標」を課別の上に */
    h += '<div class="sv-card"><div class="sv-card-h"><span><i data-ic=flag data-ics=16></i> 全体：Q'+(sel.q+1)+'までの目標（月目標 '+man1(target().min)+' を4等分）</span></div>'+qGoalHtml(Q, null)+'</div>';
    h += qCourseCards(Q);
    h += qb;
    h += '<div class="sv-foot">クォーター＝1〜7 / 8〜15 / 16〜23 / 24〜末。Qが終わった日のMTG用＝<b>選んだQの実績</b>と<b>次のQに入る見込み</b>。いちばん上の数字と日次の進捗は「売上」と同じ（その月まるごと）。</div>';
    wrap.innerHTML = h;
  }
  window.svSetQ = function(q){ var s=qSel(); window._svQ = { y:s.y, m:s.m, q:+q }; renderSales(); };
  window.svShiftQ = function(dir){ window._svQ = dir===0 ? qDefault() : qShift(qSel(), dir); renderSales(); };

  // ================= 作業内容 =================
  function collectWork(fromStr,toStr){
    function cell(){ return {sum:0,cnt:0,lo:0,hi:0}; }
    function add(o,amt){ o.sum+=amt; o.cnt++; if(amt>o.hi)o.hi=amt; if(o.lo===0||amt<o.lo)o.lo=amt; }
    var g={}; WGROUPS.forEach(function(w){ g[w.id]={div1:cell(),div2:cell()}; });
    var sub={};
    (state.cards||[]).forEach(function(c){ if(c.status!=='returned')return; var d=countDate(c); if(d<fromStr||d>toStr)return; var amt=actAmt(c); var grp=workGroupOf(c), cs=course(c); add(g[grp][cs],amt);
      if(grp==='general'){ var sl=workSubLabel(c); if(!sub[sl])sub[sl]={div1:cell(),div2:cell()}; add(sub[sl][cs],amt); } });
    return {g:g,sub:sub};
  }
  function gTot(x){ return {sum:x.div1.sum+x.div2.sum, cnt:x.div1.cnt+x.div2.cnt}; }
  function renderWorkMonth(wrap){ var ym=window._svYM; wrap.innerHTML=header('month',ym)+workBody(collectWork(ymdL(new Date(ym.y,ym.m,1)),ymdL(new Date(ym.y,ym.m+1,0)))); }
  function workBody(w){
    var view=window._svWorkView||'info';
    var grand=WGROUPS.reduce(function(a,x){return a+gTot(w.g[x.id]).sum;},0)||1;
    var h='<div class="sv-viewsw"><button class="sv-vbtn'+(view==='info'?' on':'')+'" onclick="svSetWorkView(\'info\')">インフォグラフィック</button><button class="sv-vbtn'+(view==='table'?' on':'')+'" onclick="svSetWorkView(\'table\')">表</button></div>';
    if(view==='table'){
      ['div1','div2'].forEach(function(cs){ var cname=cs==='div1'?'<i data-ic=car data-ics=16></i> 国産':'<i data-ic=globe data-ics=16></i> 輸入';
        h+='<div class="sv-card"><div class="sv-card-h"><span>'+cname+'</span></div><table class="sv-table"><thead><tr><th>作業</th><th>台数</th><th>売上</th><th>平均単価</th><th>最低</th><th>最高</th><th>構成比</th></tr></thead><tbody>';
        var cTot=WGROUPS.reduce(function(a,x){return a+w.g[x.id][cs].sum;},0)||1;
        WGROUPS.forEach(function(x){ var o=w.g[x.id][cs]; var avg=o.cnt?o.sum/o.cnt:0;
          h+='<tr><td class="sv-td-name"><span class="sv-cc-dot" style="background:'+x.color+'"></span> '+x.label+'</td><td class="sv-num">'+o.cnt+'</td><td class="sv-num" style="color:#1db97a">'+man(o.sum)+'</td><td class="sv-num">'+man(avg)+'</td><td class="sv-num">'+(o.cnt?man(o.lo):'—')+'</td><td class="sv-num">'+(o.cnt?man(o.hi):'—')+'</td><td class="sv-num">'+pct(o.sum,cTot)+'%</td></tr>';
          if(x.id==='general'){ Object.keys(w.sub).sort(function(a,b){return w.sub[b][cs].sum-w.sub[a][cs].sum;}).forEach(function(sl){ var ss=w.sub[sl][cs]; if(!ss.cnt)return; h+='<tr class="sv-qn"><td class="sv-td-name">└ '+esc(wtLabel(sl))+'</td><td class="sv-num">'+ss.cnt+'</td><td class="sv-num">'+man(ss.sum)+'</td><td class="sv-num">'+man(ss.sum/ss.cnt)+'</td><td class="sv-num">'+man(ss.lo)+'</td><td class="sv-num">'+man(ss.hi)+'</td><td class="sv-num"></td></tr>'; }); }
        });
        h+='</tbody></table></div>';
      });
      return h;
    }
    // info：グループカード（国産/輸入 並列）
    h+='<div class="sv-wgcards">';
    WGROUPS.forEach(function(x){ var t=gTot(w.g[x.id]);
      h+='<div class="sv-wgcard" style="--cc:'+x.color+'"><div class="sv-wgcard-h"><span class="sv-course-pill" style="background:'+x.color+'">'+x.label+'</span><span class="sv-wgcard-tot">'+man(t.sum)+'／'+t.cnt+'台</span><span class="sv-wgcard-share">構成比 '+pct(t.sum,grand)+'%</span></div>';
      h+='<div class="sv-wgcard-body">';
      [['div1','<i data-ic=car data-ics=16></i> 国産','#1db97a'],['div2','<i data-ic=globe data-ics=16></i> 輸入','#ec4899']].forEach(function(cc){ var o=w.g[x.id][cc[0]]; var avg=o.cnt?o.sum/o.cnt:0;
        h+='<div class="sv-wgcol"><div class="sv-wgcol-h" style="color:'+cc[2]+'">'+cc[1]+'</div>';
        h+='<div class="sv-metric"><span>台数</span><b>'+o.cnt+'</b></div>';
        h+='<div class="sv-metric"><span>売上</span><b>'+man(o.sum)+'</b></div>';
        h+='<div class="sv-metric"><span>平均単価</span><b>'+man(avg)+'</b></div>';
        h+='<div class="sv-metric"><span>最低</span><b>'+(o.cnt?man(o.lo):'—')+'</b></div>';
        h+='<div class="sv-metric"><span>最高</span><b>'+(o.cnt?man(o.hi):'—')+'</b></div>';
        h+='</div>';
      });
      h+='</div></div>';
    });
    h+='</div><div class="sv-foot">返車済み実績。車検＞12点＞一般の優先で1台1グループ（複数ラベルは上位採用）。構成比は全体売上に対する割合。</div>';
    return h;
  }
  function renderWorkYear(wrap){
    var Y=window._svYear, SLOT=[12,1,2,3,4,5,6,7,8,9,10,11];
    var mon=[]; for(var i=0;i<12;i++){ mon[i]={shaken:0,'12pt':0,general:0}; }
    (state.cards||[]).forEach(function(c){ if(c.status!=='returned')return; var d=countDate(c); if(!d)return; var dd=pd(d),cm=dd.getMonth(),cy=dd.getFullYear(); var fy=(cm===11)?cy+1:cy; if(fy!==Y)return; var slot=(cm===11)?0:cm+1; mon[slot][workGroupOf(c)]+=actAmt(c); });
    var h=header('year',{y:Y});
    h+='<div class="sv-card"><div class="sv-card-h"><span><i data-ic=wrench data-ics=16></i> 作業グループ 月別推移（年度）</span><span class="sv-legend">'+WGROUPS.map(function(x){return '<i class="sv-lg" style="border-top-color:'+x.color+'"></i>'+x.label;}).join(' ')+'</span></div>'+workYearChart(mon,SLOT)+'</div>';
    var tot={shaken:0,'12pt':0,general:0}; mon.forEach(function(mm){ tot.shaken+=mm.shaken;tot['12pt']+=mm['12pt'];tot.general+=mm.general; });
    h+='<div class="sv-card"><div class="sv-card-h"><span>月別内訳</span></div><table class="sv-table"><thead><tr><th>月</th>'+WGROUPS.map(function(x){return '<th>'+x.label+'</th>';}).join('')+'<th>計</th></tr></thead><tbody>';
    for(i=0;i<12;i++){ var mm=mon[i]; var mt=mm.shaken+mm['12pt']+mm.general; h+='<tr><td class="sv-td-name">'+SLOT[i]+'月</td><td class="sv-num">'+man(mm.shaken)+'</td><td class="sv-num">'+man(mm['12pt'])+'</td><td class="sv-num">'+man(mm.general)+'</td><td class="sv-num" style="color:#1db97a">'+man(mt)+'</td></tr>'; }
    h+='<tr class="sv-tr-total"><td class="sv-td-name">合計</td><td class="sv-num">'+man(tot.shaken)+'</td><td class="sv-num">'+man(tot['12pt'])+'</td><td class="sv-num">'+man(tot.general)+'</td><td class="sv-num" style="color:#1db97a">'+man(tot.shaken+tot['12pt']+tot.general)+'</td></tr>';
    h+='</tbody></table></div><div class="sv-foot">会計年度・返車ベース。車検＞12点＞一般の優先で1台1グループ。</div>';
    wrap.innerHTML=h;
  }
  function workYearChart(mon,SLOT){
    var W=720,H=240,padL=52,padR=16,padT=14,padB=26,pw=W-padL-padR,ph=H-padT-padB;
    var max=Math.max.apply(null,mon.map(function(m){return m.shaken+m['12pt']+m.general;}).concat([1]))*1.1; function Y(v){return padT+ph*(1-v/max);}
    var bw=pw/12, barW=bw*0.6;
    var s='<svg class="sv-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet"><line class="sv-grid" x1="'+padL+'" y1="'+Y(0)+'" x2="'+(W-padR)+'" y2="'+Y(0)+'"/>';
    for(var i=0;i<12;i++){ var cx=padL+bw*i+bw/2, mm=mon[i], yb=Y(0);
      [['shaken',WGROUPS[0].color],['12pt',WGROUPS[1].color],['general',WGROUPS[2].color]].forEach(function(pair){ var v=mm[pair[0]]; if(v<=0)return; var hgt=Y(0)-Y(v); yb-=hgt; s+='<rect x="'+(cx-barW/2).toFixed(1)+'" y="'+yb.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+hgt.toFixed(1)+'" fill="'+pair[1]+'"><title>'+SLOT[i]+'月 '+wtLabel(pair[0])+' '+man(v)+'</title></rect>'; });
      s+='<text class="sv-xlab" x="'+cx.toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle">'+SLOT[i]+'</text>';
    }
    s+='</svg>'; return s;
  }

  // ================= フロント =================
  /* 🔴 v1.63.0 フロントの数字は**この1本で全部そろえる**（受注の質もここで一緒に積む）。
        別の集め方をもう1本作ると、同じ画面の中で母集団がずれる（＝写しの罠）。
     ⚠ 期間の判定は `inRange`（sales-count.js の物差し）。 */
  function collectFront(fromStr,toStr){
    var _td=new Date(); _td.setHours(0,0,0,0); var todayStr=ymdL(_td);
    var F={};
    function qCell(){ return {cnt:0,sum:0,base:0,qCnt:0,qSum:0,qFinal:0}; }
    function ens(n){
      if(!F[n]){
        F[n]={cnt:0,sum:0,hi:0,hold:0,holdN:0,holdMax:0,odDays:0,odN:0,dow:[0,0,0,0,0,0,0],grp:{shaken:0,'12pt':0,general:0},grpN:{shaken:0,'12pt':0,general:0},
              /* 🔴 v1.72.0（ゆうた指定） */
              gapSum:0,gapN:0,gapMax:0,      /* 概算返車日 → 実際の返車日 のズレ（＋＝読みより遅れた） */
              w2dSum:0,w2dN:0,               /* 預かりだけ：作業待ち → 作業完了 */
              d2rSum:0,d2rN:0,               /* 預かりだけ：作業完了 → 確定返車日 */
              q:{ all:qCell(), grp:{} }};
        WGROUPS.forEach(function(w){ F[n].q.grp[w.id]=qCell(); });
      }
      return F[n];
    }
    /* 日付だけで数える（時刻の端数で「0日」が「1日」に化けないように） */
    function dayMs(v){
      if (v == null || v === '') return null;
      var d = (typeof v === 'number') ? new Date(v) : pd(String(v));
      if (!d || isNaN(d.getTime())) return null;
      d.setHours(0,0,0,0); return d.getTime();
    }
    function dayDiff(a, b){ var x=dayMs(a), y=dayMs(b); return (x==null||y==null) ? null : Math.round((y-x)/86400000); }

    (state.cards||[]).forEach(function(c){ var fn=c.frontStaff||c.staff||'（未割当）';
      if(c.status==='returned' && !noSale(c) && inRange(c, fromStr, toStr, todayStr)){
        var d=countDate(c); var f=ens(fn); var amt=actAmt(c); var g=workGroupOf(c);
        f.cnt++; f.sum+=amt; if(amt>f.hi)f.hi=amt; f.grp[g]+=amt; f.grpN[g]++;
        if(c.reserveDate && d){ var hd=Math.round((pd(d)-pd(c.reserveDate))/86400000); if(hd>=0){ f.hold+=hd; f.holdN++; if(hd>f.holdMax)f.holdMax=hd; } }

        /* ───────── 🔴 v1.72.0 読みのズレ（暫定の預かり日数は当たっていたか） ─────────
           概算返車日 A ＝ 入庫日 ＋ 概算 預かり日数（return-slot.js の pitReturnA 1本から取る）。
           それと**実際に返した日**をくらべて、**＋＝読みより遅れた／−＝早く返せた**。
           ⚠ ここで「入庫日＋◯日」を組み立て直さないこと（A の作り方は return-slot.js が持っている）。 */
        var actual = c.returnDateFinal || c.returnDate || d;
        var estRet = window.pitReturnA ? pitReturnA(c) : '';
        var gap = (estRet && actual) ? dayDiff(estRet, actual) : null;
        if (gap != null){
          f.gapSum += gap; f.gapN++;
          if (Math.abs(gap) > Math.abs(f.gapMax)) f.gapMax = gap;   /* いちばん外した1台（符号つき） */
        }

        /* ───────── 🔴 v1.72.0 預かりの車だけ：中身の日数 ─────────
           作業待ち → 作業完了（＝ピットで実際にかかった日数）
           作業完了 → 確定返車日（＝終わってから引き取られるまでの日数）
           ⚠ 待ち・当日返しは「その日のうち」なので混ぜると平均が潰れる。**預かりだけ**（ゆうた指定）。
           ⚠ 工程に入った時刻は flow-pit.js の pitPhaseEnteredMs 1本から取る（フローを直せばここも改まる）。 */
        if ((window.pitDropEffective ? pitDropEffective(c) : c.dropType) === 'drop' && window.pitPhaseEnteredMs){
          var wMs = pitPhaseEnteredMs(c, 'work'), dMs = pitPhaseEnteredMs(c, 'workDone');
          var a1 = (wMs != null && dMs != null) ? dayDiff(wMs, dMs) : null;
          if (a1 != null && a1 >= 0){ f.w2dSum += a1; f.w2dN++; }
          var a2 = (dMs != null && actual) ? dayDiff(dMs, actual) : null;
          if (a2 != null && a2 >= 0){ f.d2rSum += a2; f.d2rN++; }
        }

        /* 受注の質＝基準値との差／見積との差 */
        var base=baseOf(c), q=num(c.amountQuote);
        [f.q.all, f.q.grp[g]].forEach(function(o){ o.cnt++; o.sum+=amt; o.base+=base; if(q>0){ o.qCnt++; o.qSum+=q; o.qFinal+=amt; } });
      }
      var om=orderDateMs(c); if(om){ var od=new Date(om); var ods=ymdL(od); if(ods>=fromStr&&ods<=toStr){ var f2=ens(fn); if(c.reserveDate){ var odd=Math.round((od-pd(c.reserveDate))/86400000); if(odd>=0){ f2.odDays+=odd; f2.odN++; } } f2.dow[od.getDay()]++; } }
    });
    return F;
  }
  /* ================= 受注の質（v1.63.0・ゆうた指定） =================
     🎯 ねらい＝「自分の受注は、決めてある基準より高く取れているのか低いのか」
                「見積のうち、どれだけ取りこぼしたのか」を数字にする。

     ◎軸1＝**基準値との差**
        🔴 v1.63.0（ゆうた指定）**比べる相手は、その月の会社平均ではなく「決めてある基準値」**。
        🔴 v1.64.0（ゆうた指定）その基準値は **`pitBaseAmount()`＝実売上の「平均」**（state.js の `PIT_BASE_AMOUNT`）。
           ⚠ **設定の概算金額（`pitEstAmount`）ではない。** あちらは新規予約用の**中央値**で、仕事が違う。
           中央値を評価の物差しにすると、分布が右に裾を引くぶん**全員がプラスに出て**「誰が上か」が読めない。
           平均を基準にすると**会社全体の差の合計がぴったりゼロ**＝純粋な配分になる。
        **なぜ月平均をやめたか**：月平均は自分の成績も混ざっているうえ、台数が少ない月は跳ねる。
        物差しが月ごとに動くと「先月より良くなったのか」が分からない。
        **基準値なら物差しが動かないので、誰と比べても、どの月で見ても、同じ土俵になる。**
        1台ずつ「自分が取った金額 − その車の基準値」を足していく。
        ⚠ **カードごとの概算金額（`estAmount`）は見ない**。手で直せる値なので物差しにならない（ゆうた確認済み）。
        ⏭ **この基準値は暫定。半年ほど本番で回したら実績から自動計算に切り替える**（設計の下書きは state.js の `PIT_BASE_AMOUNT` の頭に書いてある）。

     ◎軸2＝**見積との差** … 見積り中→連絡中で入れた見積額（`amountQuote`）と、確定額（`amountFinal`）の差。
        マイナス＝見積から落ちた（取りこぼし）。プラス＝見積より積めた。
        ⚠ **見積額が入っていない車は分母から外す**（比べようがないため）。

     ◎ゆうた確認済み
        ・測る対象＝**返車まで終わった車の確定額**（＝フロントビューの他の数字と同じ母集団）
        ・比べる相手＝**設定の概算金額の表**（2026-08-07 指定・それまでは月平均だった）
        ・見積と比べる最終金額＝**確定額（請求額）**
     ⚠ 期間の絞り込みは `pitSalesInRange`（sales-count.js）の物差しを通す。**写しを作らないこと。** */

  /* 基準値を引く時の作業タイプ＝カードの代表1つ（複数付いていれば先頭）。
     ⚠ チーム（国産／輸入）の判定は、アプリ共通の `pitTeamKey()` を使う。ここで別の判定を作らない。 */
  function baseWtOf(c){ return (Array.isArray(c.workTypes)&&c.workTypes.length) ? c.workTypes[0] : c.workType; }
  function baseOf(c){
    var t = window.pitTeamKey ? pitTeamKey(c) : 'default';
    try {
      if (window.pitBaseAmount) return num(pitBaseAmount(baseWtOf(c), t));       /* 評価用＝実売上の平均 */
      if (window.pitEstAmount)  return num(pitEstAmount(baseWtOf(c), t));        /* 部品が無い時の保険 */
    } catch(e){}
    return 0;
  }

  function diffPct(a,b){ return b>0 ? Math.round((a-b)/b*1000)/10 : 0; }    // 小数1桁の％
  function signMan(v){ return (v>0?'＋':v<0?'−':'±')+man(Math.abs(v)); }
  function signPct(v){ return (v>0?'＋':v<0?'−':'±')+Math.abs(v).toFixed(1)+'%'; }
  function diffCls(v){ return v>0?'sv-dup':(v<0?'sv-ddn':'sv-dfl'); }

  /* 比べる物差しそのものを見せる表（設定の概算金額）。
     何と比べているのか分からない数字は信じられないので、必ず上に出す。 */
  function baseTableHtml(){
    var wts=(state.workTypes||[]).filter(function(w){ return w && w.id; });
    if(!wts.length) return '';
    var h='<div class="sv-card"><div class="sv-card-h"><span><i data-ic=ruler data-ics=16></i> 基準値（比べるものさし）</span>'
         +'<span class="sv-legend">令和8年1〜6月 実売上999伝票の平均（税抜・法定費用除く）</span></div>';
    h+='<table class="sv-table"><thead><tr><th>区分</th>'+wts.map(function(w){return '<th>'+esc(w.label)+'</th>';}).join('')+'</tr></thead><tbody>';
    [{k:'default',label:'国産（1課）'},{k:'import',label:'輸入（2課）'}].forEach(function(t){
      h+='<tr><td class="sv-td-name">'+t.label+'</td>';
      wts.forEach(function(w){
        var v=0, own=false;
        try{ v=num(pitBaseAmount(w.id,t.k)); own=!!(window.PIT_BASE_AMOUNT && PIT_BASE_AMOUNT[t.k] && PIT_BASE_AMOUNT[t.k][w.id]!=null); }catch(e){}
        h+='<td class="sv-num">'+(v>0?man(v)+(own?'':'<i class="sv-qn">概算</i>'):'—')+'</td>';
      });
      h+='</tr>';
    });
    h+='</tbody></table><div class="sv-note">下の「基準値との差」は、1台ずつ<b>この表の金額</b>と比べた合計です。月ごとに動かない物差しなので、先月と今月をそのまま比べられます。<br>'
      +'⚠ これは<b>新規予約の「概算金額」（設定・中央値）とは別の数字</b>です。概算は控えめに見積もるのが仕事、こちらは真ん中を当てるのが仕事なので、兼用していません。'
      +'「概算」と付いているマスは当時の材料が無かったぶんで、設定の概算金額をそのまま借りています。<br>'
      +'⏭ <b>この基準値は暫定です。半年ほど運用したら、実績から自動計算に切り替えます</b>（直近6ヶ月を集計して、平均＝この物差し／中央値＝新規予約の概算）。</div></div>';
    return h;
  }

  /* 1人ぶんの「受注の質」＝インフォグラフィックのカードの中に続けて描く（v1.63.0 で1枚に統合） */
  function qualityBlockHtml(q){
    var A=q.all;
    if(!A.cnt) return '';
    var d1=A.sum-A.base, p1=diffPct(A.sum,A.base);
    var d2=A.qFinal-A.qSum, p2=diffPct(A.qFinal,A.qSum);
    var h='<div class="sv-qsep">受注の質</div>';
    h+='<div class="sv-q2">';
    h+='<div class="sv-qax"><div class="sv-qax-lb">基準値との差</div>'
      +(A.base>0
        ? '<div class="sv-qax-num '+diffCls(d1)+'">'+signMan(d1)+'<span>円</span></div>'
          +'<div class="sv-qax-sub '+diffCls(p1)+'">'+signPct(p1)+'</div>'
          +'<div class="sv-qax-note">自分 '+man(A.sum/A.cnt)+' ／ 基準 '+man(A.base/A.cnt)+'（1台あたり）</div>'
        : '<div class="sv-qax-num sv-dfl">—</div><div class="sv-qax-sub"></div><div class="sv-qax-note">基準値が設定されていません（設定 → 概算金額）</div>')
      +'</div>';
    h+='<div class="sv-qax"><div class="sv-qax-lb">見積との差（取りこぼし）</div>'
      +(A.qCnt
        ? '<div class="sv-qax-num '+diffCls(d2)+'">'+signMan(d2)+'<span>円</span></div>'
          +'<div class="sv-qax-sub '+diffCls(p2)+'">'+signPct(p2)+'</div>'
          +'<div class="sv-qax-note">見積 '+man(A.qSum)+' → 確定 '+man(A.qFinal)+'（'+A.qCnt+'台）</div>'
        : '<div class="sv-qax-num sv-dfl">—</div><div class="sv-qax-sub"></div><div class="sv-qax-note">見積額が入っている車がありません</div>')
      +'</div>';
    h+='</div>';
    h+='<table class="sv-table sv-qtbl"><thead><tr><th>内容</th><th>台数</th><th>基準との差</th><th>％</th><th>見積との差</th><th>％</th></tr></thead><tbody>';
    WGROUPS.forEach(function(w){
      var o=q.grp[w.id]; if(!o.cnt) return;
      var g1=o.sum-o.base, gp1=diffPct(o.sum,o.base);
      var g2=o.qFinal-o.qSum, gp2=diffPct(o.qFinal,o.qSum);
      h+='<tr><td class="sv-td-name"><i class="sv-dot2" style="background:'+w.color+'"></i>'+w.label+'</td>'
        +'<td class="sv-num">'+o.cnt+'</td>'
        +(o.base>0
          ? '<td class="sv-num '+diffCls(g1)+'">'+signMan(g1)+'</td><td class="sv-num '+diffCls(gp1)+'">'+signPct(gp1)+'</td>'
          : '<td class="sv-num">—</td><td class="sv-num">—</td>')
        +(o.qCnt
          ? '<td class="sv-num '+diffCls(g2)+'">'+signMan(g2)+'</td><td class="sv-num '+diffCls(gp2)+'">'+signPct(gp2)+'</td>'
          : '<td class="sv-num">—</td><td class="sv-num">—</td>')
        +'</tr>';
    });
    h+='</tbody></table>';
    return h;
  }

  /* ================= 🔴 v1.72.0 日数まわり（ゆうた指定） =================
     ◎① 読みのズレ（暫定の預かり日数は当たっていたか）
        概算返車日（入庫日＋概算 預かり日数）と、**実際に返した日**の差。
        **平均**＝ふだんどれくらい読みが甘い／堅いか。**最大**＝いちばん外した1台。
        ＋＝読みより**遅れた** ／ −＝**早く返せた**。
     ◎② 預かりの車だけ、中身を2つに割る
        **作業待ち → 作業完了**（ピットで実際にかかった日数）
        **作業完了 → 確定返車日**（終わってから引き取られるまでの日数）
        ⚠ 待ち・当日返しは「その日のうち」なので混ぜない（平均が潰れる）。
     ⚠ どれも**数えているだけ**。保存データは1バイトも触っていない。 */
  function dayStr(v, sign){
    if (v == null) return '—';
    var s = (Math.round(v*10)/10).toFixed(1).replace(/\.0$/,'');
    if (sign) s = (v>0?'＋':v<0?'−':'±') + s.replace('-','');
    return s + '日';
  }
  function gapCls(v){ return v==null ? '' : (v>0.5?' sv-dm-late':(v<-0.5?' sv-dm-early':'')); }
  function daysBlockHtml(r){
    var h='<div class="sv-fbar-lb">読みのズレ／預かりの中身</div><div class="sv-fdays">';
    h+='<div class="sv-dm'+gapCls(r.gap)+'"><span>概算とのズレ 平均</span><b>'+dayStr(r.gap,true)+'</b></div>';
    h+='<div class="sv-dm'+gapCls(r.gapMax)+'"><span>いちばん外した</span><b>'+dayStr(r.gapMax,true)+'</b></div>';
    h+='<div class="sv-dm"><span>作業待ち→完了<i>預かり '+(r.w2dN||0)+'台</i></span><b>'+dayStr(r.w2d)+'</b></div>';
    h+='<div class="sv-dm"><span>完了→確定返車<i>預かり '+(r.d2rN||0)+'台</i></span><b>'+dayStr(r.d2r)+'</b></div>';
    h+='</div>';
    return h;
  }

  function frontBody(F, fromStr, toStr){
    var view=window._svFrontView||'info';
    var DOW=['日','月','火','水','木','金','土'];
    var rows=Object.keys(F).map(function(n){ var f=F[n]; var gt=f.grp.shaken+f.grp['12pt']+f.grp.general; var dsum=f.dow.reduce(function(a,b){return a+b;},0);
      return { name:n, f:f, cnt:f.cnt, sum:f.sum, hi:f.hi, avg:f.cnt?f.sum/f.cnt:0, hold:f.holdN?f.hold/f.holdN:null, holdMax:f.holdMax, od:f.odN?f.odDays/f.odN:null, gt:gt, dsum:dsum,
        /* 🔴 v1.72.0 */
        gap:f.gapN?f.gapSum/f.gapN:null, gapMax:f.gapN?f.gapMax:null,
        w2d:f.w2dN?f.w2dSum/f.w2dN:null, w2dN:f.w2dN,
        d2r:f.d2rN?f.d2rSum/f.d2rN:null, d2rN:f.d2rN };
    });
    rows.sort(function(a,b){return b.sum-a.sum;});
    /* 🔴 v1.63.0（ゆうた指定）**受注の質は別の入口にしない**＝インフォグラフィックの1人ぶんのブロックに続けて描く。
          「1枚で見たい」ため。ブロックが縦に伸びてよい（その代わりカードの最小幅を広げてある）。 */
    if(view==='quality') view='info';   /* 旧「受注の質」ボタンを覚えている端末の受け皿 */
    var h='<div class="sv-viewsw"><button class="sv-vbtn'+(view==='info'?' on':'')+'" onclick="svSetFrontView(\'info\')">インフォグラフィック</button>'
         +'<button class="sv-vbtn'+(view==='table'?' on':'')+'" onclick="svSetFrontView(\'table\')">表</button></div>';
    if(!rows.length){ return h+'<div class="sv-card"><div class="sv-empty">対象データがありません</div></div>'; }
    if(view==='table'){
      h+='<div class="sv-card sv-table-wide"><table class="sv-table"><thead><tr><th>フロント</th><th>台数</th><th>売上</th><th>平均単価</th><th>最高単価</th><th>預り平均</th><th>預り最長</th><th>受注まで</th>'
         +'<th title="概算返車日と実際に返した日の差。＋＝遅れた">ズレ平均</th><th title="いちばん外した1台">ズレ最大</th><th title="預かりの車だけ">作業待ち→完了</th><th title="預かりの車だけ">完了→返車</th>'
         +'<th>車検%</th><th>12点%</th><th>一般%</th></tr></thead><tbody>';
      rows.forEach(function(r){ h+='<tr><td class="sv-td-name">'+esc(r.name)+'</td><td class="sv-num">'+r.cnt+'</td><td class="sv-num" style="color:#1db97a">'+man(r.sum)+'</td><td class="sv-num">'+man(r.avg)+'</td><td class="sv-num">'+man(r.hi)+'</td><td class="sv-num">'+(r.hold!=null?r.hold.toFixed(1):'—')+'</td><td class="sv-num">'+(r.holdMax||'—')+'</td><td class="sv-num">'+(r.od!=null?r.od.toFixed(1):'—')+'</td>'
        +'<td class="sv-num'+gapCls(r.gap)+'">'+dayStr(r.gap,true)+'</td><td class="sv-num'+gapCls(r.gapMax)+'">'+dayStr(r.gapMax,true)+'</td>'
        +'<td class="sv-num">'+dayStr(r.w2d)+'</td><td class="sv-num">'+dayStr(r.d2r)+'</td>'
        +'<td class="sv-num">'+pct(r.f.grp.shaken,r.gt)+'%</td><td class="sv-num">'+pct(r.f.grp['12pt'],r.gt)+'%</td><td class="sv-num">'+pct(r.f.grp.general,r.gt)+'%</td></tr>'; });
      h+='</tbody></table></div><div class="sv-foot">返車済み実績＋受注(連絡中→パーツ待ち)。%は売上構成比。<br>'
        +'<b>ズレ</b>＝概算返車日（入庫日＋概算 預かり日数）と、実際に返した日の差。＋＝読みより遅れた／−＝早く返せた。<b>ズレ最大</b>はいちばん外した1台。<br>'
        +'<b>作業待ち→完了・完了→返車</b>＝<b>預かりの車だけ</b>の平均日数（待ち・当日返しはその日のうちなので混ぜていません）。</div>';
      return h;
    }
    // info：大きめカード（v1.63.0 で「受注の質」もこの中に入れて1枚にした）
    h+=baseTableHtml();
    h+='<div class="sv-fcards sv-fcards-wide">';
    rows.forEach(function(r){ var f=r.f;
      h+='<div class="sv-fcard"><div class="sv-fcard-h"><span class="sv-fcard-name">'+esc(r.name)+'</span><span class="sv-fcard-cnt">'+r.cnt+'台</span></div>';
      h+='<div class="sv-fcard-sales">'+man(r.sum)+'<span>円</span></div>';
      h+='<div class="sv-fmetrics">';
      h+='<div class="sv-fm"><span>平均単価</span><b>'+man(r.avg)+'</b></div>';
      h+='<div class="sv-fm"><span>最高単価</span><b>'+man(r.hi)+'</b></div>';
      h+='<div class="sv-fm"><span>預り平均</span><b>'+(r.hold!=null?r.hold.toFixed(1)+'日':'—')+'</b></div>';
      h+='<div class="sv-fm"><span>預り最長</span><b>'+(r.holdMax?r.holdMax+'日':'—')+'</b></div>';
      h+='<div class="sv-fm"><span>受注まで</span><b>'+(r.od!=null?r.od.toFixed(1)+'日':'—')+'</b></div>';
      h+='</div>';
      /* 🔴 v1.72.0（ゆうた指定）読みのズレ＋預かりの中身の日数。
         ⚠ 「早い＝良い」ではないので色は付けない。**遅れ＝赤**だけ意味を持たせる。 */
      h+=daysBlockHtml(r);
      // 作業構成比バー
      h+='<div class="sv-fbar-lb">作業構成比</div><div class="sv-segbar">';
      WGROUPS.forEach(function(x){ var v=f.grp[x.id]; var p=r.gt?v/r.gt*100:0; if(p>0) h+='<i style="width:'+p.toFixed(1)+'%;background:'+x.color+'" title="'+x.label+' '+Math.round(p)+'%"></i>'; });
      h+='</div><div class="sv-seglbl">'+WGROUPS.map(function(x){return '<span><i style="background:'+x.color+'"></i>'+x.label+' '+pct(f.grp[x.id],r.gt)+'%</span>';}).join('')+'</div>';
      // 受注曜日構成比
      h+='<div class="sv-fbar-lb">受注が多い曜日</div><div class="sv-dowbars">';
      var dmax=Math.max.apply(null,f.dow.concat([1]));
      for(var wi=0;wi<7;wi++){ var v=f.dow[wi]; var hh=Math.round(v/dmax*100); var wknd=(wi===0||wi===6); h+='<div class="sv-dowbar"><i style="height:'+Math.max(3,hh)+'%"'+(v>0?'':' class="z"')+'></i><span'+(wknd?' class="wk"':'')+'>'+DOW[wi]+'</span><em>'+(r.dsum?pct(v,r.dsum)+'%':'0')+'</em></div>'; }
      h+='</div>';
      /* 🔴 v1.63.0 ここから下が「受注の質」＝同じブロックの中に続けて出す */
      h+=qualityBlockHtml(f.q);
      h+='</div>';
    });
    h+='</div><div class="sv-foot">台数・売上・単価・預かり＝返車済み実績。受注まで日数・受注曜日＝連絡中→パーツ待ち（受注）に移った日。作業構成比＝売上ベース。<br>'
      +'<b>基準値との差</b>＝1台ずつ「自分が取った金額 − <b>設定の概算金額（作業タイプ別×国産／輸入）</b>」を足したもの。物差しが月ごとに動かないので、先月と今月をそのまま比べられる。<br>'
      +'<b>見積との差</b>＝見積り中→連絡中で入れた見積額と、確定額（請求額）の差。マイナス＝見積から落ちた／プラス＝見積より積めた。<b>見積額が空の車は数えない</b>。</div>';
    return h;
  }
  function renderFrontMonth(wrap){ var ym=window._svYM; var a=ymdL(new Date(ym.y,ym.m,1)), b=ymdL(new Date(ym.y,ym.m+1,0)); wrap.innerHTML=header('month',ym)+frontBody(collectFront(a,b),a,b); }
  function renderFrontYear(wrap){ var Y=window._svYear; var a=ymdL(new Date(Y-1,11,1)), b=ymdL(new Date(Y,11,0)); wrap.innerHTML=header('year',{y:Y})+frontBody(collectFront(a,b),a,b); }

  // ===== 共通ヘッダ（タブ＋当月/月間トグル＋期間ナビ） =====
  function header(mode, ctx){
    var tab=window._svTab||'sales';
    /* 🔍 v2.59.0（ゆうた指定 2026-09-04）来店属性＝手で作っていた Excel「来店属性集計」を実データから出す */
    /* 🤖 v2.132.0（ゆうた指定 2026-10-02）来店属性の横に「AIレポート」＝月締めのあとに AI が書く月次レポート（sales-ai.js） */
    var TABS=[['sales','売上'],['quarter','クォーター'],['work','作業内容'],['front','フロント'],['visit','来店属性'],['ai','AIレポート']];
    var h='<div class="sv-tabbar">'+TABS.map(function(t){ return '<button class="sv-topbtn'+(tab===t[0]?' on':'')+'" onclick="svSetTab(\''+t[0]+'\')">'+t[1]+'</button>'; }).join('')+'<div class="sv-tools">'
      /* 🆕 v2.145.0 売上タブの当月だけ＝区分別の一覧（A4白黒） */
      + (tab==='sales' && mode==='month' ? '<button class="sv-toolbtn" onclick="svExportListPdf()" title="課ごとの1台ずつの一覧（実績〜見込・返車日つき）をA4白黒のPDFで保存"><i data-ic=file data-ics=16></i> 一覧PDF</button>' : '')
      /* 🆕 v2.152.0 クォーター＝該当Q・翌Q・それ以外に分けた一覧（A4白黒） */
      + (tab==='quarter' ? '<button class="sv-toolbtn" onclick="svExportListPdf()" title="課ごとの1台ずつの一覧（該当Q・翌Q・それ以外）をA4白黒のPDFで保存"><i data-ic=file data-ics=16></i> 一覧PDF</button>' : '')
      + '<button class="sv-toolbtn" onclick="svExportPdf()" title="A4のPDFで保存（ベクター）"><i data-ic=file data-ics=16></i> PDF出力</button></div></div>';
    /* 🆕 v2.148.0 クォーター＝Q1〜Q4 の切り替え（当月／月間はやめた）。左右の矢印はQを1つずつ送る（月をまたぐ） */
    if (mode==='quarter'){
      var qLast=new Date(ctx.y,ctx.m+1,0).getDate(), qRng=[[1,7],[8,15],[16,23],[24,qLast]][ctx.q];
      h+='<div class="sv-head"><div class="sv-tabs">'+[0,1,2,3].map(function(q){ return '<button class="sv-tab'+(ctx.q===q?' on':'')+'" onclick="svSetQ('+q+')">Q'+(q+1)+'</button>'; }).join('')+'</div>';
      h+='<div class="sv-nav"><button onclick="svShiftQ(-1)" title="前のQ"><i data-ic=chevLeft data-ics=16></i></button><b>'+ctx.y+'年'+(ctx.m+1)+'月 Q'+(ctx.q+1)+'（'+qRng[0]+'〜'+qRng[1]+'日）</b><button onclick="svShiftQ(1)" title="次のQ"><i data-ic=chevRight data-ics=16></i></button><button class="sv-now" onclick="svShiftQ(0)">今のQ</button></div>';
      h+='</div>'; return h;
    }
    h+='<div class="sv-head"><div class="sv-tabs"><button class="sv-tab'+(mode==='month'?' on':'')+'" onclick="svSetMode(\'month\')">当月</button><button class="sv-tab'+(mode==='year'?' on':'')+'" onclick="svSetMode(\'year\')">月間（年度）</button></div>';
    if (mode==='month'){ h+='<div class="sv-nav"><button onclick="svShiftMonth(-1)" title="前の月"><i data-ic=chevLeft data-ics=16></i></button><b>'+ctx.y+'年'+(ctx.m+1)+'月</b><button onclick="svShiftMonth(1)" title="次の月"><i data-ic=chevRight data-ics=16></i></button><button class="sv-now" onclick="svShiftMonth(0)">今月</button></div>'; }
    else { h+='<div class="sv-nav"><button onclick="svShiftYear(-1)" title="前の年度"><i data-ic=chevLeft data-ics=16></i></button><b>'+(ctx.y-1)+'/12〜'+ctx.y+'/11</b><button onclick="svShiftYear(1)" title="次の年度"><i data-ic=chevRight data-ics=16></i></button><button class="sv-now" onclick="svShiftYear(0)">今年度</button></div>'; }
    h+='</div>'; return h;
  }

  // ===== エントリ =====
  function renderSales(){
    var wrap=document.getElementById('view-sales-body'); if(!wrap) return;
    var now=new Date();
    if(!window._svTab) window._svTab='sales';
    if(!window._svMode) window._svMode='month';
    if(!window._svYM) window._svYM={y:now.getFullYear(),m:now.getMonth()};
    if(!window._svYear) window._svYear=(now.getMonth()===11)?now.getFullYear()+1:now.getFullYear();
    var tab=window._svTab, yr=(window._svMode==='year');
    /* 🔍 v2.59.0 来店属性は別ファイル（sales-visit.js）。
       ⚠ 上のタブと期間の帯（`head()`）は**ここで作って渡す**＝期間の出し方を2か所に書かない。 */
    if(tab==='visit'){
      /* ⚠ 期間の帯は `header(mode, ctx)`。**`head()` ではない**（2026-09-04 ここを間違えて、
         タブを押しても何も起きない状態で出してしまった。見張りが文字だけ見ていて拾えなかった）。 */
      var vHead = yr ? header('year',{y:window._svYear}) : header('month', window._svYM);
      if(!window.pitVisitMonth){ wrap.innerHTML=vHead+'<div class="sv-card"><div class="sv-empty">来店属性の部品を読み込み中です…</div></div>'; return; }
      if(yr) pitVisitYear(wrap, vHead, window._svYear);
      else   pitVisitMonth(wrap, vHead, window._svYM.y, window._svYM.m);
      return;
    }
    /* 🤖 v2.132.0 AIレポートは別ファイル（sales-ai.js）。レポートは月ごと＝「月間（年度）」では月を選ぶよう言うだけ */
    if(tab==='ai'){
      var aHead = yr ? header('year',{y:window._svYear}) : header('month', window._svYM);
      if(yr){ wrap.innerHTML=aHead+'<div class="sv-card"><div class="sv-empty">AIレポートは月ごとです。「当月」で月を選んでください。</div></div>'; return; }
      if(!window.pitAiRepMonth){ wrap.innerHTML=aHead+'<div class="sv-card"><div class="sv-empty">AIレポートの部品を読み込み中です…</div></div>'; return; }
      pitAiRepMonth(wrap, aHead, window._svYM.y, window._svYM.m);
      return;
    }
    if(tab==='quarter') renderQuarter(wrap);   /* 🆕 v2.148.0 当月／月間の区別なし（Q1〜Q4） */
    else if(tab==='work') yr?renderWorkYear(wrap):renderWorkMonth(wrap);
    else if(tab==='front') yr?renderFrontYear(wrap):renderFrontMonth(wrap);
    else yr?renderYear(wrap):renderMonth(wrap);
  }



  /* 🆕 v2.152.0 売上サマリーの紙の材料（上の数字・積み上げ帯・日次グラフ・確度・課別）をここ1本に。
     売上タブの紙とクォーターの紙（MTG用）が同じ物を借りる＝画面の monthTop と同じ数字。 */
  function monthInfo(ym, d){
    var tg=target(); d = d || collectMonth(ymdL(new Date(ym.y,ym.m,1)),ymdL(new Date(ym.y,ym.m+1,0))); var t=d.tiers;
    var _td0=new Date(); _td0.setHours(0,0,0,0);
    var _moS0=ymdL(new Date(ym.y,ym.m,1)), _moE0=ymdL(new Date(ym.y,ym.m+1,0));
    var _isThis0=(_td0.getFullYear()===ym.y && _td0.getMonth()===ym.m);
    var _todayIdx0=_isThis0 ? _td0.getDate() : (ymdL(_td0)>_moE0 ? d.lastDay : 0);
    var _paceT0=tg.min*(_todayIdx0/d.lastDay);
    var info={
      actual:t.actual.sum, landing:_mAll(t), nearSure:sumTiers(t,TIER_NEAR), committed:sumTiers(t,TIER_HIGH),
      min:tg.min, max:tg.max, isThis:_isThis0, todayIdx:_todayIdx0, lastDay:d.lastDay, cum:d.cum.slice(),
      paceTarget:_paceT0, pacePct:(_paceT0>0?Math.round(t.actual.sum/_paceT0*100):0),
      tiers:TIERS.map(function(x){ return { id:x.id, label:x.label, color:x.color, note:x.note, sum:t[x.id].sum, count:t[x.id].count }; }),
      /* 🆕 v2.124.0（ゆうた指定 2026-09-26「PDFはフロントごと要らない。それぞれの課の数字をメインに」）
         課ごとに 目標（divTarget）・節目（courseStage）も渡す＝紙も画面の「積み上げの階段」と同じ数字。フロント別は渡さない。 */
      courses:COURSES.map(function(cd){
        var cc=d.byCourse[cd.id], dt=divTarget(cd.id);
        return { label:cd.label, team:(cd.id==='div1'?'国産':'輸入'), color:cd.color, landing:sumTiers(cc,TIER_IDS),
                 min:dt.min, max:dt.max, actual:cc.actual.sum, nearSure:sumTiers(cc,TIER_NEAR),
                 tiers:TIERS.map(function(x){ return { label:x.label, color:x.color, sum:cc[x.id].sum, count:cc[x.id].count, stage:courseStage(x.id) }; }) }; }),
      ratioD:ratioD(),
      refNoCount:(window.pitInternCountText ? (pitInternCountText(_refNoCount(_moS0,_moE0))||'') : ''),
      /* 🆕 v2.145.0 参考（保険・社員）＝集計の外。紙にも1行で出す */
      refText:(d.ref && d.ref.rows.length ? '参考（保険・社員の実績待〜予測）'+d.ref.rows.length+'台・'+man(sumTiers(d.ref.tiers,TIER_IDS))+'＝売上の集計には入れていません' : '')
    };
    return info;
  }

  // ===== PDF用：現ビューのデータモデル（sales-print.js が A4ベクターPDFに描画） =====
  function _mAll(t){ return sumTiers(t,TIER_IDS); }
  function svReportModel(){
    var tab=window._svTab||'sales', yr=(window._svMode==='year'); var tg=target();
    var SLOT=[12,1,2,3,4,5,6,7,8,9,10,11];
    /* 🔍 v2.59.0 来店属性の紙。⚠ ここを足さないと、画面は来店属性なのに**売上の紙が出る**
       （知らない tab は一番下の売上へ落ちる作りのため）。数字は画面と同じ物差しから取る。 */
    /* 🤖 v2.132.0 AIレポートの紙（数字の表だけ。文は画面で読む） */
    if(tab==='ai' && window.pitAiRepModel) return pitAiRepModel();
    if(tab==='visit' && window.pitVisitCollect){
      var vRow=function(lb,f,cols,tt){ return [lb].concat(cols.map(function(c){return String(f(c.b));})).concat([String(f(tt))]); };
      var vPct=function(n,d){ return d>0 ? Math.round(n/d*100)+'%' : '—'; };
      var vRep=function(b){ return b.insp.rep+b.gen.rep; }, vFst=function(b){ return b.insp.first+b.gen.first; };
      var vNone=function(b){ return b.insp.none+b.gen.none; };
      var cols, tt, period;
      if(yr){ var dY=pitVisitCollectYear(window._svYear); cols=dY.slots; tt=dY.total; period=(window._svYear-1)+'年12月〜'+window._svYear+'年11月'; }
      else { var ym2=window._svYM; cols=pitVisitQuarters(ym2.y, ym2.m);
             tt=pitVisitCollect(ymdL(new Date(ym2.y,ym2.m,1)), ymdL(new Date(ym2.y,ym2.m+1,0)));
             period=ym2.y+'年'+(ym2.m+1)+'月'; }
      var rows=[
        vRow('車検・点検 リピーター',function(b){return b.insp.rep;},cols,tt),
        vRow('車検・点検 一見',function(b){return b.insp.first;},cols,tt),
        vRow('一般 リピーター',function(b){return b.gen.rep;},cols,tt),
        vRow('一般 一見',function(b){return b.gen.first;},cols,tt),
        vRow('合計 リピーター',vRep,cols,tt),
        vRow('合計 一見',vFst,cols,tt),
        vRow('未チェック（初回／リピーター 未選択）',vNone,cols,tt),
        vRow('IR率 リピーター',function(b){return vPct(vRep(b),b.all);},cols,tt),
        vRow('IR率 一見',function(b){return vPct(vFst(b),b.all);},cols,tt),
        vRow('KY率 国産',function(b){return b.dom;},cols,tt),
        vRow('KY率 輸入',function(b){return b.imp;},cols,tt),
        vRow('KY率 国産率',function(b){return vPct(b.dom,b.all);},cols,tt),
        vRow('KY率 輸入率',function(b){return vPct(b.imp,b.all);},cols,tt),
        vRow('合計',function(b){return b.all;},cols,tt),
        vRow('うちスライド（先月売上・今月返車）',function(b){return b.slide;},cols,tt)
      ];
      return { title:'来店属性集計', period:period,
        kpis:[{label:'入庫台数（実績）',value:tt.all+'台'},
              {label:'IR率（リピーター）',value:vPct(vRep(tt),tt.all)},
              {label:'IR率（一見）',value:vPct(vFst(tt),tt.all)},
              {label:'KY率（国産／輸入）',value:vPct(tt.dom,tt.all)+' / '+vPct(tt.imp,tt.all)}],
        /* 🔴 v2.61.0 紙にも「0にする対象」を出す（月末に紙で潰せるように） */
        sections:[{ type:'table', title:(yr?'月ごと':'クォーター結果（1〜7／8〜15／16〜23／24〜末）'),
          head:[yr?'入庫台数':'内容'].concat(cols.map(function(c){return c.label;})).concat(['合計']),
          rows:rows, align:['l'].concat(cols.map(function(){return 'r';})).concat(['r']) }],
        note:'実績になった車（実績カウント日＝返車ベース／売上なし・社内車両は除く）。車検・点検＝車検か12点が入っているもの／一般＝それ以外ぜんぶ。'
          + 'リピーター／一見＝予約の「初回／リピーター」の札。札が空のものは未チェックとして分けています（推測で埋めていません）。'
          + '　0にする対象：未選択 '+vNone(tt)+'件／売上日が空 '+(tt.noSalesDate||0)+'件／札と来店履歴の食い違い '+(tt.mismatch||0)+'件。' };
    }
    if(tab==='sales' && !yr){
      var ym=window._svYM; var d=collectMonth(ymdL(new Date(ym.y,ym.m,1)),ymdL(new Date(ym.y,ym.m+1,0))); var t=d.tiers;
      var tierRows=[['目標',man(tg.min)+'〜'+man(tg.max),'']].concat(TIERS.map(function(x){return [x.label,man(t[x.id].sum),t[x.id].count+'台'];}));
      var courseRows=[]; [['div1','1課(国産)'],['div2','2課(輸入)']].forEach(function(c){ var cc=d.byCourse[c[0]]; courseRows.push([c[1]].concat(TIERS.map(function(x){return man(cc[x.id].sum);})).concat([man(_mAll(cc))])); });
      /* 🔴 v2.124.0 紙にフロント別は出さない（ゆうた指定 2026-09-26「PDFはフロントごと要らない」） */
      /* 🎨 v2.120.0（ゆうた指定 2026-09-15「サマリー画面のようなインフォグラフィックな感じがいい」）
         紙も画面と同じ並び（数字の帯・積み上げ帯・日次グラフ・確度カード・課別・フロント別）で描くための材料。
         🔴 数字は画面と**同じ集め方**（collectMonth・TIERS・TIER_NEAR/HIGH/FRONT・target）から取る。ここで数え直さない。 */
      var info=monthInfo(ym, d);   /* 🆕 v2.152.0 クォーターの紙も同じ材料を借りる */
      return { title:'売上サマリー', period:ym.y+'年'+(ym.m+1)+'月', infographic:info,
        kpis:[{label:'実績（返車済）',value:man(t.actual.sum)},{label:'実績見込み（＋実績待）',value:man(sumTiers(t,TIER_NEAR))},{label:'着地見込み',value:man(_mAll(t))},{label:'月目標',value:man(tg.min)+'〜'+man(tg.max)}],
        sections:[
          {type:'table',title:'確度別',head:['区分','金額','台数'],rows:tierRows,align:['l','r','r']},
          {type:'table',title:'課別（'+TIERS.map(function(x){return x.label;}).join('/')+'/着地）',
           head:['課'].concat(TIERS.map(function(x){return x.label;})).concat(['着地']),
           rows:courseRows,align:['l'].concat(TIERS.map(function(){return 'r';})).concat(['r'])}
        ]};
    }
    if(tab==='sales' && yr){
      var Y=window._svYear; var monA=[],monP=[]; for(var i=0;i<12;i++){monA[i]=0;monP[i]=0;}
      (state.cards||[]).forEach(function(c){ if(c.status!=='returned')return; var dd=pd(countDate(c)); if(isNaN(dd.getTime()))return; var cm=dd.getMonth(),cy=dd.getFullYear(); var fy=(cm===11)?cy+1:cy; var slot=(cm===11)?0:cm+1; var amt=actAmt(c); if(fy===Y)monA[slot]+=amt; else if(fy===Y-1)monP[slot]+=amt; });
      var yTot=monA.reduce(function(a,b){return a+b;},0), pTot=monP.reduce(function(a,b){return a+b;},0), hasP=pTot>0;
      var head=['月','実績','目標','達成率']; if(hasP){head.push('前年度');head.push('昨対');}
      var rows=[]; for(i=0;i<12;i++){ var r=[SLOT[i]+'月',man(monA[i]),man(tg.min),pct(monA[i],tg.min)+'%']; if(hasP){r.push(man(monP[i]));r.push((monA[i]-monP[i]>=0?'+':'')+man(monA[i]-monP[i]));} rows.push(r); }
      var kpis=[{label:'年度実績',value:man(yTot)},{label:'年目標',value:man(tg.min*12)+'〜'+man(tg.max*12)}]; if(hasP)kpis.push({label:'昨対',value:(yTot-pTot>=0?'+':'')+man(yTot-pTot)});
      return { title:'売上（年度）', period:(Y-1)+'/12〜'+Y+'/11', kpis:kpis, sections:[
        {type:'bars',title:'月別 実績',items:monA.map(function(v,ix){return {label:''+SLOT[ix],value:v};}),max:Math.max.apply(null,monA.concat([tg.min]))},
        {type:'table',title:'月別内訳',head:head,rows:rows,align:head.map(function(_,ix){return ix===0?'l':'r';})} ]};
    }
    /* 🆕 v2.148.0 クォーターの紙＝MTG用（選んだQの実績・次Qの見込み・課別の階段）。数字は collectQuarter と monthTop と同じ物 */
    if(tab==='quarter'){
      var Q=collectQuarter(qSel()), A=qSum(Q), qy=Q.sel.y, qm=Q.sel.m;
      var MD=collectMonth(ymdL(new Date(qy,qm,1)), ymdL(new Date(qy,qm+1,0)));
      var lastQ=new Date(qy,qm+1,0).getDate(), lbl=['1-7','8-15','16-23','24-'+lastQ];
      var qrows=[0,1,2,3].map(function(i){ return ['Q'+(i+1)+'（'+lbl[i]+'）'+(i===Q.sel.q?' ←選択':''), man(Q.tQ[i].min)+'〜'+man(Q.tQ[i].max), man(Q.qAct[i]), pct(Q.qAct[i],Q.tQ[i].min)+'%', Q.qCnt[i]+'台']; });
      var lad=function(nm, o, mn, mx){ var land=o.prev+o.sel+o.nextSum; return [nm, man(o.prev), man(o.sel), man(o.nextSum), man(land), man(mn), man(mx), pct(land,mn)+'%']; };
      var crow=[lad('全体',A,Q.tAll.min,Q.tAll.max)].concat(COURSES.map(function(cd){ return lad(cd.label+'（'+(cd.id==='div1'?'国産':'輸入')+'）', Q.D[cd.id], qDiv(Q.tAll.min,cd.id), qDiv(Q.tAll.max,cd.id)); }));
      var nrow=COURSES.map(function(cd){ var o=Q.D[cd.id]; return [cd.label].concat(TIERS.map(function(t){ return o.next[t.id].count ? man(o.next[t.id].sum)+'（'+o.next[t.id].count+'）' : '—'; })).concat([man(o.nextSum)]); });
      nrow.push(['全体'].concat(TIERS.map(function(t){ return A.next[t.id].count ? man(A.next[t.id].sum)+'（'+A.next[t.id].count+'）' : '—'; })).concat([man(A.nextSum)]));
      return { title:'クォーター '+qName(Q.sel)+' → '+qName(Q.nx), period:qy+'年'+(qm+1)+'月', qgraphic:qGraphicInfo(Q),
        kpis:[{label:qName(Q.sel)+'の実績',value:man(A.sel)},{label:qNextLabel(Q),value:man(A.nextSum)},{label:qName(Q.nx)+'までの着地',value:man(A.prev+A.sel+A.nextSum)},{label:(qm+1)+'月の実績（月目標 '+man(tg.min)+'〜）',value:man(MD.tiers.actual.sum)}],
        sections:[
          {type:'table',title:(qm+1)+'月のクォーター実績（営業日配分）',head:['Q','目標','実績','達成率','台数'],rows:qrows,align:['l','r','r','r','r']},
          {type:'table',title:'課別：前Qまで → '+qName(Q.sel)+'の実績 → '+qNextLabel(Q),head:['課','前Qまで',qName(Q.sel),qName(Q.nx),'着地','目標最低','目標最高','最低比'],rows:crow,align:['l','r','r','r','r','r','r','r']},
          {type:'table',title:'Q'+(Q.sel.q+1)+'までの目標（月目標を4等分）の達成',head:['課','目標（最低）','目標（最高）',(Q.sel.q ? 'Q1〜Q'+(Q.sel.q+1) : 'Q1')+'の実績','達成率','判定'],
           rows:[null,'div1','div2'].map(function(k){ var G=qGoalOf(Q,k); return [k?(k==='div1'?'1課（国産）':'2課（輸入）'):'全体', man1(G.min), man1(G.max), man(G.act), G.p+'%', G.ok?'達成（＋'+man(-G.gap)+'）':'未達（あと '+man(G.gap)+'）']; }),
           align:['l','r','r','r','r','l']},
          {type:'table',title:qNextLabel(Q)+'の中身（区分ごと・台数）',head:['課'].concat(TIERS.map(function(t){return t.label;})).concat(['計']),rows:nrow,align:['l'].concat(TIERS.map(function(){return 'r';})).concat(['r'])}
        ],
        note:(Q.nextDone ? qName(Q.nx)+'はもう終わっているので、見込みではなく実績です（答え合わせ）。'
                         : '次Qの見込み＝次Qにもう返した実績＋まだ返していない車で返車予定日が'+qName(Q.nx)+'の終わりまでのもの（予定日を過ぎた・未定も含む）。保険・社員の見込みは入れていません。')
             + '目標＝月初から'+qName(Q.nx)+'の終わりまで（営業日配分）を国産 '+ratioD()+'%：輸入 '+(100-ratioD())+'% で割った額。' };
    }
    if(tab==='work' && !yr){
      var ym4=window._svYM; var w=collectWork(ymdL(new Date(ym4.y,ym4.m,1)),ymdL(new Date(ym4.y,ym4.m+1,0)));
      var secs=[]; [['div1','国産'],['div2','輸入']].forEach(function(cs){ var cTot=WGROUPS.reduce(function(a,x){return a+w.g[x.id][cs[0]].sum;},0)||1;
        var rows4=WGROUPS.map(function(x){var o=w.g[x.id][cs[0]];return [x.label,o.cnt+'',man(o.sum),man(o.cnt?o.sum/o.cnt:0),o.cnt?man(o.lo):'—',o.cnt?man(o.hi):'—',pct(o.sum,cTot)+'%'];});
        secs.push({type:'table',title:cs[1]+'車',head:['作業','台数','売上','平均','最低','最高','構成比'],rows:rows4,align:['l','r','r','r','r','r','r']}); });
      return { title:'作業内容', period:ym4.y+'年'+(ym4.m+1)+'月', kpis:[], sections:secs };
    }
    if(tab==='work' && yr){
      var Y5=window._svYear; var mon=[];for(var i7=0;i7<12;i7++)mon[i7]={shaken:0,'12pt':0,general:0};
      (state.cards||[]).forEach(function(c){if(c.status!=='returned')return;var d5=countDate(c);if(!d5)return;var dd=pd(d5),cm=dd.getMonth(),cy=dd.getFullYear();var fy=(cm===11)?cy+1:cy;if(fy!==Y5)return;var slot=(cm===11)?0:cm+1;mon[slot][workGroupOf(c)]+=actAmt(c);});
      var rows5=[];for(i7=0;i7<12;i7++){var mm5=mon[i7];rows5.push([SLOT[i7]+'月',man(mm5.shaken),man(mm5['12pt']),man(mm5.general),man(mm5.shaken+mm5['12pt']+mm5.general)]);}
      return { title:'作業内容（年度）', period:(Y5-1)+'/12〜'+Y5+'/11', kpis:[], sections:[{type:'table',title:'月別グループ',head:['月','車検','12点','一般','計'],rows:rows5,align:['l','r','r','r','r']}]};
    }
    // front
    var F, period; if(yr){var Yf=window._svYear;F=collectFront(ymdL(new Date(Yf-1,11,1)),ymdL(new Date(Yf,11,0)));period=(Yf-1)+'/12〜'+Yf+'/11';}else{var ymf=window._svYM;F=collectFront(ymdL(new Date(ymf.y,ymf.m,1)),ymdL(new Date(ymf.y,ymf.m+1,0)));period=ymf.y+'年'+(ymf.m+1)+'月';}
    var frows=Object.keys(F).map(function(n){var f=F[n];var gt=f.grp.shaken+f.grp['12pt']+f.grp.general;return {n:n,f:f,gt:gt,sum:f.sum};}).sort(function(a,b){return b.sum-a.sum;}).map(function(r){var f=r.f;return [r.n,f.cnt+'',man(f.sum),man(f.cnt?f.sum/f.cnt:0),man(f.hi),(f.holdN?(f.hold/f.holdN).toFixed(1):'—'),(f.holdMax||'—')+'',(f.odN?(f.odDays/f.odN).toFixed(1):'—'),dayStr(f.gapN?f.gapSum/f.gapN:null,true),dayStr(f.gapN?f.gapMax:null,true),dayStr(f.w2dN?f.w2dSum/f.w2dN:null),dayStr(f.d2rN?f.d2rSum/f.d2rN:null),pct(f.grp.shaken,r.gt)+'%',pct(f.grp['12pt'],r.gt)+'%',pct(f.grp.general,r.gt)+'%'];});
    return { title:'フロント別', period:period, kpis:[], sections:[{type:'table',title:'指標（実績＋受注）',head:['名','台','売上','平均','最高','預平','預長','受注','ズレ平','ズレ最','待→完','完→返','車検','12点','一般'],rows:frows,align:['l','r','r','r','r','r','r','r','r','r','r','r','r','r','r']}]};
  }
  window.svReportModel = svReportModel;
  /* 🎨 v2.120.0 金額の「万」の書き方は画面と同じ1本（紙＝sales-print.js も借りる） */
  window.svMan = man;

  window.renderSales = renderSales;
  /* 🤖 v2.132.0 AIレポートのタブを押した時は、締めを確かめ直す（その間にクォーターチェックで書き込んだかもしれない） */
  window.svSetTab = function(t){ window._svTab=t; if(t==='ai' && window.pitAiRepForget) pitAiRepForget(); renderSales(); };
  window.svSetMode = function(m){ window._svMode=m; renderSales(); };
  window.svSetFrontView = function(v){ window._svFrontView=v; renderSales(); };
  window.svSetWorkView = function(v){ window._svWorkView=v; renderSales(); };
  window.svShiftMonth = function(dir){ var now=new Date(); if(dir===0){ window._svYM={y:now.getFullYear(),m:now.getMonth()}; } else { var d=new Date(window._svYM.y, window._svYM.m+dir, 1); window._svYM={y:d.getFullYear(),m:d.getMonth()}; } renderSales(); };
  window.svShiftYear = function(dir){ var now=new Date(); var cur=(now.getMonth()===11)?now.getFullYear()+1:now.getFullYear(); window._svYear=(dir===0)?cur:(window._svYear+dir); renderSales(); };
})();

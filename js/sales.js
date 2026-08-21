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
    { id:'actualWait', label:'実績待', color:'#14b8a6', note:'作業完了・返車待ち（実績カレンダーにはまだ入っていない）' },
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

  function target(){ var t=(state.settings&&state.settings.target)||{}; return { min: num(t.monthMin)||15000000, max: num(t.monthMax)||20000000 }; }

  // ===== 当月の集計 =====
  function collectMonth(moS, moE){
    var _td = new Date(); _td.setHours(0,0,0,0); var todayStr = ymdL(_td);
    var tiers = {}; TIERS.forEach(function(t){ tiers[t.id] = { sum:0, count:0 }; });
    var byCourse = { div1:{}, div2:{} };
    ['div1','div2'].forEach(function(k){ TIERS.forEach(function(t){ byCourse[k][t.id]={sum:0,count:0}; }); });
    var lastDay = pd(moE).getDate();
    var dayActual = []; for (var i=0;i<=lastDay;i++) dayActual[i]=0;   // 1..lastDay
    var fronts = {};   // frontStaff -> { 区分ごとの金額 … , count }（区分は TIER_FRONT）
    (state.cards||[]).forEach(function(c){
      var tier = tierOf(c, moS, moE, todayStr); if (!tier) return;
      var amt = amtOf(c, tier);
      tiers[tier].sum += amt; tiers[tier].count++;
      var cs = course(c); byCourse[cs][tier].sum += amt; byCourse[cs][tier].count++;
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
    return { tiers:tiers, byCourse:byCourse, lastDay:lastDay, cum:cum, fronts:fronts };
  }

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

  // ===== SVG：ミニ積み上げ（課別） =====
  function miniStack(tiersC, scale){
    var pw=100, h=12; var s='<svg class="sv-mini" viewBox="0 0 100 12" preserveAspectRatio="none">';
    s+='<rect x="0" y="0" width="100" height="12" rx="3" class="sv-stack-bg"/>';
    var x=0; TIERS.forEach(function(t){ var v=tiersC[t.id].sum; if(v<=0) return; var ww=pw*v/(scale||1); s+='<rect x="'+x.toFixed(1)+'" y="0" width="'+Math.max(0,ww).toFixed(1)+'" height="12" fill="'+t.color+'"/>'; x+=ww; });
    s+='</svg>'; return s;
  }

  // ===== 当月ビュー =====
  function renderMonth(wrap){
    var ym = window._svYM;
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
    h += header('month', ym);

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
       + '<span>実績見込み（実績＋実績待）<b style="color:#14b8a6">'+man(nearSure)+'</b></span>'
       + '<span>確度高（＋確定）<b style="color:#2563eb">'+man(committed)+'</b></span>'
       + '</div></div>';
    if (isThis && todayIdx>0){
      var pc = pacePct>=100?'ok':(pacePct>=85?'near':'warn');
      h += '<div class="sv-hero-pace sv-pace-'+pc+'"><div class="sv-hero-lb">本日ペース</div><div class="sv-hero-num">'+pacePct+'<span>%</span></div><div class="sv-hero-sub">'+man(actual)+' / ペース目安 '+man(paceTarget)+'</div></div>';
    }
    h += '</div>';
    h += stackBarSvg(t, tg.min, tg.max, landing);
    h += '</div>';

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

    // 確度別サマリー（6区分）
    h += '<div class="sv-tiers">';
    h += tierCard('target', '目標', '#eab308', man(tg.min)+'〜'+man(tg.max), '', '月目標（最低〜最高）');
    TIERS.forEach(function(tt){ h += tierCard(tt.id, tt.label, tt.color, man(t[tt.id].sum), t[tt.id].count+'台', tt.note); });
    h += '</div>';

    // 課別（1課/2課）
    var scaleC = Math.max(tg.max/1, sumTiers(data.byCourse.div1,TIER_IDS), sumTiers(data.byCourse.div2,TIER_IDS),1);
    h += '<div class="sv-courses">';
    [{id:'div1',label:'1課',team:'<i data-ic=car data-ics=16></i> 国産',color:'#1db97a'},{id:'div2',label:'2課',team:'<i data-ic=globe data-ics=16></i> 輸入',color:'#ec4899'}].forEach(function(d){
      var cc=data.byCourse[d.id];
      var cLanding=sumTiers(cc,TIER_IDS);
      h += '<div class="sv-course" style="--cc:'+d.color+'">';
      h += '<div class="sv-course-h"><span class="sv-course-pill" style="background:'+d.color+'">'+d.label+'</span><span class="sv-course-team">'+d.team+'</span><span class="sv-course-land">着地 '+man(cLanding)+'</span></div>';
      h += miniStack(cc, scaleC);
      h += '<div class="sv-course-grid">';
      TIERS.forEach(function(tt){ h += '<div class="sv-cc"><span class="sv-cc-dot" style="background:'+tt.color+'"></span><span class="sv-cc-l">'+tt.label+'</span><b>'+man(cc[tt.id].sum)+'</b><i>'+cc[tt.id].count+'台</i></div>'; });
      h += '</div></div>';
    });
    h += '</div>';

    // フロント別
    h += frontTable(data.fronts);

    h += '<div class="sv-foot">金額の取り方：実績＝確定額(amountFinal)／確定＝受注額／予定＝見積額／見込・予測＝概算（作業タイプ別平均）。数字はすべて円。<br>どの月に数えるか：実績＝実績カウント日／それ以外＝<b>返車予定日</b>（未定と予定日超過は当月）。</div>';
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
  /* 🔴 v1.61.0 区分と「数える日」は物差し（sales-count.js）から。ここはクォーターの窓に当てはめるだけ。
        実績＝現Qの中だけ。まだ返していない車＝**返車予定日が翌Q末までに入っているもの**（元からの「翌Qリミット」を踏襲）。 */
  function qTierOf(c,qS,qE,nqE,todayStr){
    var tier = window.pitSalesTier ? pitSalesTier(c) : null;
    if(!tier) return null;
    if(tier==='actual'){ var d=countDate(c); return (d>=qS&&d<=qE)?'actual':null; }
    if(qE<todayStr) return null;                 // 過去Qは実績のみ
    return inRange(c, qS, nqE, todayStr) ? tier : null;   // 翌Q末までを上限に、返車予定日で振り分ける
  }
  function renderQuarterMonth(wrap){
    var ym=window._svYM, y=ym.y, m=ym.m;
    var moS=ymdL(new Date(y,m,1)), moE=ymdL(new Date(y,m+1,0)); var tg=target();
    var last=new Date(y,m+1,0).getDate(); var qs=[{f:1,t:7},{f:8,t:15},{f:16,t:23},{f:24,t:last}];
    var qAct=[0,0,0,0], qCnt=[0,0,0,0], qMin=[0,0,0,0], qMax=[0,0,0,0];
    /* 🔴 v1.99.0 売上なしでアーカイブした車は実績に数えない（物差し＝pitCardNoSale） */
    (state.cards||[]).forEach(function(c){ if(c.status!=='returned'||noSale(c))return; var d=countDate(c); if(d<moS||d>moE)return; var qi=qOfDay(pd(d).getDate()); qAct[qi]+=actAmt(c); qCnt[qi]++; });
    var al=qAlloc(y,m+1); for(var i=0;i<4;i++){ qMin[i]=al?al.q[i].min:Math.round(tg.min/4); qMax[i]=al?al.q[i].max:Math.round(tg.max/4); }
    var today=new Date(); var isThis=(today.getFullYear()===y&&today.getMonth()===m);
    var todayQ=isThis?qOfDay(today.getDate()):(ymdL(today)>moE?3:0);
    var _td=new Date(); _td.setHours(0,0,0,0); var todayStr=ymdL(_td);
    var actualM=0; qAct.forEach(function(v){actualM+=v;});
    var h=header('month',ym);
    // 現Qの6区分（翌Qリミット）
    var qw=qWindow(y,m,todayQ); var nqE=nextQEnd(y,m,todayQ);
    var qt={}; TIERS.forEach(function(t){ qt[t.id]={sum:0,count:0}; });
    (state.cards||[]).forEach(function(c){ var tr=qTierOf(c,qw.s,qw.e,nqE,todayStr); if(!tr)return; qt[tr].sum+=amtOf(c,tr); qt[tr].count++; });
    var qLanding=sumTiers(qt,TIER_IDS);
    h+='<div class="sv-hero"><div class="sv-hero-row">';
    h+='<div class="sv-hero-main"><div class="sv-hero-lb">現クォーター Q'+(todayQ+1)+'（'+qw.f+'〜'+qw.t+'日）実績</div><div class="sv-hero-num" style="color:#1db97a">'+man(qt.actual.sum)+'<span>円</span></div><div class="sv-hero-sub">Q目標 '+man(qMin[todayQ])+'〜'+man(qMax[todayQ])+'</div></div>';
    h+='<div class="sv-hero-main"><div class="sv-hero-lb">着地見込み（翌Qまで含む）</div><div class="sv-hero-num" style="color:'+(qLanding>=qMin[todayQ]?'#1db97a':'#f59e0b')+'">'+man(qLanding)+'<span>円</span></div><div class="sv-hero-sub">当月実績合計 '+man(actualM)+'</div></div>';
    h+='</div>'+stackBarSvg(qt,qMin[todayQ],qMax[todayQ],qLanding)+'</div>';
    // 6区分カード
    h+='<div class="sv-tiers">';
    h+=tierCard('target','目標','#eab308',man(qMin[todayQ])+'〜'+man(qMax[todayQ]),'','現Qの目標（営業日配分）');
    TIERS.forEach(function(tt){ h+=tierCard(tt.id,tt.label,tt.color,man(qt[tt.id].sum),qt[tt.id].count+'台',tt.note); });
    h+='</div>';
    // 4Qカード＋累計
    h+='<div class="sv-card"><div class="sv-card-h"><span><i data-ic=calendar data-ics=16></i> クォーター実績（月4分割・営業日配分）</span><span class="sv-legend"><i class="sv-lg sv-lg-actual"></i>実績累計 <i class="sv-lg sv-lg-min"></i>目標累計(最低)</span></div>'+quarterChartSvg(qAct,qMin,todayQ)+'<div class="sv-note">クォーター＝1〜7 / 8〜15 / 16〜23 / 24〜末。実績は実績カウント日で計上。上の区分は現Qの着地見込み（実績待/確定/予定/見込/予測は返車予定日で振り分け・翌Q末までが上限）。</div></div>';
    h+='<div class="sv-qcards">';
    for(i=0;i<4;i++){ var p=pct(qAct[i],qMin[i]); var pc=p>=100?'ok':(p>=85?'near':'warn');
      h+='<div class="sv-qcard'+(i===todayQ?' now':'')+'"><div class="sv-qcard-h">Q'+(i+1)+' <span>'+qs[i].f+'〜'+qs[i].t+'日</span>'+(i===todayQ?'<em>進行中</em>':'')+'</div><div class="sv-qcard-num" style="color:#1db97a">'+man(qAct[i])+'</div><div class="sv-qbar"><i class="sv-'+pc+'" style="width:'+Math.min(100,p)+'%"></i></div><div class="sv-qcard-sub">目標 '+man(qMin[i])+'〜'+man(qMax[i])+' ／ <b class="sv-'+pc+'">'+p+'%</b> ／ '+qCnt[i]+'台</div></div>';
    }
    h+='</div><div class="sv-foot">6区分の考え方は「売上」と同じ。クォーター版はパイプライン（確定/予定/見込/予測）を翌クォーター末までを上限に計上します。</div>';
    wrap.innerHTML=h;
  }
  function quarterChartSvg(qAct,qMin,todayQ){
    var W=720,H=200,padL=52,padR=16,padT=14,padB=26,pw=W-padL-padR,ph=H-padT-padB;
    var cumA=[],cumM=[],a=0,mn=0; for(var i=0;i<4;i++){ a+=qAct[i];mn+=qMin[i];cumA[i]=a;cumM[i]=mn; }
    var yMax=(Math.max(mn,cumA[3])||1)*1.08; function X(i){return padL+pw*(i/3);} function Y(v){return padT+ph*(1-v/yMax);}
    var s='<svg class="sv-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">';
    [0,mn].forEach(function(v){ var yy=Y(v); s+='<line class="sv-grid" x1="'+padL+'" y1="'+yy+'" x2="'+(W-padR)+'" y2="'+yy+'"/>'; s+='<text class="sv-ylab" x="'+(padL-6)+'" y="'+(yy+3)+'" text-anchor="end">'+man(v)+'</text>'; });
    var pm=[]; for(i=0;i<4;i++) pm.push(X(i).toFixed(1)+','+Y(cumM[i]).toFixed(1)); s+='<polyline class="sv-pace sv-pace-min" points="'+pm.join(' ')+'"/>';
    var upto=todayQ<0?3:todayQ, pa=[]; for(i=0;i<=upto;i++) pa.push(X(i).toFixed(1)+','+Y(cumA[i]).toFixed(1));
    if(pa.length){ s+='<polyline class="sv-actual-line" points="'+pa.join(' ')+'"/>'; for(i=0;i<=upto;i++) s+='<circle class="sv-actual-dot" cx="'+X(i).toFixed(1)+'" cy="'+Y(cumA[i]).toFixed(1)+'" r="3"/>'; }
    for(i=0;i<4;i++) s+='<text class="sv-xlab" x="'+X(i).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle">Q'+(i+1)+'</text>';
    s+='</svg>'; return s;
  }
  // クォーター月間（年度・月×Qヒートマップ）
  function hmColor(p){ if(p<0)return 'var(--bg3)'; if(p>=110)return 'rgba(29,185,122,.55)'; if(p>=100)return 'rgba(29,185,122,.40)'; if(p>=85)return 'rgba(234,179,8,.35)'; if(p>=60)return 'rgba(249,115,22,.32)'; return 'rgba(239,68,68,.30)'; }
  function renderQuarterYear(wrap){
    var Y=window._svYear, tg=target(), SLOT=[12,1,2,3,4,5,6,7,8,9,10,11];
    var grid=[]; for(var i=0;i<12;i++){ grid[i]=[{act:0,min:0},{act:0,min:0},{act:0,min:0},{act:0,min:0}]; }
    function slotToYM(slot){ var cm=(slot===0)?11:slot-1, cy=(slot===0)?Y-1:Y; return {y:cy,m:cm}; }
    for(i=0;i<12;i++){ var ymo=slotToYM(i); var al=qAlloc(ymo.y,ymo.m+1); for(var q=0;q<4;q++){ grid[i][q].min=al?al.q[q].min:Math.round(tg.min/4); } }
    (state.cards||[]).forEach(function(c){ if(c.status!=='returned')return; var d=countDate(c); if(!d)return; var dd=pd(d),cm=dd.getMonth(),cy=dd.getFullYear(); var fy=(cm===11)?cy+1:cy; if(fy!==Y)return; var slot=(cm===11)?0:cm+1; grid[slot][qOfDay(dd.getDate())].act+=actAmt(c); });
    var h=header('year',{y:Y});
    h+='<div class="sv-card"><div class="sv-card-h"><span><i data-ic=fire data-ics=16></i> クォーター達成率ヒートマップ（年度・月×Q）</span><span class="sv-legend">達成率 低 <i class="sv-hm-lg"></i> 高</span></div>';
    h+='<table class="sv-hm"><thead><tr><th></th><th>Q1<br><i>1-7</i></th><th>Q2<br><i>8-15</i></th><th>Q3<br><i>16-23</i></th><th>Q4<br><i>24-末</i></th><th>月計</th></tr></thead><tbody>';
    for(i=0;i<12;i++){ h+='<tr><td class="sv-hm-mo">'+SLOT[i]+'月</td>'; var moAct=0,moMin=0;
      for(q=0;q<4;q++){ var cell=grid[i][q]; var p=pct(cell.act,cell.min); moAct+=cell.act; moMin+=cell.min; h+='<td class="sv-hm-c" style="background:'+hmColor(cell.act>0?p:-1)+'"><b>'+(cell.act>0?p+'%':'—')+'</b><i>'+man(cell.act)+'</i></td>'; }
      var mp=pct(moAct,moMin); h+='<td class="sv-hm-tot"><b>'+(moAct>0?mp+'%':'—')+'</b><i>'+man(moAct)+'</i></td></tr>';
    }
    h+='</tbody></table></div><div class="sv-note">セル＝そのクォーターの達成率（実績÷営業日配分の目標最低）。濃い緑ほど達成・赤いほど未達・—は実績なし。</div><div class="sv-foot">会計年度（12月〜翌11月）・返車ベース。</div>';
    wrap.innerHTML=h;
  }

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
    var TABS=[['sales','売上'],['quarter','クォーター'],['work','作業内容'],['front','フロント']];
    var h='<div class="sv-tabbar">'+TABS.map(function(t){ return '<button class="sv-topbtn'+(tab===t[0]?' on':'')+'" onclick="svSetTab(\''+t[0]+'\')">'+t[1]+'</button>'; }).join('')+'<div class="sv-tools"><button class="sv-toolbtn" onclick="svExportPdf()" title="A4のPDFで保存（ベクター）"><i data-ic=file data-ics=16></i> PDF出力</button></div></div>';
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
    if(tab==='quarter') yr?renderQuarterYear(wrap):renderQuarterMonth(wrap);
    else if(tab==='work') yr?renderWorkYear(wrap):renderWorkMonth(wrap);
    else if(tab==='front') yr?renderFrontYear(wrap):renderFrontMonth(wrap);
    else yr?renderYear(wrap):renderMonth(wrap);
  }



  // ===== PDF用：現ビューのデータモデル（sales-print.js が A4ベクターPDFに描画） =====
  function _mAll(t){ return sumTiers(t,TIER_IDS); }
  function svReportModel(){
    var tab=window._svTab||'sales', yr=(window._svMode==='year'); var tg=target();
    var SLOT=[12,1,2,3,4,5,6,7,8,9,10,11];
    if(tab==='sales' && !yr){
      var ym=window._svYM; var d=collectMonth(ymdL(new Date(ym.y,ym.m,1)),ymdL(new Date(ym.y,ym.m+1,0))); var t=d.tiers;
      var tierRows=[['目標',man(tg.min)+'〜'+man(tg.max),'']].concat(TIERS.map(function(x){return [x.label,man(t[x.id].sum),t[x.id].count+'台'];}));
      var courseRows=[]; [['div1','1課(国産)'],['div2','2課(輸入)']].forEach(function(c){ var cc=d.byCourse[c[0]]; courseRows.push([c[1]].concat(TIERS.map(function(x){return man(cc[x.id].sum);})).concat([man(_mAll(cc))])); });
      /* 🔴 v1.167.0 紙も画面と同じ区分（TIER_FRONT）から作る。ここで列を書き並べない。 */
      var frontRows=Object.keys(d.fronts).map(function(n){ var f=d.fronts[n];
        return { n:n, a:(f.actual||0), cells:TIER_FRONT.map(function(id){ return man(f[id]||0); }) }; })
        .sort(function(a,b){return b.a-a.a;}).map(function(r){ return [r.n].concat(r.cells); });
      return { title:'売上サマリー', period:ym.y+'年'+(ym.m+1)+'月',
        kpis:[{label:'実績（返車済）',value:man(t.actual.sum)},{label:'実績見込み（＋実績待）',value:man(sumTiers(t,TIER_NEAR))},{label:'着地見込み',value:man(_mAll(t))},{label:'月目標',value:man(tg.min)+'〜'+man(tg.max)}],
        sections:[
          {type:'table',title:'確度別',head:['区分','金額','台数'],rows:tierRows,align:['l','r','r']},
          {type:'table',title:'課別（'+TIERS.map(function(x){return x.label;}).join('/')+'/着地）',
           head:['課'].concat(TIERS.map(function(x){return x.label;})).concat(['着地']),
           rows:courseRows,align:['l'].concat(TIERS.map(function(){return 'r';})).concat(['r'])},
          {type:'table',title:'フロント別（'+TIER_FRONT.map(function(id){return TIER_BY[id].label;}).join('/')+'）',
           head:['フロント'].concat(TIER_FRONT.map(function(id){return TIER_BY[id].label;})),
           rows:frontRows,align:['l'].concat(TIER_FRONT.map(function(){return 'r';}))}
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
    if(tab==='quarter' && !yr){
      var ym2=window._svYM,y2=ym2.y,m2=ym2.m; var moS=ymdL(new Date(y2,m2,1)),moE=ymdL(new Date(y2,m2+1,0));
      var al=qAlloc(y2,m2+1); var qAct=[0,0,0,0],qCnt=[0,0,0,0],qMin=[0,0,0,0],qMax=[0,0,0,0];
      (state.cards||[]).forEach(function(c){ if(c.status!=='returned')return; var dd=countDate(c); if(dd<moS||dd>moE)return; var qi=qOfDay(pd(dd).getDate()); qAct[qi]+=actAmt(c); qCnt[qi]++; });
      for(var i5=0;i5<4;i5++){ qMin[i5]=al?al.q[i5].min:Math.round(tg.min/4); qMax[i5]=al?al.q[i5].max:Math.round(tg.max/4); }
      var today=new Date(); var isThis=(today.getFullYear()===y2&&today.getMonth()===m2); var tq=isThis?qOfDay(today.getDate()):(ymdL(today)>moE?3:0);
      var qw=qWindow(y2,m2,tq), nqE=nextQEnd(y2,m2,tq); var _td=new Date();_td.setHours(0,0,0,0);var todayStr=ymdL(_td);
      var qt={};TIERS.forEach(function(t){qt[t.id]={sum:0,count:0};}); (state.cards||[]).forEach(function(c){ var tr=qTierOf(c,qw.s,qw.e,nqE,todayStr); if(!tr)return; qt[tr].sum+=amtOf(c,tr); qt[tr].count++; });
      var lbl=['1-7','8-15','16-23','24-末']; var qrows=[]; for(i5=0;i5<4;i5++) qrows.push(['Q'+(i5+1)+' '+lbl[i5], man(qMin[i5])+'〜'+man(qMax[i5]), man(qAct[i5]), pct(qAct[i5],qMin[i5])+'%', qCnt[i5]+'台']);
      var tierRows2=[['目標',man(qMin[tq])+'〜'+man(qMax[tq]),'']].concat(TIERS.map(function(x){return [x.label,man(qt[x.id].sum),qt[x.id].count+'台'];}));
      return { title:'クォーター進捗', period:y2+'年'+(m2+1)+'月',
        kpis:[{label:'現Q実績 (Q'+(tq+1)+')',value:man(qt.actual.sum)},{label:'着地(翌Qまで)',value:man(_mAll(qt))},{label:'Q目標',value:man(qMin[tq])+'〜'+man(qMax[tq])}],
        sections:[ {type:'table',title:'クォーター別（月4分割・営業日配分）',head:['Q','目標','実績','達成率','台数'],rows:qrows,align:['l','r','r','r','r']},
          {type:'table',title:'現Qの確度別（翌Qリミット）',head:['区分','金額','台数'],rows:tierRows2,align:['l','r','r']} ]};
    }
    if(tab==='quarter' && yr){
      var Y3=window._svYear; var grid=[];for(var i6=0;i6<12;i6++){grid[i6]=[{a:0,mn:0},{a:0,mn:0},{a:0,mn:0},{a:0,mn:0}];}
      var s2ym=function(sl){var cm=(sl===0)?11:sl-1,cy=(sl===0)?Y3-1:Y3;return{y:cy,m:cm};};
      for(i6=0;i6<12;i6++){var ymo=s2ym(i6);var al3=qAlloc(ymo.y,ymo.m+1);for(var q3=0;q3<4;q3++)grid[i6][q3].mn=al3?al3.q[q3].min:Math.round(tg.min/4);}
      (state.cards||[]).forEach(function(c){ if(c.status!=='returned')return; var d3=countDate(c);if(!d3)return;var dd=pd(d3),cm=dd.getMonth(),cy=dd.getFullYear();var fy=(cm===11)?cy+1:cy;if(fy!==Y3)return;var slot=(cm===11)?0:cm+1;grid[slot][qOfDay(dd.getDate())].a+=actAmt(c); });
      var rows3=[]; for(i6=0;i6<12;i6++){ var row=[SLOT[i6]+'月']; var ma=0,mm3=0; for(q3=0;q3<4;q3++){var cell=grid[i6][q3];ma+=cell.a;mm3+=cell.mn;row.push(cell.a>0?pct(cell.a,cell.mn)+'%':'—');} row.push(ma>0?pct(ma,mm3)+'%':'—'); rows3.push(row); }
      return { title:'クォーター（年度・達成率）', period:(Y3-1)+'/12〜'+Y3+'/11', kpis:[], sections:[{type:'table',title:'月×Q 達成率（実績÷目標最低）',head:['月','Q1','Q2','Q3','Q4','月計'],rows:rows3,align:['l','r','r','r','r','r']}]};
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

  window.renderSales = renderSales;
  window.svSetTab = function(t){ window._svTab=t; renderSales(); };
  window.svSetMode = function(m){ window._svMode=m; renderSales(); };
  window.svSetFrontView = function(v){ window._svFrontView=v; renderSales(); };
  window.svSetWorkView = function(v){ window._svWorkView=v; renderSales(); };
  window.svShiftMonth = function(dir){ var now=new Date(); if(dir===0){ window._svYM={y:now.getFullYear(),m:now.getMonth()}; } else { var d=new Date(window._svYM.y, window._svYM.m+dir, 1); window._svYM={y:d.getFullYear(),m:d.getMonth()}; } renderSales(); };
  window.svShiftYear = function(dir){ var now=new Date(); var cur=(now.getMonth()===11)?now.getFullYear()+1:now.getFullYear(); window._svYear=(dir===0)?cur:(window._svYear+dir); renderSales(); };
})();

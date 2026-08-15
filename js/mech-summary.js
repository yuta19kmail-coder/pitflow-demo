/* ========================================
   mech-summary.js  -  メカニック実績（作業サマリー）/ PitFlow v0.129.0
   ----------------------------------------
   ・カード詳細「整備」タブの点検担当者／整備担当者（c.inspectors / c.mechanics）から、
     確定売上を「点検料 → 点検者」「残り → 整備者」に配分し、誰が・何台・いくら作業したかを集計。
   ・サイドバー「作業サマリー」ビュー（売上ビューと同じインフォグラフィック調）。
   ・カード「整備」タブの割合表示（埋め込み）もここのエンジンを使う（pitMechAllocText）。

   <i data-ic=chevDown data-ics=15></i>配分アルゴリズム（ゆうた指定・2026-07-21）
     - 点検料（初期値・設定 state.settings.inspectFee で調整可／税抜）：
         車検=15,000 ／ 12点=10,000 ／ 一般=10,000 ／ オイル・板金・コーティング=0（純作業）
     - 一般ルール：確定売上が点検料に満たなければ「点検/作業を50:50」で分ける。
     - 確定売上 − 点検料 ＝ 整備者（作業者）へ。点検者・整備者が複数なら各枠を人数割合で更に分配。
     - 整備者が居ない＝点検のみ → 点検者が確定売上を100%獲得（点検台数＝1.0）。
     - 点検者が居ない → 点検料ぶんも整備者へ（作業台数＝1.0）。
     - 台数：点検料の占める割合で「点検台数／作業台数」を按分（例 10万・12点=1万 → 点検0.1台/作業0.9台）。
     - 重複OK：A,B,C＝各1/3 ／ A,A,B＝A 2/3・B 1/3（作業割合として解釈）。
   ======================================== */
(function(){
  'use strict';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function num(v){ v=+v; return isFinite(v)?v:0; }
  function man(n){ var m=n/10000; return (Math.abs(m)>=100?Math.round(m):Math.round(m*10)/10).toLocaleString()+'万'; }
  function yen(n){ return Math.round(num(n)).toLocaleString()+'円'; }
  function veh(n){ return (Math.round(num(n)*10)/10).toLocaleString(); }
  function pd(s){ var p=String(s||'').split('-'); return new Date(+p[0],(+p[1])-1,+p[2]); }
  function ymdL(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

  /* ===== 確定売上（売上ビューの実績と同じ取り方：確定→受注→概算） ===== */
  function pitMechAmount(c){
    if(!c) return 0;
    var a = num(c.amountFinal) || num(c.amountOrder);
    if(a>0) return a;
    if(num(c.estAmount)>0) return num(c.estAmount);
    return (window.pitEstAmount) ? num(pitEstAmount(c.workType, (window.pitTeamKey?pitTeamKey(c):'default'))) : 0;
  }
  window.pitMechAmount = pitMechAmount;

  /* ===== 点検料テーブル（設定で調整可・税抜） ===== */
  var FEE_DEFAULT = { shaken:15000, '12pt':10000, general:10000, oil:0, bp:0, coat1y:0, coat3m:0, _default:0 };
  window.PIT_INSPECT_FEE_DEFAULT = FEE_DEFAULT;
  function feeTable(){
    var s = (state.settings && state.settings.inspectFee) || {};
    var out = {};
    Object.keys(FEE_DEFAULT).forEach(function(k){ out[k] = (s[k]!=null && s[k]!=='') ? num(s[k]) : FEE_DEFAULT[k]; });
    return out;
  }
  function inspectBaseFee(c){
    var ft = feeTable();
    var wt = c.workType || (Array.isArray(c.workTypes)&&c.workTypes[0]) || '';
    return (ft[wt]!=null) ? ft[wt] : ft._default;
  }
  window.pitInspectBaseFee = inspectBaseFee;

  /* 名前配列（重複OK）→ 人ごとの割合 */
  function ratioOf(arr){
    var a = (arr||[]).filter(function(x){ return x && String(x).trim(); });
    var len = a.length;
    if(!len) return { list:[], len:0 };
    var cnt = {};
    a.forEach(function(n){ cnt[n] = (cnt[n]||0)+1; });
    var list = Object.keys(cnt).map(function(n){ return { name:n, count:cnt[n], share:cnt[n]/len }; });
    return { list:list, len:len };
  }

  /* ===== 配分エンジン ===== */
  function pitMechAlloc(c){
    if(!c) return null;
    var F = pitMechAmount(c);
    if(F<=0) return null;
    var insp = ratioOf(c.inspectors), mech = ratioOf(c.mechanics);
    var hasI = insp.len>0, hasM = mech.len>0;
    if(!hasI && !hasM){
      return { total:F, fee:0, work:0, inspectors:[], mechanics:[], inspVehTotal:0, workVehTotal:0, unassigned:F };
    }
    var base = inspectBaseFee(c);
    var fee = (F>=base) ? base : F*0.5;   // 一般ルール：点検料未満なら点検/作業50:50
    if(!hasM) fee = F;                     // 整備者ゼロ＝点検のみ→点検者が全額
    if(!hasI) fee = 0;                     // 点検者ゼロ＝点検料ぶんも整備者へ
    var work = F - fee;
    var inspVehTotal = F>0 ? fee/F : 0;
    var workVehTotal = F>0 ? work/F : 0;
    var inspectors = insp.list.map(function(o){ return { name:o.name, count:o.count, share:o.share, amount:fee*o.share, vehicles:inspVehTotal*o.share }; });
    var mechanics  = mech.list.map(function(o){ return { name:o.name, count:o.count, share:o.share, amount:work*o.share, vehicles:workVehTotal*o.share }; });
    return { total:F, fee:fee, work:work, inspectors:inspectors, mechanics:mechanics, inspVehTotal:inspVehTotal, workVehTotal:workVehTotal, unassigned:0 };
  }
  window.pitMechAlloc = pitMechAlloc;

  /* ===== カード「整備」タブ用：配分表示（埋め込み・ライブ） =====
     🔴 v1.67.0（ゆうた指定）**ここは％だけ。金額は出さない。**
        「最終確定はまだ出ていないし、金額を見るとやっぱり自分の方がちょっと多いかな？とか思っちゃうから％だけに」
        ＝ みんなが見るカードの上に、人ごとの**金額**を並べない。
     ⚠ 金額の内訳が要るときは **作業サマリー**（管理側の集計ビュー）で見る。あちらは金額のまま。
     ⚠ 点検と整備は**別々の枠**を分け合うので、％は**その枠の中での割合**。
        上の帯（点検料ぶん◯% ／ 作業ぶん◯%）が無いと「点検100%」が「全部その人」に読めてしまうので、帯は必ず出す。 */
  function pitMechAllocText(c){
    var a = pitMechAlloc(c);
    if(!a){
      return '<div class="cf-mech-note">担当者を選ぶと、ここに配分（％）が出ます。</div>';
    }
    if(a.unassigned){
      return '<div class="cf-mech-note">担当者を選ぶと、ここに配分（％）が出ます。</div>';
    }
    var fp = a.total>0 ? (a.fee/a.total*100) : 0;
    var wp = 100 - fp;
    var h = '<div class="mech-alloc">';
    /* 点検ぶん／作業ぶんの帯（％だけ） */
    h += '<div class="mech-split">'
       + (fp>0 ? '<i class="ms-i" style="width:'+fp.toFixed(1)+'%">'+(fp>=14?'点検 '+Math.round(fp)+'%':'')+'</i>' : '')
       + (wp>0 ? '<i class="ms-m" style="width:'+wp.toFixed(1)+'%">'+(wp>=14?'作業 '+Math.round(wp)+'%':'')+'</i>' : '')
       + '</div>';
    h += '<div class="mech-split-lb"><span>点検ぶん '+Math.round(fp)+'%</span><span>作業ぶん '+Math.round(wp)+'%</span></div>';
    function row(o, kind, cls){
      return '<div class="mech-alloc-row '+cls+'">'
        + '<span class="mech-alloc-nm">'+esc(o.name)+(o.count>1?'<i class="mech-alloc-x">×'+o.count+'</i>':'')+'</span>'
        + '<span class="mech-alloc-kind">'+kind+'</span>'
        + '<span class="mech-alloc-pct">'+Math.round(o.share*100)+'%</span></div>';
    }
    a.inspectors.forEach(function(o){ h += row(o, '<i data-ic=search data-ics=16></i>点検', 'insp'); });
    a.mechanics.forEach(function(o){ h += row(o, '<i data-ic=wrench data-ics=16></i>整備', 'mech'); });
    h += '</div>';
    return h;
  }
  window.pitMechAllocText = pitMechAllocText;

  /* ===================== 作業サマリー ビュー ===================== */
  /* 🔴 v1.61.0 実績を数える日は物差し1本（js/sales-count.js）から。写しを作らない */
  function returnDateOf(c){ return window.pitSalesCountDate ? pitSalesCountDate(c) : (c.completedAt || c.returnDateFinal || c.returnDate || ''); }

  function collect(moS, moE){
    var people = {};          // name -> {inspAmt,workAmt,inspVeh,workVeh}
    var unassignedAmt = 0, unassignedCnt = 0;
    var totalAmt = 0, totalVeh = 0, cardN = 0;
    (state.cards||[]).forEach(function(c){
      if(!c || c.status!=='returned') return;
      /* 🔴 v1.99.0 売上なしでアーカイブした車は実績ではないので、メカの配分にも数えない */
      if(window.pitCardNoSale && pitCardNoSale(c)) return;
      var d = returnDateOf(c); if(!d || d<moS || d>moE) return;
      var a = pitMechAlloc(c); if(!a) return;
      cardN++; totalAmt += a.total;
      if(a.unassigned){ unassignedAmt += a.unassigned; unassignedCnt++; return; }
      totalVeh += (a.inspVehTotal + a.workVehTotal);
      a.inspectors.forEach(function(o){ var p=people[o.name]||(people[o.name]={inspAmt:0,workAmt:0,inspVeh:0,workVeh:0}); p.inspAmt+=o.amount; p.inspVeh+=o.vehicles; });
      a.mechanics.forEach(function(o){ var p=people[o.name]||(people[o.name]={inspAmt:0,workAmt:0,inspVeh:0,workVeh:0}); p.workAmt+=o.amount; p.workVeh+=o.vehicles; });
    });
    var rows = Object.keys(people).map(function(n){ var p=people[n];
      return { name:n, inspAmt:p.inspAmt, workAmt:p.workAmt, totAmt:p.inspAmt+p.workAmt,
               inspVeh:p.inspVeh, workVeh:p.workVeh, totVeh:p.inspVeh+p.workVeh }; });
    rows.sort(function(a,b){ return b.totAmt-a.totAmt || b.totVeh-a.totVeh; });
    return { rows:rows, unassignedAmt:unassignedAmt, unassignedCnt:unassignedCnt,
             totalAmt:totalAmt, totalVeh:totalVeh, cardN:cardN, people:rows.length };
  }

  function barChart(rows){
    if(!rows.length) return '';
    var top = rows.slice(0, 12);
    var max = Math.max.apply(null, top.map(function(r){ return r.totAmt; }).concat([1]));
    var h = '<div class="mech-bars">';
    top.forEach(function(r){
      var iw = max>0 ? (r.inspAmt/max*100) : 0;
      var ww = max>0 ? (r.workAmt/max*100) : 0;
      h += '<div class="mech-bar-row">'
        + '<span class="mech-bar-nm">'+esc(r.name)+'</span>'
        + '<span class="mech-bar-track">'
        +   '<i class="mech-bar-insp" style="width:'+iw.toFixed(1)+'%"><span class="mech-bar-tt">点検 '+man(r.inspAmt)+'</span></i>'
        +   '<i class="mech-bar-work" style="width:'+ww.toFixed(1)+'%"><span class="mech-bar-tt">整備 '+man(r.workAmt)+'</span></i>'
        + '</span>'
        + '<b class="mech-bar-amt">'+man(r.totAmt)+'</b>'
        + '</div>';
    });
    h += '</div>';
    return h;
  }

  function peopleTable(rows){
    var h = '<div class="sv-card"><div class="sv-card-h"><span><i data-ic=user data-ics=16></i> メカニック別（点検・整備）</span>'
      + '<span class="sv-legend"><i class="mech-lg mech-lg-insp"></i>点検 <i class="mech-lg mech-lg-work"></i>整備</span></div>';
    if(!rows.length){ return h + '<div class="sv-empty">対象データがありません（返車済みカードに点検/整備担当者を割り当てると集計されます）。</div></div>'; }
    h += '<table class="sv-table mech-table"><thead><tr>'
       + '<th>メカニック</th><th>点検台</th><th>整備台</th><th>計 台</th><th>点検額</th><th>整備額</th><th>計 金額</th>'
       + '</tr></thead><tbody>';
    rows.forEach(function(r){
      h += '<tr>'
        + '<td class="sv-td-name">'+esc(r.name)+'</td>'
        + '<td class="sv-num">'+veh(r.inspVeh)+'</td>'
        + '<td class="sv-num">'+veh(r.workVeh)+'</td>'
        + '<td class="sv-num"><b>'+veh(r.totVeh)+'</b></td>'
        + '<td class="sv-num" style="color:#0ea5e9">'+man(r.inspAmt)+'</td>'
        + '<td class="sv-num" style="color:#1db97a">'+man(r.workAmt)+'</td>'
        + '<td class="sv-num"><b>'+man(r.totAmt)+'</b></td>'
        + '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  function header(){
    var mode = window._wsMode || 'month';
    var ym = window._wsYM;
    var h = '<div class="sv-head"><div class="sv-tabs">'
      + '<button class="sv-tab'+(mode==='month'?' on':'')+'" onclick="wsSetMode(\'month\')">当月</button>'
      + '<button class="sv-tab'+(mode==='year'?' on':'')+'" onclick="wsSetMode(\'year\')">月間（年度）</button></div>';
    if(mode==='month'){
      h += '<div class="sv-nav"><button onclick="wsShiftMonth(-1)" title="前の月"><i data-ic=chevLeft data-ics=16></i></button><b>'+ym.y+'年'+(ym.m+1)+'月</b>'
         + '<button onclick="wsShiftMonth(1)" title="次の月"><i data-ic=chevRight data-ics=16></i></button><button class="sv-now" onclick="wsShiftMonth(0)">今月</button></div>';
    } else {
      var Y = window._wsYear;
      h += '<div class="sv-nav"><button onclick="wsShiftYear(-1)" title="前の年度"><i data-ic=chevLeft data-ics=16></i></button><b>'+(Y-1)+'/12〜'+Y+'/11</b>'
         + '<button onclick="wsShiftYear(1)" title="次の年度"><i data-ic=chevRight data-ics=16></i></button><button class="sv-now" onclick="wsShiftYear(0)">今年度</button></div>';
    }
    h += '</div>';
    return h;
  }

  function renderMonth(wrap){
    var ym = window._wsYM;
    var moS = ymdL(new Date(ym.y, ym.m, 1));
    var moE = ymdL(new Date(ym.y, ym.m+1, 0));
    var d = collect(moS, moE);
    var h = header();

    h += '<div class="sv-hero"><div class="sv-hero-row">';
    h += '<div class="sv-hero-main"><div class="sv-hero-lb">作業売上（配分対象・返車済み）</div>'
       + '<div class="sv-hero-num" style="color:#1db97a">'+man(d.totalAmt)+'<span>円</span></div>'
       + '<div class="sv-hero-sub">'+d.cardN+'台を集計'+(d.unassignedCnt?('　／　未割当 '+d.unassignedCnt+'台'):'')+'</div></div>';
    h += '<div class="sv-hero-main"><div class="sv-hero-lb">稼働メカニック</div>'
       + '<div class="sv-hero-num">'+d.people+'<span>人</span></div>'
       + '<div class="sv-hero-sub">割当済み台数 '+veh(d.totalVeh)+' 台</div></div>';
    h += '</div></div>';

    h += '<div class="sv-card"><div class="sv-card-h"><span><i data-ic=chart data-ics=16></i> メカニック別 作業額（点検＝水色／整備＝緑）</span></div>';
    h += (d.rows.length ? barChart(d.rows) : '<div class="sv-empty">この月の割当データはまだありません。</div>');
    h += '</div>';

    h += peopleTable(d.rows);

    if(d.unassignedCnt){
      h += '<div class="sv-note"><i data-ic=warn data-ics=16></i> 担当者が未割り当ての返車 '+d.unassignedCnt+'台（'+man(d.unassignedAmt)+'円）は誰にも配分していません。カード詳細の「整備」タブで点検/整備担当者を選ぶと集計に入ります。</div>';
    }
    h += '<div class="sv-foot">配分：確定売上−点検料＝整備者へ／点検料は点検者へ（車検1.5万・12点/一般1万・オイル/板金/コーティング0）。台数は点検料の割合で点検/作業に按分。金額はすべて税抜。</div>';
    wrap.innerHTML = h;
  }

  function renderYear(wrap){
    var Y = window._wsYear;         // 会計年度の締め年（12月〜翌11月）
    var moS = ymdL(new Date(Y-1, 11, 1));
    var moE = ymdL(new Date(Y, 10, 30+1));   // 11月末を含める（安全側で12/1未満判定）
    moE = ymdL(new Date(Y, 11, 0));          // 11月末日
    var d = collect(moS, moE);
    var h = header();
    h += '<div class="sv-hero"><div class="sv-hero-row">';
    h += '<div class="sv-hero-main"><div class="sv-hero-lb">年度 作業売上（'+(Y-1)+'/12〜'+Y+'/11・返車ベース）</div>'
       + '<div class="sv-hero-num" style="color:#1db97a">'+man(d.totalAmt)+'<span>円</span></div>'
       + '<div class="sv-hero-sub">'+d.cardN+'台を集計'+(d.unassignedCnt?('　／　未割当 '+d.unassignedCnt+'台'):'')+'</div></div>';
    h += '<div class="sv-hero-main"><div class="sv-hero-lb">稼働メカニック</div>'
       + '<div class="sv-hero-num">'+d.people+'<span>人</span></div>'
       + '<div class="sv-hero-sub">割当済み台数 '+veh(d.totalVeh)+' 台</div></div>';
    h += '</div></div>';
    h += '<div class="sv-card"><div class="sv-card-h"><span><i data-ic=chart data-ics=16></i> メカニック別 作業額（年度）</span></div>';
    h += (d.rows.length ? barChart(d.rows) : '<div class="sv-empty">この年度の割当データはまだありません。</div>');
    h += '</div>';
    h += peopleTable(d.rows);
    if(d.unassignedCnt){
      h += '<div class="sv-note"><i data-ic=warn data-ics=16></i> 未割り当ての返車 '+d.unassignedCnt+'台（'+man(d.unassignedAmt)+'円）は配分していません。</div>';
    }
    h += '<div class="sv-foot">年度＝会計年度（12月〜翌11月）。当月の詳細は「当月」タブへ。金額はすべて税抜。</div>';
    wrap.innerHTML = h;
  }

  function renderWorkSummary(){
    var wrap = document.getElementById('view-worksum-body');
    if(!wrap) return;
    var now = new Date();
    if(!window._wsMode) window._wsMode = 'month';
    if(!window._wsYM)   window._wsYM = { y:now.getFullYear(), m:now.getMonth() };
    if(!window._wsYear) window._wsYear = (now.getMonth()===11) ? now.getFullYear()+1 : now.getFullYear();
    if(window._wsMode==='year') renderYear(wrap); else renderMonth(wrap);
  }
  window.renderWorkSummary = renderWorkSummary;

  window.wsSetMode    = function(m){ window._wsMode = m; renderWorkSummary(); };
  window.wsShiftMonth = function(dir){ var now=new Date(); if(dir===0){ window._wsYM={y:now.getFullYear(),m:now.getMonth()}; } else { var d=new Date(window._wsYM.y, window._wsYM.m+dir, 1); window._wsYM={y:d.getFullYear(),m:d.getMonth()}; } renderWorkSummary(); };
  window.wsShiftYear  = function(dir){ var now=new Date(); var cur=(now.getMonth()===11)?now.getFullYear()+1:now.getFullYear(); window._wsYear=(dir===0)?cur:(window._wsYear+dir); renderWorkSummary(); };
})();

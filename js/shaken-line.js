/* ========================================
   shaken-line.js  -  車検ライン（作業サマリーの2つ目のタブ）/ PitFlow v2.58.0
   ----------------------------------------
   🗣 ゆうた（2026-09-04）
     「作業サマリー画面の一番上に 整備 と 車検ライン の大きく2つに分かれる」
     「整備の方の内容は既存のものと何も変えない」「車検ラインの方を新設」
     「その月ごとのライン業務の件数／誰が何台行って何%なのか／合格何台 うち国産何台 何%
       輸入何台 何%／理由一覧など／どうすればより効率的に実行できるのか／
       整備としてなにに気を付けていくのがいいのかの指標になるようなビュー」
     （数え方）「どちらもかな　見やすく　全体からエラーの数　詳細　みたいな感じにまとめてほしい」
     （誰の実績か）「**回送の担当だけ**」

   ◎ 並びは 🅰 全体 → 🅱 エラー → 🅲 詳細 の3段（ゆうた指定）。

   🔴🔴 **数える元は「実際に陸運局へ行った記録」だけ。** 予定は1件も数えない。
      ・合格   … `inspSchedule.result==='done'` の実施日（`resultDate` が正・無ければ決定日）
      ・不合格 … `inspSchedule.history[]` の `recheck` 1本＝1回（v2.56.0 で言葉を「不合格」にした）
      ⚠ 言葉の意味は pit-share.js の物差しに書いてある。ここで作り直さない
        （不合格＝戻して修理／再検＝もう一度行く予定／再検合格＝その回で受かった）。

   🔴 **入場回数と台数は別もの。** 1台が2回行けば入場2・台数1。
      その差がそのまま「手戻り」＝ここが効率の話の入口。
   ⚠ 台数は**その月にラインへ乗った車**の実数（合格した台数とは違う。月をまたぐ車があるため）。
   ======================================== */
(function(){
  'use strict';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function num(v){ v=+v; return isFinite(v)?v:0; }
  /* 割合。⚠ 分母が0の時は「0%」と書かない（0%と「まだ無い」は別の意味） */
  function pct(n,d){ return d>0 ? (Math.round(n/d*1000)/10)+'%' : '—'; }
  function pctN(n,d){ return d>0 ? (n/d*100) : 0; }
  function fmd(iso){ return window.fmtMD ? fmtMD(iso) : String(iso||''); }
  function surname(c){ return (window.pitCustSurname?pitCustSurname(c):(c.customer||''))||'（未入力）'; }
  function carOf(c){ return (window.pitCarLabel?pitCarLabel(c):((c.maker?c.maker+' ':'')+(c.car||'')))||''; }
  function isShaken(c){ return window.pitIsShaken ? pitIsShaken(c) : ((c.workTypes||[]).indexOf('shaken')>=0 || c.workType==='shaken'); }
  function teamOf(c){ return (window.pitTeamKey?pitTeamKey(c):((c&&c.boardId==='import')?'import':'default')); }
  function teamLabel(t){ return t==='import' ? '輸入' : '国産'; }
  function staffOf(n){ return n ? (window.pitStaffShort?pitStaffShort(n):n) : '（未記録）'; }

  /* ═══════════════════════════════════════════════════════════
     入場（ラインを1回通したこと）を集める。
     kind … 'pass1'（一発合格）／'repass'（再検合格）／'passAfter'（戻して直して合格）／'ng'（不合格）
     ⚠ 'passAfter' は**その車が前に落ちている**という意味。落ちたのが先月でも合格は今月に立つ。
     ═══════════════════════════════════════════════════════════ */
  function collect(moS, moE){
    var trips=[];
    (state.cards||[]).forEach(function(c){
      if(!c || !isShaken(c)) return;
      var s=c.inspSchedule; if(!s || typeof s!=='object') return;
      var team=teamOf(c);
      /* ① 不合格＝落ちて自社に戻した回（1本＝1入場） */
      (Array.isArray(s.history)?s.history:[]).forEach(function(h){
        if(!h || h.result!=='recheck' || !h.date) return;
        if(h.date<moS || h.date>moE) return;
        trips.push({ iso:h.date, kind:'ng', c:c, team:team, staff:h.staff||'',
          office:h.officeName||'', round:num(h.round), slot:(h.slot==='pm')?'pm':'am', note:h.note||'' });
      });
      /* ② 合格＝この月に締まった車 */
      if(s.result==='done'){
        var d=s.resultDate||s.decided;
        if(d && d>=moS && d<=moE){
          var reN = window.pitShakenReCount ? pitShakenReCount(s) : 0;
          var rp  = window.pitShakenIsRepass ? pitShakenIsRepass(s) : !!s.repass;
          trips.push({ iso:d, kind: rp?'repass':(reN?'passAfter':'pass1'), c:c, team:team,
            staff:s.resultStaff||'', office:s.officeName||'', round:num(s.round),
            slot:((s.resultSlot||s.decidedSlot)==='pm')?'pm':'am', note: rp?(s.repassNote||''):'', reNo:reN });
        }
      }
    });
    trips.sort(function(a,b){ return a.iso<b.iso?-1:(a.iso>b.iso?1:0); });
    return trips;
  }

  /* 🔴 数え方の入口はこの1本。**画面も見張りもここを通る**（数え直す場所を作らない）。 */
  window.pitShakenLineTrips = function(moS, moE){ return collect(moS, moE); };

  /* 理由（落ちた所）を1語ずつに割る。
     ⚠ 手で書ける欄なので区切りは何でも来る＝「・、，／/ 空白」を全部区切りとして扱う。
     🔴 数えるのは**不合格＋再検合格の両方**。再検合格もラインで一度ひっかかっている
        ＝「整備として何に気を付けるか」の材料としては同じ価値がある。 */
  function words(trips){
    var cnt={}, ngCnt={}, total=0;
    trips.forEach(function(t){
      if(!t.note) return;
      String(t.note).split(/[・、，,／\/\s]+/).map(function(x){return x.trim();}).filter(Boolean).forEach(function(w){
        cnt[w]=(cnt[w]||0)+1; total++;
        if(t.kind==='ng') ngCnt[w]=(ngCnt[w]||0)+1;
      });
    });
    var list=Object.keys(cnt).map(function(w){ return { w:w, n:cnt[w], ng:ngCnt[w]||0 }; })
      .sort(function(a,b){ return b.n-a.n || b.ng-a.ng; });
    return { list:list, total:total };
  }

  function sum(trips, f){ var n=0; trips.forEach(function(t){ if(f(t)) n++; }); return n; }
  function uniqCards(trips){ var m={}; trips.forEach(function(t){ m[t.c.id]=1; }); return Object.keys(m).length; }

  /* ═══════════════════════════════════════════════════════════
     🅰 全体
     ═══════════════════════════════════════════════════════════ */
  function heroHtml(T){
    var enter=T.length;
    var cars=uniqCards(T);
    var p1=sum(T,function(t){return t.kind==='pass1';});
    var rp=sum(T,function(t){return t.kind==='repass';});
    var pa=sum(T,function(t){return t.kind==='passAfter';});
    var pass=p1+rp+pa;
    var ng=sum(T,function(t){return t.kind==='ng';});
    var h='<div class="sv-hero"><div class="sv-hero-row">';
    h+='<div class="sv-hero-main"><div class="sv-hero-lb">ラインを通した回数（入場）</div>'
      +'<div class="sv-hero-num">'+enter+'<span>回</span></div>'
      +'<div class="sv-hero-sub">実台数 '+cars+' 台'+(enter>cars?('　／　手戻り '+(enter-cars)+' 回'):'')+'</div></div>';
    h+='<div class="sv-hero-main"><div class="sv-hero-lb">合格（この月に締まった）</div>'
      +'<div class="sv-hero-num sln-ok">'+pass+'<span>台</span></div>'
      +'<div class="sv-hero-sub">一発 '+p1+'　再検合格 '+rp+'　戻して合格 '+pa+'</div></div>';
    h+='<div class="sv-hero-main"><div class="sv-hero-lb">一発合格率（合格した台のうち）</div>'
      /* ⚠ 色は css のクラスで持つ。**js に色を直書きしない**
         （test_pit_rules.mjs の③＝色の直書きの棚卸しに引っかかる。国産の緑と見分けが付かないため）。 */
      +'<div class="sv-hero-num '+(pctN(p1,pass)>=80?'sln-ok':pctN(p1,pass)>=60?'sln-warn':'sln-bad')+'">'+pct(p1,pass)+'</div>'
      +'<div class="sv-hero-sub">1台あたり '+(cars?(Math.round(enter/cars*100)/100):'—')+' 回で通った</div></div>';
    h+='<div class="sv-hero-main"><div class="sv-hero-lb">不合格（自社に戻した）</div>'
      +'<div class="sv-hero-num '+(ng?'sln-bad':'sln-none')+'">'+ng+'<span>件</span></div>'
      +'<div class="sv-hero-sub">入場の '+pct(ng,enter)+'</div></div>';
    h+='</div></div>';
    return h;
  }

  /* ═══════════════════════════════════════════════════════════
     🅱 エラー（不合格）
     ═══════════════════════════════════════════════════════════ */
  function errorHtml(T){
    var ng=T.filter(function(t){return t.kind==='ng';});
    var W=words(T);
    /* 🔴🔴 v2.61.0（ゆうたの大前提＝抜けは許容せず、0にする対象として数を出す）
       **「落ちた所」が未記入の数を必ず立てる。** 書かれていないものは集計から静かに消えるので、
       数を出さないと「理由が少ない月」に見えてしまう。 */
    var ngNo = ng.filter(function(t){ return !t.note; }).length;
    var rpNo = T.filter(function(t){ return t.kind==='repass' && !t.note; }).length;
    var h='<div class="sv-card"><div class="sv-card-h"><span><i data-ic=warn data-ics=16></i> エラー ── 落ちた中身</span>'
      + '<span class="sv-legend">不合格 '+ng.length+' 件／ひっかかった項目 '+W.total+' 個</span></div>';
    if(!W.list.length){
      h+='<div class="sv-empty">'+(ng.length
        ? 'この月の不合格 '+ng.length+' 件には「落ちた所」が書かれていません。記録する窓で1行入れると、ここに集計されます。'
        : 'この月は落ちていません。')+'</div>'
        + fixListHtml(ngNo, rpNo) + '</div>';
      return h;
    }
    var max=W.list[0].n;
    h+='<div class="sln-words">';
    W.list.slice(0,12).forEach(function(o){
      var w=Math.max(4, o.n/max*100);
      h+='<div class="sln-wrow"><span class="sln-wnm">'+esc(o.w)+'</span>'
        +'<span class="sln-wtrack"><i style="width:'+w.toFixed(1)+'%"></i></span>'
        +'<b class="sln-wn">'+o.n+'</b>'
        +'<span class="sln-wsub">'+(o.ng?('戻し '+o.ng):'その場で通過')+'</span></div>';
    });
    h+='</div>';
    h+='<div class="sv-foot" style="margin:6px 2px 0">「戻し」＝そのまま不合格になって自社へ持ち帰った数。数字が無いものは、その回のうちに直して通っています（再検合格）。</div>';
    h+=fixListHtml(ngNo, rpNo);
    h+='</div>';
    return h;
  }

  /* 🔴🔴 v2.61.0 **0にする対象**（落ちた所の未記入）。⚠ 0の時は「0件」と出す＝0が正しい姿だと分かるように。 */
  function fixListHtml(ngNo, rpNo){
    if(!ngNo && !rpNo) return '<div class="sln-fix sln-fix-ok">✅ 落ちた所は<b>全部書かれています</b>（未記入 0件）。</div>';
    var li=[];
    if(ngNo) li.push('<li><b>不合格で「落ちた所」が未記入</b>　<b class="sln-fix-n">'+ngNo+'件</b>'
      + '<span>予約詳細の不合格の記録を押すと、あとから書き足せます</span></li>');
    if(rpNo) li.push('<li><b>再検合格で「落ちた所」が未記入</b>　<b class="sln-fix-n">'+rpNo+'件</b>'
      + '<span>その回で受かった車です。何でひっかかったかが残っていません</span></li>');
    return '<div class="sln-fix"><div class="sln-fix-h">0にする対象</div><ul>'+li.join('')+'</ul>'
      + '<div class="sln-fix-note">⚠ 未記入のぶんは上の集計に出てきません。ここが 0 でないと、理由の多い順は本当の順番ではありません。</div></div>';
  }

  /* 🔎 気をつけどころ＝**数字から出せることだけ**書く。
     ⚠ 決めつけない・作り話をしない。出るのは「多い順」「差が大きい所」だけ。 */
  function adviceHtml(T){
    var tips=[];
    var W=words(T);
    var ngN=sum(T,function(t){return t.kind==='ng';});
    var enter=T.length, cars=uniqCards(T);
    if(W.list.length){
      var top=W.list.slice(0,3).map(function(o){ return o.w+'（'+o.n+'）'; }).join('・');
      tips.push('この月ひっかかった順＝<b>'+esc(top)+'</b>。ライン前の最終チェックはここから見るのが早い。');
    }
    /* 国産と輸入で落ち方が違うか（差が10ポイント以上ある時だけ言う） */
    var dEnter=sum(T,function(t){return t.team!=='import';}), dNg=sum(T,function(t){return t.team!=='import'&&t.kind==='ng';});
    var iEnter=sum(T,function(t){return t.team==='import';}), iNg=sum(T,function(t){return t.team==='import'&&t.kind==='ng';});
    if(dEnter>=3 && iEnter>=3){
      var diff=Math.abs(pctN(dNg,dEnter)-pctN(iNg,iEnter));
      if(diff>=10){
        var worse=(pctN(iNg,iEnter)>pctN(dNg,dEnter))?'輸入':'国産';
        tips.push('<b>'+worse+'</b>の方が落ちる割合が高い（国産 '+pct(dNg,dEnter)+'／輸入 '+pct(iNg,iEnter)+'）。'
          +worse+'は下見の手順を分けた方がよさそう。');
      }
    }
    /* 遅い枠（午後・4R）は、落ちた時にその日のうちに戻せない＝手戻りが1日伸びる。
       ⚠ 「割合が多い」だけでは言わない。**落ち方に差が出ている時だけ**言う。 */
    var amE=sum(T,function(t){return t.slot==='am';}), amN=sum(T,function(t){return t.slot==='am'&&t.kind==='ng';});
    var pmE=sum(T,function(t){return t.slot==='pm';}), pmN=sum(T,function(t){return t.slot==='pm'&&t.kind==='ng';});
    if(amE>=3 && pmE>=3 && (pctN(pmN,pmE)-pctN(amN,amE))>=10){
      tips.push('<b>午後の方が落ちている</b>（午前 '+pct(amN,amE)+'／午後 '+pct(pmN,pmE)+'）。'
        +'午後・とくに4Rで落ちると<b>その日のうちに戻せない</b>（翌日以降）。'
        +'あやしい車を早い枠に寄せるだけで、手戻りが1日縮む。');
    }
    var r4=sum(T,function(t){return t.round===4;}), r4n=sum(T,function(t){return t.round===4&&t.kind==='ng';});
    if(enter>=5 && r4>=3 && pctN(r4n,r4)>=25){
      tips.push('<b>4R の '+pct(r4n,r4)+'が落ちている</b>（'+r4n+'/'+r4+'）。4Rは戻す道がその日に無い枠。');
    }
    /* 手戻りの量 */
    if(cars>0 && enter>cars){
      tips.push('手戻りが <b>'+(enter-cars)+' 回</b>（1台あたり '+(Math.round(enter/cars*100)/100)+' 回）。'
        +'この回数がそのまま回送の時間と人の手を食っている。');
    }
    if(!ngN && enter>0) tips.push('この月は<b>不合格ゼロ</b>。');
    if(!tips.length) return '';
    return '<div class="sv-card sln-adv"><div class="sv-card-h"><span><i data-ic=bulb data-ics=16></i> 気をつけどころ</span>'
      + '<span class="sv-legend">この月の数字から出しているだけの目安</span></div>'
      + '<ul class="sln-tips">'+tips.map(function(t){ return '<li>'+t+'</li>'; }).join('')+'</ul></div>';
  }

  /* ═══════════════════════════════════════════════════════════
     🅲 詳細
     ═══════════════════════════════════════════════════════════ */
  function staffHtml(T){
    var m={};
    T.forEach(function(t){
      var k=t.staff||'';
      var o=m[k]||(m[k]={name:k, enter:0, ng:0, pass:0, cars:{}});
      o.enter++; o.cars[t.c.id]=1;
      if(t.kind==='ng') o.ng++; else o.pass++;
    });
    var rows=Object.keys(m).map(function(k){ var o=m[k]; o.carN=Object.keys(o.cars).length; return o; })
      .sort(function(a,b){ return b.enter-a.enter; });
    var tot=T.length;
    var h='<div class="sv-card"><div class="sv-card-h"><span><i data-ic=user data-ics=16></i> 回送の担当別（陸運局へ行った人）</span>'
      +'<span class="sv-legend">整備した人ではありません</span></div>';
    if(!rows.length) return h+'<div class="sv-empty">この月の記録はまだありません。</div></div>';
    h+='<table class="sv-table"><thead><tr><th>担当</th><th>入場</th><th>割合</th><th>台数</th><th>通した</th><th>不合格</th><th>通過率</th></tr></thead><tbody>';
    rows.forEach(function(r){
      h+='<tr><td class="sv-td-name">'+esc(staffOf(r.name))+'</td>'
        +'<td class="sv-num">'+r.enter+'</td>'
        +'<td class="sv-num">'+pct(r.enter,tot)+'</td>'
        +'<td class="sv-num">'+r.carN+'</td>'
        +'<td class="sv-num sln-ok">'+r.pass+'</td>'
        +'<td class="sv-num '+(r.ng?'sln-bad':'sln-none')+'">'+r.ng+'</td>'
        +'<td class="sv-num"><b>'+pct(r.pass,r.enter)+'</b></td></tr>';
    });
    h+='</tbody></table>';
    h+='<div class="sv-foot" style="margin:6px 2px 0">⚠ 通過率は<b>行った人の腕の話ではありません</b>（落ちる原因は整備側にあることが多い）。誰にどれだけ回送が乗っているかを見るための表です。</div>';
    return h+'</div>';
  }

  function teamHtml(T){
    function row(lb, f){
      var a=T.filter(f);
      var enter=a.length;
      var p1=sum(a,function(t){return t.kind==='pass1';});
      var rp=sum(a,function(t){return t.kind==='repass';});
      var pa=sum(a,function(t){return t.kind==='passAfter';});
      var pass=p1+rp+pa, ng=sum(a,function(t){return t.kind==='ng';});
      return '<tr><td class="sv-td-name">'+lb+'</td>'
        +'<td class="sv-num">'+enter+'</td>'
        +'<td class="sv-num"><b>'+pass+'</b></td>'
        +'<td class="sv-num">'+pct(pass,TP)+'</td>'
        +'<td class="sv-num">'+p1+'</td>'
        +'<td class="sv-num">'+rp+'</td>'
        +'<td class="sv-num">'+pa+'</td>'
        +'<td class="sv-num"><b>'+pct(p1,pass)+'</b></td>'
        +'<td class="sv-num '+(ng?'sln-bad':'sln-none')+'">'+ng+'</td>'
        +'<td class="sv-num">'+pct(ng,enter)+'</td></tr>';
    }
    var TP=sum(T,function(t){return t.kind!=='ng';});
    var h='<div class="sv-card"><div class="sv-card-h"><span><i data-ic=car data-ics=16></i> 国産・輸入</span>'
      +'<span class="sv-legend">「うち割合」＝その月に合格した台のうち、国産と輸入がそれぞれ何%か</span></div>'
      +'<table class="sv-table"><thead><tr><th>区分</th><th>入場</th><th>合格</th><th>うち割合</th><th>一発</th><th>再検合格</th><th>戻して合格</th><th>一発合格率</th><th>不合格</th><th>不合格率</th></tr></thead><tbody>';
    h+=row('国産', function(t){ return t.team!=='import'; });
    h+=row('輸入', function(t){ return t.team==='import'; });
    h+='</tbody></table></div>';
    return h;
  }

  function whereHtml(T){
    function tally(key, lb){
      var m={};
      T.forEach(function(t){ var k=key(t)||'（未記録）'; var o=m[k]||(m[k]={n:0,ng:0}); o.n++; if(t.kind==='ng') o.ng++; });
      var ks=Object.keys(m).sort(function(a,b){ return m[b].n-m[a].n; });
      if(!ks.length) return '';
      return '<div class="sln-mini"><div class="sln-mini-h">'+lb+'</div>'
        + ks.map(function(k){ return '<div class="sln-mini-r"><span>'+esc(k)+'</span><b>'+m[k].n+'</b>'
            + '<i>'+(m[k].ng?('不合格 '+m[k].ng):'')+'</i></div>'; }).join('')
        + '</div>';
    }
    var h='<div class="sv-card"><div class="sv-card-h"><span><i data-ic=location data-ics=16></i> どこへ・いつ行ったか</span></div>'
      + '<div class="sln-minis">'
      + tally(function(t){ return t.office; }, '陸運局')
      + tally(function(t){ return t.round?(t.round+'R'):'R未定'; }, 'ラウンド')
      + tally(function(t){ return t.slot==='pm'?'午後':'午前'; }, '午前・午後')
      + '</div></div>';
    return h;
  }

  function ngListHtml(T){
    var ng=T.filter(function(t){return t.kind==='ng';});
    var h='<div class="sv-card"><div class="sv-card-h"><span><i data-ic=list data-ics=16></i> 不合格の明細</span>'
      +'<span class="sv-legend">押すとカードが開きます</span></div>';
    if(!ng.length) return h+'<div class="sv-empty">この月は落ちていません。</div></div>';
    h+='<table class="sv-table sln-nglist"><thead><tr><th>日</th><th>お客様</th><th>車</th><th>区分</th><th>回送</th><th>陸運局</th><th>R</th><th>落ちた所</th></tr></thead><tbody>';
    ng.forEach(function(t){
      h+='<tr onclick="openDetail(\''+t.c.id+'\')">'
        +'<td>'+fmd(t.iso)+' '+(t.slot==='pm'?'PM':'AM')+'</td>'
        +'<td class="sv-td-name">'+esc(surname(t.c))+'様</td>'
        +'<td>'+esc(carOf(t.c))+'</td>'
        +'<td><span class="sln-team '+(t.team==='import'?'imp':'')+'">'+teamLabel(t.team)+'</span></td>'
        +'<td>'+esc(staffOf(t.staff))+'</td>'
        +'<td>'+esc(t.office||'')+'</td>'
        +'<td>'+(t.round?t.round+'R':'')+'</td>'
        +'<td>'+(t.note?esc(t.note):'<span class="sln-nonote">（未記入）</span>')+'</td></tr>';
    });
    h+='</tbody></table></div>';
    return h;
  }

  /* ═══════════════════════════════════════════════════════════
     本体。⚠ 上のタブと月送りは作業サマリー（mech-summary.js）から渡してもらう
        ＝ 期間の出し方を2か所に書かない。
     ═══════════════════════════════════════════════════════════ */
  function renderShakenLine(wrap, topTabs, header, moS, moE, foot){
    var T=collect(moS, moE);
    var h=topTabs+header;
    if(!T.length){
      wrap.innerHTML = h + '<div class="sv-card"><div class="sv-empty">この期間に陸運局へ行った記録はありません。'
        + '<br>（予定は数えません。「完了」か「不合格」を記録すると、ここに出ます）</div></div>';
      return;
    }
    h+='<div class="sln-sec">全体</div>'      + heroHtml(T);
    h+='<div class="sln-sec">エラー</div>'    + errorHtml(T) + adviceHtml(T);
    h+='<div class="sln-sec">詳細</div>'      + staffHtml(T) + teamHtml(T) + whereHtml(T) + ngListHtml(T);
    h+='<div class="sv-foot">'+foot+'　数えているのは<b>実際に陸運局へ行った記録だけ</b>（予定は0件も入っていません）。'
      + '合格＝その月に締まった台／不合格＝落ちて自社に戻した回。1台が2回行けば入場は2回です。</div>';
    wrap.innerHTML=h;
  }
  window.renderShakenLine = renderShakenLine;
})();

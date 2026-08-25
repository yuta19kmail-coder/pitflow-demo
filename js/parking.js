/* ========================================
   parking.js  -  駐車場ビュー（3ティア・実効キャパ）／PitFlow v0.71.0
   ----------------------------------------
   受付MTG(2026-06-05)＋設計モック確定の思想：
   ・「明日の朝までに何台空けておくか」＝明日の預かり入庫＋バッファ（返車は当てにしない・待ちは数えない）。
   ・v0.86.0：受付タイプ2つ選択は「重い方」を採用＝預かり入り→預かり占有／当返入り→その日だけ駐車場を使う(+1・翌日繰り越し無し)。
   ・置ける所は3ティア：①自社内（ピット＋自社置き場）→②赤井・斉藤（歩いて行ける）→③コインパ（最後）。
   ・各置き場は「理論値（設定）＋現実の増減（理由を1行＝±1で、ここで入力）」＝実効キャパ。
   ・棒は総台数を下から自社→赤井斉→コインパで色分け＝どこに何台。線を超えた分＝移動必要。

   data: state.settings.parking = { tiers:[{key,name,note,lots:[{id,name,theo,reasons:[{s,t}]}]}], buffer:{weekday,weekend,afterHoliday}, dayMemos:{} }
   公開: window.renderParking() / window.ParkingView{summaryHtml, settingsCardHtml, mountSettings} / 各pk*操作
   ======================================== */
(function () {
  'use strict';

  /* ⚠ v1.15.1：置き場の名前は **設定として保存される文字**。ここにHTML（<i data-ic=…>）を書かないこと。
        書くと esc() を通って「タグが文字として」画面に出る（2026-08-02 の不具合）。
        印は絵文字で持ち、描く時に icoText() が線画アイコンへ読み替える。 */
  const DEFAULT = {
    tiers: [
      { key:'home', name:'① 自社内', note:'ピット＋自社置き場。一番使いたいエリア。',
        lots:[ {id:'pit', name:'🔧 ピット内', theo:4, reasons:[]}, {id:'jisha', name:'🏠 自社置き場（福田P含む）', theo:14, reasons:[]} ] },
      { key:'akai', name:'② 歩いて行ける', note:'赤井・斉藤P。徒歩圏だが敷地外。移動はまずここが優先。',
        lots:[ {id:'akai', name:'👤 赤井・斉藤P', theo:6, reasons:[]} ] },
      { key:'coin', name:'③ コインパ（最後）', note:'第二P。①②で収まらない時だけ。ここを最小にしたい。',
        lots:[ {id:'coin', name:'🅿️ 第二P（コインパ）', theo:10, reasons:[]} ] }
    ],
    buffer: { weekday:1, weekend:2, afterHoliday:3 },
    dayMemos: {}
  };

  function cfg(){
    if(!state.settings) state.settings={};
    const p=state.settings.parking;
    if(!p || !Array.isArray(p.tiers) || !p.buffer){ state.settings.parking=JSON.parse(JSON.stringify(DEFAULT)); }
    if(!state.settings.parking.dayMemos) state.settings.parking.dayMemos={};
    return state.settings.parking;
  }
  function save(){ try{ if(window.PitDB) PitDB.save(); }catch(e){} }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  /* v1.15.1：保存されている名前を描く時はこちら。esc したうえで、絵文字と
     （古い保存に混ざってしまった）<i data-ic=…> を線画アイコンに読み替える。 */
  function escI(s){ return window.icoText ? icoText(s) : esc(s); }

  // ---- 日付ヘルパ（自己完結） ----
  function ymd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function pd(s){ const p=String(s).split('-'); return new Date(+p[0],(+p[1])-1,+p[2]); }
  function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  // v0.86.0 受付タイプを2つ選んだ時は「重い方」を採用（預かり>当返>待ち）。預かり入り=預かり扱い／当返入り=当日使用。
  function eff(c){ return (window.pitDropEffective ? pitDropEffective(c) : (c && c.dropType)); }
  function occEnd(c){
    if(c.returnDate) return c.returnDate;
    const est=(c.estHoldDays!=null&&c.estHoldDays!=='')?c.estHoldDays:(window.pitEstHold?pitEstHold(c.workType,eff(c),window.pitTeamKey?pitTeamKey(c):'default'):3);
    return ymd(addDays(pd(c.reserveDate), est));
  }
  // 預かり(占有)＝実効受付タイプが drop・廃車除く・予約日あり（「待or預」「当or預」など預かり入りも含む）
  function isOccupy(c){ return c && eff(c)==='drop' && c.reserveDate && c.status!=='scrap'; }
  /* 🚫 v1.50.0 休みは MHS の定休日カレンダー（PitCal）が基準。曜日だけの判定はしない。 */
  function isClosed(dDate){ return window.PitCal ? PitCal.isClosed(ymd(dDate)) : false; }
  function bufferOf(dDate){
    const bf=cfg().buffer;
    if(isClosed(dDate)) return 0;
    if(isClosed(addDays(dDate,-1))) return (bf.afterHoliday!=null?bf.afterHoliday:3);
    const dow=dDate.getDay();
    if(dow===0||dow===6) return (bf.weekend!=null?bf.weekend:2);
    return (bf.weekday!=null?bf.weekday:1);
  }
  function carryN(ds){ return (state.cards||[]).filter(function(c){ return isOccupy(c) && c.reserveDate < ds && occEnd(c) >= ds; }).length; }
  function intakeN(ds){ return (state.cards||[]).filter(function(c){ return isOccupy(c) && c.reserveDate === ds; }).length; }
  function retN(ds){ return (state.cards||[]).filter(function(c){ return eff(c)==='drop' && c.status!=='scrap' && c.returnDate === ds; }).length; }
  // v0.86.0 当返（実効=sameDay）は入庫日その日だけ駐車場を使う＝当日に+1（翌日には繰り越さない）
  function sameDayN(ds){ return (state.cards||[]).filter(function(c){ return eff(c)==='sameDay' && c.status!=='scrap' && c.reserveDate === ds; }).length; }
  function totalOf(ds, dDate){ return carryN(ds)+intakeN(ds)+sameDayN(ds)+bufferOf(dDate)-retN(ds); }

  // ---- ティア実効 ----
  function lotEff(l){ return Math.max(0, (l.theo||0) + (l.reasons||[]).reduce(function(s,r){return s+(r.s||0);},0)); }
  function tierEff(t){ return (t.lots||[]).reduce(function(s,l){return s+lotEff(l);},0); }
  function caps(){ const t=cfg().tiers; const C1=tierEff(t[0]),C2=tierEff(t[1]),C3=tierEff(t[2]); return {C1:C1,C2:C2,C3:C3,F1:C1,F12:C1+C2,FULL:C1+C2+C3}; }
  function dist(total){ const c=caps(); return { home:Math.min(total,c.F1), akai:Math.max(0,Math.min(total,c.F12)-c.F1), coin:Math.max(0,Math.min(total,c.FULL)-c.F12), over:Math.max(0,total-c.FULL), total:total, c:c }; }

  // 次の営業日（today含めず）
  function nextOpen(from){ let d=addDays(from,1); for(let i=0;i<14;i++){ if(!isClosed(d)) return d; d=addDays(d,1); } return addDays(from,1); }

  // 14日ぶんの配列
  function days14(){
    const t=new Date(); t.setHours(0,0,0,0);
    const out=[];
    for(let i=0;i<14;i++){ const d=addDays(t,i); out.push({date:d, ds:ymd(d), closed:isClosed(d), today:i===0}); }
    return out;
  }

  let _sel=null; // 選択中の日 ds

  // =========================================
  // ダッシュボード用サマリー（1ブロック）
  // =========================================
  function summaryHtml(){
    const t=new Date(); t.setHours(0,0,0,0);
    const tm=nextOpen(t); const tms=ymd(tm);
    const need=intakeN(tms)+bufferOf(tm);
    const D=dist(totalOf(tms,tm));
    const md=(tm.getMonth()+1)+'/'+tm.getDate();
    const danger = (D.coin>0 || D.over>0);
    const big = D.over>0 ? ('超過+'+D.over) : (D.coin>0 ? ('コインパ+'+D.coin) : (D.akai>0 ? ('赤井斉+'+D.akai) : 'OK'));
    const col = D.over>0 ? '#ef4444' : (D.coin>0 ? '#f97316' : (D.akai>0 ? '#f59e0b' : '#1db97a'));
    return '<div class="dash-park-sum" onclick="showView(\'parking\')">'
      + '<span class="dps-ic"><i data-ic=parking data-ics=16></i></span>'
      + '<div class="dps-m"><div class="dps-t">次の営業日 '+md+' までに空けておく</div><div class="dps-v">'+need+'台必要 ／ 赤井斉へ '+D.akai+' ・ コインパへ '+D.coin+(D.over>0?' ・ <b style="color:#ff7a7a">超過'+D.over+'</b>':'')+'</div></div>'
      + '<span class="dps-big" style="color:'+col+'">'+big+'</span>'
      + '<span class="dps-go">駐車場 →</span></div>';
  }

  // =========================================
  // 駐車場ビュー本体
  // =========================================
  function renderParking(){
    const wrap=document.getElementById('view-parking-body'); if(!wrap) return;
    const c=caps();
    const list=days14();
    if(!_sel){ const tm=nextOpen(new Date()); _sel = ymd(new Date(tm.getFullYear(),tm.getMonth(),tm.getDate())); }
    // hero（次の営業日）
    const t=new Date(); t.setHours(0,0,0,0); const tm=nextOpen(t); const tms=ymd(tm);
    const need=intakeN(tms)+bufferOf(tm); const Dh=dist(totalOf(tms,tm));
    const heroMd=(tm.getMonth()+1)+'/'+tm.getDate()+'('+'日月火水木金土'[tm.getDay()]+')';

    let h='';
    // hero
    h+='<div class="pk-hero">'
      +'<div class="pk-hero-big"><div class="pk-lbl">'+heroMd+' までに<br>空けておく台数</div><div class="pk-num">'+need+'<small>台</small></div></div>'
      +'<div class="pk-hero-calc">'
      +'<div class="pk-cr">'+heroMd+'の<b>預かり入庫 '+intakeN(tms)+'台</b> ＋ <b>バッファ '+bufferOf(tm)+'台</b> ＝ <b>'+need+'台</b></div>'
      +'<div class="pk-cr" style="font-size:12px;color:var(--text3)">※ 将来の返車は当てにしない／待ち・当日仕上げは数えない（当日返車だけ空き候補）</div>'
      +'<div class="pk-cr">完全自社で入りきらない分は <span class="pk-verdict"><i data-ic=user data-ics=16></i>赤井・斉藤へ '+Dh.akai+'台 ／ <i data-ic=parking data-ics=16></i>コインパへ '+Dh.coin+'台'+(Dh.over>0?' ／ <i data-ic=warn data-ics=16></i>超過 '+Dh.over+'台':'')+'</span></div>'
      +'</div></div>';

    // グラフ
    h+='<div class="pk-card"><div class="pk-cardh"><i data-ic=chart data-ics=16></i> これから2週間（停まる場所を色で）<span class="pk-sub">日をクリックで内訳＆メモ</span></div>';
    h+='<div class="pk-legend"><span><i class="sw-home"></i>自社内</span><span><i class="sw-akai"></i>赤井・斉藤</span><span><i class="sw-coin"></i>コインパ</span><span><i class="sw-over"></i>超過</span><span class="mini">┈ 線＝各ティア上限</span></div>';
    h+='<div class="pk-gscroll"><div class="pk-ginner">'+graphBars(list,c)+graphX(list)+'</div></div>';
    h+='<div class="pk-detail" id="pk-detail">'+detailHtml()+'</div>';
    h+='<div class="pk-hint">バッファ（平日+1／土日+2／休み明け+3）と各置き場の理論値は <a href="javascript:showView(\'settings\')" style="color:var(--brand);font-weight:700"><i data-ic=settings data-ics=16></i> 設定</a>。予想は概算（預かり想定日数ベース）。</div>';
    h+='</div>';

    // 実効キャパ（3ティア・±理由）
    h+='<div class="pk-card"><div class="pk-cardh"><i data-ic=parking data-ics=16></i> 今の置き場（実効キャパ・3ティア）<span class="pk-sub">①'+c.C1+' → ②+'+caps().C2+'='+c.F12+' → ③+'+c.C3+'=<b>'+c.FULL+'</b>台。理論値は<i data-ic=settings data-ics=16></i>設定、理由はここで</span></div>';
    h+='<div class="pk-tiers">'+tiersHtml()+'</div></div>';

    // 明日入庫の内訳
    h+='<div class="pk-card"><div class="pk-cardh"><i data-ic=clipboard data-ics=16></i> '+heroMd+' の「預かり入庫」内訳<span class="pk-sub">この台数が数字の理由（クリックでカード）</span></div>'+intakeBrkHtml(tms)+'</div>';

    // 解説
    h+=explHtml();

    wrap.innerHTML=h;
  }

  function graphBars(list, c){
    const H=300;
    let maxV=c.FULL; list.forEach(function(x){ if(!x.closed) maxV=Math.max(maxV, totalOf(x.ds,x.date)); }); maxV+=2;
    const px=function(v){ return Math.round(Math.max(0,v)/maxV*H); };
    let h='<div class="pk-bars">';
    // 線
    h+='<div class="pk-tline l1" style="bottom:'+px(c.F1)+'px"><span class="pk-tlbl">自社'+c.F1+'</span></div>';
    h+='<div class="pk-tline l2" style="bottom:'+px(c.F12)+'px"><span class="pk-tlbl">赤井'+c.F12+'</span></div>';
    h+='<div class="pk-tline l3" style="bottom:'+px(c.FULL)+'px"><span class="pk-tlbl">満'+c.FULL+'</span></div>';
    list.forEach(function(x){
      if(x.closed){ h+='<div class="pk-bar"></div>'; return; }
      const total=totalOf(x.ds,x.date), D=dist(total), totalPx=px(total);
      let tc, tt;
      if(D.over>0){ tc='over'; tt='<i data-ic=warn data-ics=16></i>超過<br>'+D.over+'台'; }
      else if(D.coin>0){ tc='coin'; tt='<i data-ic=parking data-ics=16></i>コインパ<br>'+D.coin+'台'; }
      else if(D.akai>0){ tc='akai'; tt='<i data-ic=user data-ics=16></i>赤井斉<br>'+D.akai+'台'; }
      else { tc='ok'; tt='自社OK<br>空'+(c.F1-total); }
      const segs=[['over',D.over],['coin',D.coin],['akai',D.akai],['home',D.home]];
      let stack='<div class="pk-stack">'; let first=true;
      segs.forEach(function(s){ if(s[1]>0){ stack+='<div class="pk-seg '+s[0]+(first?' topseg':'')+'" style="height:'+px(s[1])+'px"></div>'; first=false; } });
      stack+='</div>';
      h+='<div class="pk-bar" onclick="pkSel(\''+x.ds+'\')"><div class="pk-top '+tc+'" style="bottom:'+(totalPx+4)+'px">'+tt+'</div>'+stack+'</div>';
    });
    h+='</div>';
    return h;
  }
  function graphX(list){
    let h='<div class="pk-xrow">';
    list.forEach(function(x){
      const wcls=x.date.getDay()===6?'sat':(x.date.getDay()===0?'sun':'');
      const memo=(cfg().dayMemos[x.ds]||'').trim();
      const dot=memo?' <span class="pk-memodot"><i data-ic=pencil data-ics=16></i></span>':'';
      h+='<div class="pk-px'+(x.today?' today':'')+(x.ds===_sel?' sel':'')+(x.closed?' off':'')+'" onclick="pkSel(\''+x.ds+'\')">'
        +'<div class="pk-d">'+(x.date.getMonth()+1)+'/'+x.date.getDate()+dot+'</div>'
        +'<div class="pk-w '+wcls+'">'+'日月火水木金土'[x.date.getDay()]+'</div></div>';
    });
    h+='</div>';
    return h;
  }
  function detailHtml(){
    const ds=_sel; const d=pd(ds);
    if(isClosed(d)) return '<h4><i data-ic=pin data-ics=16></i> '+(d.getMonth()+1)+'/'+d.getDate()+' は定休</h4>';
    const total=totalOf(ds,d), D=dist(total);
    let pills='<span class="pk-dpill home"><i data-ic=dot data-ics=12 style=color:#22c55e></i>自社 '+D.home+'</span>';
    if(D.akai>0) pills+='<span class="pk-dpill akai"><i data-ic=dot data-ics=12 style=color:#f97316></i>赤井・斉藤 '+D.akai+'</span>';
    if(D.coin>0) pills+='<span class="pk-dpill coin"><i data-ic=dot data-ics=12 style=color:#f97316></i>コインパ '+D.coin+'</span>';
    if(D.over>0) pills+='<span class="pk-dpill over"><i data-ic=dot data-ics=12 style=color:#ef4444></i>超過 '+D.over+'</span>';
    const memo=cfg().dayMemos[ds]||'';
    return '<h4><i data-ic=pin data-ics=16></i> '+(d.getMonth()+1)+'/'+d.getDate()+'('+'日月火水木金土'[d.getDay()]+') の内訳</h4>'
      +'<div class="pk-eq">前日まで預かり <b>'+carryN(ds)+'</b> ＋ 当日入庫 <b>'+intakeN(ds)+'</b> ＋ バッファ <b>'+bufferOf(d)+'</b> − 当日返車 <b>'+retN(ds)+'</b> ＝ <b style="font-size:17px">総 '+total+'台</b></div>'
      +'<div class="pk-dist">'+pills+'</div>'
      +'<div class="pk-memo"><label><i data-ic=pencil data-ics=16></i> この日のメモ（イレギュラー・特記）</label><textarea onchange="pkMemo(\''+ds+'\',this.value)" placeholder="例）車販2台仕入れ／飛び込み多め／第二Pに1台移動">'+esc(memo)+'</textarea></div>';
  }
  function tiersHtml(){
    let h='';
    cfg().tiers.forEach(function(t,ti){
      const tc=t.key==='home'?'t1':(t.key==='akai'?'t2':'t3');
      const col=t.key==='home'?'var(--home)':(t.key==='akai'?'var(--akai)':'var(--coin)');
      h+='<div class="pk-tier '+tc+'"><div class="pk-tierh"><span>'+escI(t.name)+'</span><span class="pk-eff" style="color:'+col+'">'+tierEff(t)+'台</span></div><div class="pk-tiernote">'+esc(t.note||'')+'</div>';
      t.lots.forEach(function(l,li){
        const adj=(l.reasons||[]).reduce(function(s,r){return s+(r.s||0);},0), eff=lotEff(l);
        let adjs=''; if(adj<0) adjs=' <span class="am">'+adj+'</span>'; else if(adj>0) adjs=' <span class="ap">+'+adj+'</span>';
        h+='<div class="pk-lot"><div class="pk-lottop"><span class="pk-lotnm">'+escI(l.name)+'</span><span class="pk-loteff">理論'+l.theo+adjs+' → 実効 <b>'+eff+'</b></span></div><div class="pk-reasons">';
        if(!(l.reasons||[]).length) h+='<span class="pk-noreason">理由なし（実効＝理論）</span>';
        (l.reasons||[]).forEach(function(r,ri){
          const sc=r.s<0?'minus':'plus', sl=r.s<0?'−1':'+1';
          h+='<div class="pk-rrow"><button class="pk-sgn '+sc+'" onclick="pkFlipR('+ti+','+li+','+ri+')">'+sl+'</button><input value="'+esc(r.t||'')+'" placeholder="理由" onchange="pkEditR('+ti+','+li+','+ri+',this.value)"><button class="pk-del" onclick="pkDelR('+ti+','+li+','+ri+')">×</button></div>';
        });
        h+='<div class="pk-addrs"><button class="pk-addr minus" onclick="pkAddR('+ti+','+li+',-1)">− 停められない</button><button class="pk-addr plus" onclick="pkAddR('+ti+','+li+',1)">＋ 臨時で増</button></div>';
        h+='</div></div>';
      });
      h+='</div>';
    });
    return h;
  }
  function intakeBrkHtml(ds){
    const cards=(state.cards||[]).filter(function(c){ return isOccupy(c) && c.reserveDate===ds; });
    if(!cards.length) return '<div class="pk-noreason" style="padding:8px">この日の預かり入庫はありません。</div>';
    let h='<div class="pk-brk">';
    cards.forEach(function(c){
      /* 🔧 v2.9.7 作業タイプの拾い方は `pit-share.js` の `pitCardWorkTypes` 1本。
         ⚠ 昔は `c.workType`（基本）だけを見ていたので、B.P だけの車が「—」になっていた。 */
      const _wts=(window.pitCardWorkTypes?pitCardWorkTypes(c):[]);
      const wt=_wts[0]||null;
      const wl=_wts.length?_wts.map(function(x){return x.label;}).join('＋'):'—';
      const wc=wt?wt.color:'#64748b';
      const loa=c.needLoaner?'<span class="pk-lo"><i data-ic=van data-ics=16></i>代車</span>':'';
      h+='<div class="pk-brkrow" onclick="openDetail(\''+c.id+'\')"><span class="pk-wt" style="background:'+wc+'">'+esc(wl)+'</span><span class="pk-nm">'+esc((window.pitCustName?pitCustName(c):c.customer)||'（未入力）')+' 様</span><span class="pk-meta">'+esc(c.car||'')+(c.plate?' ・ '+esc(c.plate):'')+'</span>'+loa+'</div>';
    });
    h+='</div>';
    return h;
  }
  function explHtml(){
    return '<div class="pk-card pk-expl"><div class="pk-cardh"><i data-ic=calculator data-ics=16></i> この画面の数字の出し方</div>'
      +'<div class="pk-er"><span class="pk-tag">置ける台数（3ティア）</span>＝ ①自社内→②赤井・斉藤→③コインパ。各ティアは「理論値 ＋ 理由（−1／+1）」。</div>'
      +'<div class="pk-er"><span class="pk-tag">その日の総台数</span>＝ 前日までの預かり ＋ 当日入庫 ＋ バッファ − 当日返車（空き候補）。棒はこれを下から自社→赤井斉→コインパで色積み。</div>'
      +'<div class="pk-er" style="font-size:12px;color:var(--text3)">・待ち／当日仕上げは数えない。将来の返車は当てにしない（当日返車だけ空き候補）。バッファ＝平日+1／土日+2／休み明け+3。</div>'
      +'<div class="pk-eq">赤井・斉藤へ ＝ 総 − ①　／　コインパへ ＝ 総 −（①＋②）　／　超過 ＝ 総 −（①＋②＋③）</div></div>';
  }

  // ---- 操作 ----
  window.pkSel=function(ds){ _sel=ds; const box=document.getElementById('pk-detail'); if(box) box.innerHTML=detailHtml(); document.querySelectorAll('.pk-px').forEach(function(){}); renderParking(); };
  window.pkMemo=function(ds,v){ cfg().dayMemos[ds]=v; save(); };
  window.pkAddR=function(ti,li,s){ cfg().tiers[ti].lots[li].reasons.push({s:s,t:''}); save(); renderParking(); };
  window.pkDelR=function(ti,li,ri){ cfg().tiers[ti].lots[li].reasons.splice(ri,1); save(); renderParking(); };
  window.pkFlipR=function(ti,li,ri){ const r=cfg().tiers[ti].lots[li].reasons[ri]; r.s=-r.s; save(); renderParking(); };
  window.pkEditR=function(ti,li,ri,v){ cfg().tiers[ti].lots[li].reasons[ri].t=v; save(); };

  // =========================================
  // 設定（理論値＋バッファ）
  // =========================================
  function settingsCardHtml(){
    return '<div class="ps-card"><div class="ps-h"><i data-ic=parking data-ics=16></i> 駐車場（置き場の理論値・バッファ）</div>'
      +'<div class="ps-desc">駐車場ビューの基準。各置き場の<b>理論値（普段停められる台数）</b>と、空けておく<b>バッファ</b>を設定します。日々の増減（エンジン置場・車販在庫など）は駐車場ビューで入力します。</div>'
      +'<div id="pk-settings"></div></div>';
  }
  function mountSettings(){
    const box=document.getElementById('pk-settings'); if(!box) return;
    const c=cfg(); let h='';
    c.tiers.forEach(function(t,ti){
      h+='<div class="pk-set-tier"><div class="pk-set-th">'+escI(t.name)+'</div>';
      t.lots.forEach(function(l,li){
        h+='<label class="pk-set-lot"><span>'+escI(l.name)+'</span><input type="number" min="0" max="99" value="'+(l.theo||0)+'" onchange="pkSetTheo('+ti+','+li+',this.value)"><span class="u">台</span></label>';
      });
      h+='</div>';
    });
    h+='<div class="pk-set-th" style="margin-top:10px">バッファ（朝までに余分に空けておく）</div><div class="pk-set-buf">';
    h+='<label>平日 <input type="number" min="0" max="9" value="'+c.buffer.weekday+'" onchange="pkSetBuf(\'weekday\',this.value)">台</label>';
    h+='<label>土日 <input type="number" min="0" max="9" value="'+c.buffer.weekend+'" onchange="pkSetBuf(\'weekend\',this.value)">台</label>';
    h+='<label>休み明け <input type="number" min="0" max="9" value="'+c.buffer.afterHoliday+'" onchange="pkSetBuf(\'afterHoliday\',this.value)">台</label>';
    h+='</div>';
    box.innerHTML=h;
  }
  window.pkSetTheo=function(ti,li,v){ cfg().tiers[ti].lots[li].theo=Math.max(0,parseInt(v,10)||0); save(); };
  window.pkSetBuf=function(k,v){ cfg().buffer[k]=Math.max(0,parseInt(v,10)||0); save(); };

  window.renderParking=renderParking;
  window.ParkingView={ summaryHtml:summaryHtml, settingsCardHtml:settingsCardHtml, mountSettings:mountSettings };
  console.log('[parking] ready');
})();

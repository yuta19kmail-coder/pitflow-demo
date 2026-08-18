/* ========================================
   shaken.js  -  車検予定（整備の俯瞰）/ PitFlow v1.121.0
   ・上＝決定カレンダー（各日を<i data-ic=sunrise data-ics=16></i>午前｜<i data-ic=sunrise data-ics=16></i>午後に縦割り／予定決定・完了・再検）
   ・下＝可能性ガント（行＝車、帯＝「行ける枠」＝予約詳細 inspSchedule.slots）
   ・🔴 v1.118.0 予定（候補）の枠＝**押して入れる／押して外す**（ドラッグの範囲塗りは廃止）。
   ・🔴 v1.118.0 決定への移動＝**ドラッグだけ**。帯を押しても決定しない（押し間違いで陸運局の日が変わらないように）。
   ・決定チップのタップで完了/再検/取消。決定チップを「予定」へドロップで候補に戻す。
   ・配車（誰が運ぶ）は扱わない＝MHSの領分。ここは整備が段取りを目で見る場所。
   フィールド：inspSchedule.slots{iso:['am','pm']}（候補）/ decided+decidedSlot / result 'done'+resultSlot / history[{date,slot,result:'recheck'}]
   ======================================== */
(function(){
  'use strict';
  var DOW='日月火水木金土', DAYS=12;
  function ymdL(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  /* 🔴 v1.108.0 名前・色・車名・車検の判定は **pit-share.js の物差し1本**（MHS・LINEの画像と同じ答え）。
     ⚠ ここに書き戻さないこと。以前ここだけ独自だったせいで、
        ・カナだけのお客様が「（未入力）」になる（Todayボードでは 8/15 に直したのに車検だけ残っていた）
        ・課の色を「輸入車ならピンク」と**車から逆算**していた（8/16 に他画面から追放したやり方） */
  function surname(c){ return (window.pitCustSurname?pitCustSurname(c):(c.customer||''))||'（未入力）'; }
  function team(c){ return window.pitDivisionColor?pitDivisionColor(c):'#1db97a'; }
  function carLabel(c){ return window.pitCarLabel?pitCarLabel(c):((c.car||c.maker||c.plate||'').toString()); }
  function isShaken(c){ return window.pitIsShaken?pitIsShaken(c):false; }
  function ins(c){ if(!c.inspSchedule||typeof c.inspSchedule!=='object') c.inspSchedule={mode:'manual',slots:{},cutBefore:''}; if(!c.inspSchedule.slots) c.inspSchedule.slots={}; if(!Array.isArray(c.inspSchedule.history)) c.inspSchedule.history=[]; return c.inspSchedule; }
  /* 🔴 v1.108.0 廃車だけでなく **予約キャンセル・売上なしでアーカイブ** も外す（pitCardActive 1本）。
     ⚠ 車検だけキャンセルを素通りさせていて、キャンセルした予約が予定に残っていた。 */
  function shakenCars(){ return (state.cards||[]).filter(function(c){ return c && isShaken(c) && (window.pitCardActive?pitCardActive(c):c.status!=='scrap'); }); }
  function card(id){ return (state.cards||[]).find(function(c){ return c.id===id; }); }
  function save(){ if(window.PitDB) PitDB.save(); }
  function todayIso(){ var t=new Date(); t.setHours(0,0,0,0); return ymdL(t); }
  /* 🚫 v1.50.0 自社の休みは MHS の定休日カレンダー（PitCal）が基準＝臨時休業・お盆も休みになる */
  function shopClosed(iso){ return window.PitCal ? PitCal.isClosed(iso) : false; }
  function shopNote(iso){ return window.PitCal ? PitCal.label(iso) : ''; }
  function isOff(iso){ var w=new Date(iso+'T00:00:00').getDay(); if(w===0||w===6) return true; if(window.Holidays&&Holidays.is&&Holidays.is(iso)) return true; if(shopClosed(iso)) return true; return false; }
  function offLabel(iso){ var w=new Date(iso+'T00:00:00').getDay(); if(w!==0&&w!==6&&!(window.Holidays&&Holidays.is&&Holidays.is(iso))&&shopClosed(iso)) return shopNote(iso)||'定休'; return '休'; }
  function fmtMD(iso){ var d=new Date(iso+'T00:00:00'); return (d.getMonth()+1)+'/'+d.getDate(); }
  /* 🔴 v1.116.0 入庫待ちの日付は**曜日つき**で出す（ゆうた指定「8/22入 → 8/22(土)」）。
     ⚠ 土日が休みなので、曜日が見えないと「土曜に入庫？」の勘違いが起きる。 */
  function fmtMDW(iso){ var d=new Date(iso+'T00:00:00'); return (d.getMonth()+1)+'/'+d.getDate()+'('+DOW[d.getDay()]+')'; }
  function addDays(iso,n){ var d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return ymdL(d); }

  /* 🔴 v1.116.0 車の注意＝**ガントの行と入庫待ちの箱で同じ言葉**を使う（ゆうた指定）。
     ⚠ 陸運局へ誰が持って行けるかに効くので、入庫前から見えている必要がある。
     🔴 v1.121.0（ゆうた指定「MT等の車両注意は他のカードと同じ黄色ベースの物で」）
        ・**言い方は pit-share.js の `pitCarCautions` 1本**＝予約カードの耳の注意タブとまったく同じ
          （左とM/Tが両方なら「左M/T」に合体・車高・土禁も出る・多くても3つ）。ここで書き直さない。
        ・色も**塗りアンバー**に揃える（CSS の `.shk-ca.cau`）。
     ⚠ **12点は車両注意ではない**（やる作業の種類）ので、今までどおり地味な灰色のまま分けて出す。 */
  function carCautions(c){ return window.pitCarCautions ? pitCarCautions(c) : []; }
  function carOthers(c){
    var out=[], ids=(Array.isArray(c.workTypes)&&c.workTypes.length)?c.workTypes:[];
    if(ids.indexOf('12pt')>=0) out.push('12点');
    return out;
  }
  /* チップ用の小さいバッジ。注意はアンバー、それ以外は灰色。 */
  function attrChips(c){
    return carCautions(c).map(function(x){ return '<span class="shk-ca cau">'+esc(x)+'</span>'; }).join('')
         + carOthers(c).map(function(x){ return '<span class="shk-ca">'+esc(x)+'</span>'; }).join('');
  }

  function rangeDays(){
    if(!window._shakenBase){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7)); window._shakenBase=t; } // 週の月曜
    var base=new Date(window._shakenBase); base.setHours(0,0,0,0);
    var out=[]; for(var i=0;i<DAYS;i++){ var d=new Date(base); d.setDate(base.getDate()+i); out.push({iso:ymdL(d),date:d,w:d.getDay(),off:isOff(ymdL(d))}); }
    return out;
  }

  /* 🔴 v1.115.0 いまこの車がどこにいるか＝**3つに分ける**（2026-08-18 ゆうた「未入庫の予定が動いてない」）
       'waiting' … まだ来ていない（予約中）→ 上の「入庫待ちの予約」の帯に出す
       'here'    … いま店にいる（入庫中〜完TEL待ち）→ 予定が無ければ「未設定」の空行
       'gone'    … もう帰った・廃車 → **この盤には出さない**（終わった車だから）
     ⚠ 前は「入庫済みか」の1本しか見ておらず、**返車済みが「まだ来ていない側」に落ちていた**。
        帰った車は入庫日が必ず過去なので、下の「〜◯/◯まで」の網に必ず引っかかる。
        結果、**何ヶ月も前に終わった車が帯に並びっぱなし**になっていた（本番相当の中身で75台中51台）。
        ＝いつ見ても同じ顔ぶれ＝「動いていない」ように見えていた正体。
     ⚠ 済・再検は下の「決定」バンドが別に拾う（pitShakenOnDate）ので、帰った車の実績は消えない。 */
  function whereIs(c){
    if(c.status==='reserved') return 'waiting';
    if(c.status==='returned' || c.status==='scrap') return 'gone';
    return 'here';
  }
  /* 🔴 v1.108.0 **その日にどの車が並ぶか（決定バンド）は pitShakenOnDate 1本**で決める。
     ＝ MHS の当日ビューと前日LINEの画像と、台数も並びも中身も**必ず同じ**になる。
     ⚠ ここで条件を書き直さないこと。候補（まだ決めていない枠）と未設定・未入庫だけ、この画面固有。 */
  function collect(days){
    var decCell={};
    (days||[]).forEach(function(d){
      var rows = window.pitShakenOnDate ? pitShakenOnDate(state.cards||[], d.iso) : [];
      rows.forEach(function(r){ var k=d.iso+'|'+r.slot; (decCell[k]=decCell[k]||[]).push({c:r.card,kind:r.state,row:r}); });
    });
    var cands=[], empties=[], unsched=[], cnt={decided:0,done:0,recheck:0,cand:0,unset:0};
    shakenCars().forEach(function(c){ var s=ins(c);
      (s.history||[]).forEach(function(h){ if(h&&h.result==='recheck'&&h.date){ cnt.recheck++; } });
      if(s.result==='done'){ cnt.done++; return; }
      if(s.decided){ cnt.decided++; return; }
      var pos=whereIs(c);
      /* 🔴 v1.115.0 もう帰った車は「これからやること」の3つ（候補・未設定・入庫待ち）に入れない。
         ⚠ 上の 完了・再検・決定 の数は**帰った車も数える**（起きた事実だから）。ここだけ外す。 */
      if(pos==='gone') return;
      var slotDays=Object.keys(s.slots||{}).filter(function(k){ return (s.slots[k]||[]).length; });
      if(slotDays.length){ cnt.cand++; cands.push(c); return; }
      if(pos==='here'){ cnt.unset++; empties.push(c); return; }   // 店にいて予定なし＝未設定→予定欄に空行
      unsched.push(c);                                            // まだ来ていない予約で予定なし→上の帯
    });
    return {decCell:decCell, cands:cands, empties:empties, unsched:unsched, cnt:cnt};
  }

  /* 🔴🔴 v1.116.0 入庫待ちの予約を **3つの箱**に分ける（2026-08-18・ゆうた指定）
       ① 今週入庫分   … **今週の金曜まで**
       ② 来週入庫分   … 土曜 〜 翌週の金曜
       ③ 再来週入庫分 … その次の土曜 〜 金曜
     🔴 週の区切りは **土曜はじまり・金曜おわり**（ゆうた指定）。土日が休みなので、
        金曜で締めて土曜から次の週、と数えるほうが現場の感覚と合う。
     🔴 数える起点は **今日**。カレンダーを前週・次週に送っても、この3つは動かない。
        ⚠「今週」「来週」は**今日から見た言葉**なので、めくると意味が変わってしまうため。
     ⚠ 入庫日が**過ぎているもの**（仮予約・承認待ちは自動で未入庫に落ちない）と
        **入庫日未定**のものは、いちばん手前の「今週入庫分」に入れる＝目に入る場所に置く。
     ⚠ 再来週より先の予約は**出さない**（今までどおり。先を全部並べると帯が意味を失う）。 */
  function waitGroups(list){
    var t=todayIso(), dow=new Date(t+'T00:00:00').getDay();
    var f1=addDays(t,(5-dow+7)%7), f2=addDays(f1,7), f3=addDays(f1,14);   /* 各週の金曜 */
    var g=[
      {key:'w0', title:'今週入庫分',   range:'〜'+fmtMDW(f1),                        cars:[]},
      {key:'w1', title:'来週入庫分',   range:fmtMDW(addDays(f1,1))+' 〜 '+fmtMDW(f2), cars:[]},
      {key:'w2', title:'再来週入庫分', range:fmtMDW(addDays(f2,1))+' 〜 '+fmtMDW(f3), cars:[]}
    ];
    (list||[]).forEach(function(c){
      var d=c.reserveDate||'';
      if(!d || d<=f1) g[0].cars.push(c);
      else if(d<=f2)  g[1].cars.push(c);
      else if(d<=f3)  g[2].cars.push(c);
    });
    /* それぞれ入庫日順（ゆうた指定）。入庫日未定はいちばん後ろ。同じ日は名前順で毎回同じ並びにする。 */
    g.forEach(function(x){ x.cars.sort(function(a,b){
      var da=a.reserveDate||'9999-99-99', db=b.reserveDate||'9999-99-99';
      if(da!==db) return da<db ? -1 : 1;
      return String(surname(a)).localeCompare(String(surname(b)),'ja');
    }); });
    return g;
  }

  /* ══ 回送の担当・陸運局・R（v1.119.0・2026-08-18 ゆうた指定） ══
     🔴 担当者＝**実際に車検へ行く＝回送する人**（ゆうた「担当者というのは実際に車検に行く、回送の担当者ね」）。
        入れ物は今までの「陸運局へ行った人」と**同じ1つ**（ゆうた確定）。
        ＝決めた時点で入れると、**MHS の当日ビューと前日LINEの画像にも前もって名前が出る**。
     🔴 陸運局は **CoreMembers の場所マスターで「陸運局」のバッジが付いたもの**から選ぶ。
        PitFlow では作れない・直せない（読むだけ）。窓口は members-pit.js の1本。
     🔴 R＝ラウンド 1〜4。空でも決定できる（ゆうた確定）が、**空なら「未定」の印を出す**。
     ⚠ 中身の読み出しは pit-share.js の物差し（pitShakenStaff / pitShakenOffice / pitShakenRound）。
        ここで条件を書き直さないこと。 */
  function shStaff(c){ return window.pitShakenStaff ? pitShakenStaff(c) : ((c.inspSchedule||{}).resultStaff||''); }
  function shOffice(c){ return window.pitShakenOffice ? pitShakenOffice(c) : ((c.inspSchedule||{}).officeName||''); }
  function shRound(c){ return window.pitShakenRound ? pitShakenRound(c) : 0; }
  function rikuunList(){ return window.pitRikuunList ? pitRikuunList() : []; }

  /* チップの下に付ける拡張（ゆうた指定「決定した車両カードの下などに拡張で付けたい」）。
     ⚠ 「未定」の印を出すのは**これから行く車（決定）だけ**。済・再検は終わった話なので、
        入っているものだけ静かに出す（終わった車に「未定」と出しても直しようがない）。 */
  function chipMeta(c, kind){
    var st=shStaff(c), of=shOffice(c), rd=shRound(c), todo=(kind==='decided'), h='';
    /* ⚠ チップは幅が狭い（1枠118px）ので名前は切れる。切れても分かるように吹き出しに全部入れる。 */
    if(st)      h+='<span class="shk-mt st" title="回送の担当：'+esc(st)+'">'+esc(st)+'</span>';
    else if(todo) h+='<span class="shk-mt tbd" title="回送の担当がまだ決まっていません">回送 未定</span>';
    if(of)      h+='<span class="shk-mt of" title="陸運局：'+esc(of)+'">'+esc(of)+'</span>';
    else if(todo) h+='<span class="shk-mt tbd" title="どこの陸運局へ行くかがまだ決まっていません">陸運局 未定</span>';
    if(rd)      h+='<span class="shk-mt rd" title="'+rd+'ラウンド">'+rd+'R</span>';
    else if(todo) h+='<span class="shk-mt tbd" title="何ラウンドで行くかがまだ決まっていません">R未定</span>';
    return h ? '<div class="shk-meta">'+h+'</div>' : '';
  }

  /* 🔴 v1.108.0 印（済／再検）を必ず出す。ゆうた確定＝**両方出すが、印を付けて区別する**。 */
  function decChip(c, kind){ var car=carLabel(c);
    var mark = (window.PIT_SHAKEN_MARK && PIT_SHAKEN_MARK[kind]) || '';
    // 決定＝ドラッグ/メニューで編集可。済(done)・再検(recheck)＝ドラッグ抑制、クリックでカード詳細（編集は詳細から）。
    var editable=(kind==='decided');
    // v0.124.1 ドラッグはポインタ方式（下の shkPointer…）で行う＝ネイティブdraggableは使わない。タップ(onclick)は従来どおり。
    var cls = 'shk-chip shk-'+kind+(editable?' shk-drag':' locked');
    var onclick = editable ? 'shkChipMenu(\''+c.id+'\')' : 'openDetail(\''+c.id+'\')';
    return '<div class="'+cls+'" draggable="false" data-card-id="'+c.id+'"'
      + ' onclick="'+onclick+'" style="border-left-color:'+team(c)+'">'
      + '<div class="shk-nm">'+(mark?'<span class="shk-mk shk-mk-'+kind+'">'+mark+'</span>':'')+esc(surname(c))+'様</div>'
      + '<div class="shk-car">'+(car?esc(car):'<span class="shk-nocar">車種未登録</span>')+'</div>'
      + chipMeta(c, kind) + '</div>';
  }

  /* 🔴 v1.116.0 入庫待ちの予約＝表の下に「今週／来週／再来週」の3つの箱で出す（ゆうた指定）。
     ⚠ 空の週も**見出しだけは必ず出す**。黙って消えると「壊れて出ていない」のか
        「本当に無い」のか分からない（8/18 の「動いてない？」がまさにそれ）。 */
  function buildWait(unsched){
    var h='<div class="shk-wait">';
    waitGroups(unsched).forEach(function(g){
      h+='<div class="shk-wg" data-wg="'+g.key+'">'
        + '<div class="shk-wgh"><i data-ic=clock data-ics=16></i> <b>'+g.title+'</b>'
        + '<span class="shk-wgr">'+g.range+'</span>'
        + '<span class="shk-wgn">'+g.cars.length+'台</span></div>'
        + '<div class="shk-wgb">';
      h+= g.cars.length ? g.cars.map(function(c){
            return '<span class="shk-uchip" data-card-id="'+c.id+'" onclick="openDetail(\''+c.id+'\')" style="border-left-color:'+team(c)+'">'
              /* 🔴 v1.117.0 日付だけ（ゆうた指定「（金）だけで 入 は外しちゃってOK」）。
                 ⚠ 箱の見出しが「今週入庫分」なので、1つずつに「入」を付けると同じ字が並ぶだけ。 */
              + '<span class="shk-ures">'+(c.reserveDate?fmtMDW(c.reserveDate):'入庫日未定')+'</span>'
              + '<span class="shk-unm">'+esc(surname(c))+'様</span>'
              + '<span class="shk-ucar">'+esc(carLabel(c)||'')+'</span>'
              + attrChips(c)
              + '</span>';
          }).join('')
        : '<span class="shk-empty">なし</span>';
      h+='</div></div>';
    });
    return h+'</div>';
  }

  function renderShaken(){
    var host=document.getElementById('shakencal-body'); if(!host) return;
    var days=rangeDays(), tIso=todayIso();
    var data=collect(days), decCell=data.decCell, cnt=data.cnt;
    var h='';
    // ヘッダ操作
    h+='<div class="shk-head"><div class="shk-nav"><button onclick="shkShift(-7)"><i data-ic=chevLeft data-ics=16></i> 前週</button><b>'+fmtMD(days[0].iso)+' 〜</b><button onclick="shkShift(7)">次週 <i data-ic=chevRight data-ics=16></i></button><button class="shk-now" onclick="shkShift(0)">今週</button></div>';
    h+='<div class="shk-legend"><span class="shk-lg dc">決定</span><span class="shk-lg dn">完了</span><span class="shk-lg re">再検</span><span class="shk-lg cd">予定枠</span></div>';
    h+='<div class="shk-sum">決定'+cnt.decided+'／完了'+cnt.done+'／再検'+cnt.recheck+'／候補'+cnt.cand+'／未設定'+cnt.unset+'</div></div>';
    /* 🔴 v1.116.0 入庫待ちの帯は**表のいちばん下**へ移した（ゆうた指定
       「上からメインの表、今週、来週、と下に続くように」）。組み立ては下の buildWait()。 */
    // スクロール表
    h+='<div class="shk-scroll"><div class="shk-tbl">';
    // 日付ヘッダ
    h+='<div class="shk-row"><div class="shk-gut hgut"></div>'+days.map(function(x){ var isT=x.iso===tIso; var n=0; ['am','pm'].forEach(function(s){ n+=(decCell[x.iso+'|'+s]||[]).length; });
      return '<div class="shk-day'+(x.off?' dayoff':'')+'"><div class="shk-dh'+(isT?' today':'')+(x.off?' off':'')+'"><span class="d">'+x.date.getDate()+'</span> <span class="w '+(x.w===0?'sun':x.w===6?'sat':'wd')+'">'+DOW[x.w]+'</span>'+(x.off?'<div class="cn">休</div>':'<div class="cn">決'+n+'</div>')+'</div></div>'; }).join('')+'</div>';
    // 午前午後
    h+='<div class="shk-row"><div class="shk-gut hgut bb"></div>'+days.map(function(x){ if(x.off) return '<div class="shk-off2 apoff"><span class="shk-ap off">'+offLabel(x.iso)+'</span></div>'; return '<div class="shk-sc"><div class="shk-ap am"><i data-ic=sunrise data-ics=16></i>午前</div></div><div class="shk-sc pm"><div class="shk-ap pm"><i data-ic=sunrise data-ics=16></i>午後</div></div>'; }).join('')+'</div>';
    // 決定バンド
    h+='<div class="shk-row shk-bandrow"><div class="shk-band"><i data-ic=pin data-ics=16></i> 決定</div><div class="shk-bandfill"></div></div>';
    h+='<div class="shk-row"><div class="shk-gut glabel">行く車</div>'+days.map(function(x){
      if(x.off) return '<div class="shk-off2"></div>';
      return ['am','pm'].map(function(slot){
        var arr=decCell[x.iso+'|'+slot]||[];
        var inner=arr.length?arr.map(function(o){ return decChip(o.c,o.kind); }).join(''):'<span class="shk-empty">－</span>';
        return '<div class="shk-sc'+(slot==='pm'?' pm':'')+'"><div class="shk-decell" data-iso="'+x.iso+'" data-slot="'+slot+'" ondragover="shkOver(event)" ondragleave="shkLeave(event)" ondrop="shkDrop(event,\''+x.iso+'\',\''+slot+'\')">'+inner+'</div></div>';
      }).join('');
    }).join('')+'</div>';
    // 可能性ガント
    h+='<div class="shk-row shk-bandrow shk-gantt-drop" ondragover="shkGanttOver(event)" ondragleave="shkGanttLeave(event)" ondrop="shkGanttDrop(event)"><div class="shk-band"><i data-ic=clock data-ics=16></i> 予定</div><div class="shk-bandfill"><span class="shk-drophint">↩ 決定チップをこの「予定」エリアにドロップ＝候補（行ける日）に戻す</span></div></div>';
    var ganttCars = data.cands.concat(data.empties);
    ganttCars.forEach(function(c){ var s=ins(c); var isEmpty=data.empties.indexOf(c)>=0;
      function son(di,slot){ var day=days[di]; if(!day||day.off) return false; return (s.slots[day.iso]||[]).indexOf(slot)>=0; }
      /* 🔴 v1.121.0 車両注意（アンバー）は attrChips 1本。未設定・再検回数はこの画面だけの印なので別に足す。 */
      var pre=[]; if(isEmpty)pre.push('未設定');
      var rc=(s.history||[]).filter(function(x){return x.result==='recheck';}).length; var post=rc?['再'+rc]:[];
      var subH = pre.map(function(x){return '<span class="shk-ca unset">'+x+'</span>';}).join('')
               + attrChips(c)
               + post.map(function(x){return '<span class="shk-ca">'+x+'</span>';}).join('');
      h+='<div class="shk-row shk-gcar shk-gantt-drop'+(isEmpty?' unset':'')+'" data-card-id="'+c.id+'" ondragover="shkGanttOver(event)" ondragleave="shkGanttLeave(event)" ondrop="shkGanttDrop(event)"><div class="shk-gut gcar"><div class="shk-gcar-nm">'+esc(surname(c))+'様 '+esc(carLabel(c))+'</div><div class="shk-gcar-sub">'+subH+'</div></div>'
        + days.map(function(x,di){ if(x.off) return '<div class="shk-off2"></div>';
            return ['am','pm'].map(function(slot){
              var on=son(di,slot);
              /* 🔴 v1.118.0 予定（候補）の付け外しは**押すだけ**（ゆうた指定）。
                 ⚠ ドラッグで塗る作りはやめた＝表の中で掴むのは「決定へ動かす」時だけにする。 */
              var ap=(slot==='am'?'午前':'午後');
              if(!on) return '<div class="shk-gsc slotcell'+(slot==='pm'?' pm':'')+'" onclick="shkSlot(\''+c.id+'\',\''+x.iso+'\',\''+slot+'\')" title="押すと '+fmtMDW(x.iso)+' '+ap+' を「行ける枠」に入れる"></div>';
              var pOn = slot==='am'? son(di-1,'pm') : son(di,'am');
              var nOn = slot==='am'? son(di,'pm') : son(di+1,'am');
              /* 🔴 v1.118.0 帯を押しても**決定しない**（ゆうた指定「予定部分をクリックで飛ばないように」）。
                 押す＝その枠を外すだけ。決定は**決定バンドへドラッグ**したときだけ。 */
              return '<div class="shk-gsc'+(slot==='pm'?' pm':'')+'"><div class="shk-bar'+(c.boardId==='import'?' imp':'')+(pOn?'':' l')+(nOn?'':' r')+'" draggable="false" data-card-id="'+c.id+'" data-iso="'+x.iso+'" data-slot="'+slot+'" onclick="shkSlot(\''+c.id+'\',\''+x.iso+'\',\''+slot+'\')" title="押すと '+fmtMDW(x.iso)+' '+ap+' の枠を外す／上の「決定」へドラッグで決定"></div></div>';
            }).join('');
          }).join('')+'</div>';
    });
    if(!ganttCars.length) h+='<div class="shk-row"><div class="shk-gut gcar"><span class="shk-empty">対象車なし</span></div>'+days.map(function(x){ return x.off?'<div class="shk-off2"></div>':'<div class="shk-gsc"></div><div class="shk-gsc pm"></div>'; }).join('')+'</div>';
    h+='</div></div>';
    h+=buildWait(data.unsched);          /* 🔴 v1.116.0 表の下に「今週／来週／再来週」 */
    host.innerHTML=h;
  }

  // ===== ドラッグ =====
  var _drag=null;
  window.shkDragStart=function(e,id){ _drag=id; try{ e.dataTransfer.setData('text',id); e.dataTransfer.effectAllowed='move'; }catch(_){}; if(e.target&&e.target.classList) e.target.classList.add('dragging'); };
  window.shkDragEnd=function(e){ if(e.target&&e.target.classList) e.target.classList.remove('dragging'); };
  window.shkOver=function(e){ e.preventDefault(); e.currentTarget.classList.add('drop'); };
  window.shkLeave=function(e){ e.currentTarget.classList.remove('drop'); };
  window.shkDrop=function(e,iso,slot){ e.preventDefault(); e.currentTarget.classList.remove('drop'); var id=(e.dataTransfer&&e.dataTransfer.getData('text'))||_drag; _drag=null; assign(id,iso,slot); };
  /* 🔴 v1.118.0 `shkFix`（帯を押したら決定）は**廃止**。
     ゆうた指定「決定車両への移動はドラッグのみ、予定部分をクリックで飛ばないように」。
     ⚠ 押し間違いで陸運局の日が勝手に決まってしまうのを防ぐのが目的。復活させないこと。 */
  function assign(id,iso,slot){ var c=card(id); if(!c) return; var s=ins(c);
    /* 🔴 v1.119.0 **はじめて決めた時だけ**、回送の担当・陸運局・R を聞く窓を出す（ゆうた確定）。
       ⚠ すでに決まっている車を別の日へ動かしただけの時は**出さない**（毎回聞かれると邪魔）。
       ⚠ 担当・陸運局・R は日を動かしても**消さない**（同じ車検の話なので持ち回る）。 */
    var isNew = !s.decided;
    s.decided=iso; s.decidedSlot=(slot==='pm'?'pm':'am'); s.result=''; s.resultDate=''; s.resultSlot='';
    save(); renderShaken();
    if(isNew) setTimeout(function(){ shkDecidePop(id); }, 60);
  }

  // 決定チップを「予定」エリアにドロップ＝決定を解除して候補（行ける日）表示に戻す（候補slotsは残す）v0.124.0
  window.shkGanttOver=function(e){ e.preventDefault(); try{ e.dataTransfer.dropEffect='move'; }catch(_){}; var t=e.currentTarget; if(t&&t.classList) t.classList.add('drop'); };
  window.shkGanttLeave=function(e){ var t=e.currentTarget; if(t&&t.classList) t.classList.remove('drop'); };
  window.shkGanttDrop=function(e){ e.preventDefault(); e.stopPropagation(); var t=e.currentTarget; if(t&&t.classList) t.classList.remove('drop'); var id=(e.dataTransfer&&e.dataTransfer.getData('text'))||_drag; _drag=null; unassign(id); };
  function unassign(id){ var c=card(id); if(!c) return; var s=ins(c); if(!s.decided) return;   // 決定中の車だけ候補へ戻す
    s.decided=''; s.decidedSlot=''; s.result=''; s.resultDate=''; s.resultSlot=''; save(); renderShaken();
    if(window.pitToast) pitToast('↩ 候補（行ける日）に戻しました'); }

  // ===== ポインタ方式のドラッグ（マウス＋タッチ両対応。ネイティブHTML5 DnDが効かない環境の確実版）v0.124.1 =====
  //   決定チップ／候補バーを長押し移動→「📌決定」枠にドロップで決定/別日移動、「🕘予定」エリアにドロップで候補へ戻す。
  //   動かさず離した時（タップ）は従来の onclick（メニュー/その枠で決定）に任せる。
  //   ゴーストは「ドロップ先の枠」に反映する＝決定枠に入れると、その枠にプレビュー用チップが出る。元チップは薄くする。
  var _pdrag=null, _ghostEl=null, _lastZone=null, _srcEl=null, _suppressClick=false;
  function _clearZone(){ if(_lastZone){ _lastZone.classList.remove('drop'); _lastZone=null; } }
  function _detachGhost(){ if(_ghostEl && _ghostEl.parentNode) _ghostEl.parentNode.removeChild(_ghostEl); }
  function _hideHover(){ var hv=document.getElementById('pit-hovercard'); if(hv) hv.classList.remove('show'); }
  document.addEventListener('pointerdown', function(e){
    if(e.pointerType==='mouse' && e.button!==0) return;
    var host=document.getElementById('shakencal-body'); if(!host||!host.contains(e.target)) return;
    var chip=e.target.closest && e.target.closest('.shk-chip.shk-drag[data-card-id]');
    var bar =e.target.closest && e.target.closest('.shk-bar[data-card-id]');
    var el=chip||bar; if(!el) return;
    var lbl = chip ? ((chip.querySelector('.shk-nm')||{}).textContent||'車検') : '車検';
    _pdrag={ id:el.getAttribute('data-card-id'), x:e.clientX, y:e.clientY, moved:false, label:lbl };
    _srcEl = el;
  });
  document.addEventListener('pointermove', function(e){
    if(!_pdrag) return;
    if(!_pdrag.moved){
      if(Math.abs(e.clientX-_pdrag.x)+Math.abs(e.clientY-_pdrag.y) < 6) return;
      _pdrag.moved=true; window.pitDragging=true; _hideHover();   // ドラッグ中フラグ＝card-hoverが他カードのホバーを抑制 v0.124.3
      if(_srcEl && _srcEl.classList) _srcEl.classList.add('shk-dragsrc');   // 元チップを薄く
      _ghostEl=document.createElement('div'); _ghostEl.className='shk-chip shk-ghostchip'; _ghostEl.textContent=_pdrag.label;
    }
    e.preventDefault();
    var t=document.elementFromPoint(e.clientX,e.clientY);
    var decell = t && t.closest && t.closest('.shk-decell:not(.off)');
    var gantt  = decell ? null : (t && t.closest && t.closest('.shk-gantt-drop'));
    var zone = decell || gantt;
    if(zone!==_lastZone){ _clearZone(); if(zone){ zone.classList.add('drop'); _lastZone=zone; } }
    // ゴースト＝決定枠に入れた時だけ、その枠に「ここに入る」プレビューを出す
    if(decell){ if(_ghostEl.parentNode!==decell) decell.appendChild(_ghostEl); }
    else { _detachGhost(); }
  }, {passive:false});
  document.addEventListener('pointerup', function(e){
    if(!_pdrag) return;
    var p=_pdrag, zone=_lastZone; _pdrag=null; window.pitDragging=false;   // ドラッグ終了＝ホバー抑制を解除 v0.124.3
    _detachGhost(); _ghostEl=null; _clearZone();
    if(_srcEl && _srcEl.classList) _srcEl.classList.remove('shk-dragsrc'); _srcEl=null;
    if(!p.moved) return;   // タップ＝onclick（メニュー/その枠で決定）に任せる
    _suppressClick=true; setTimeout(function(){ _suppressClick=false; }, 80);   // ドラッグ直後の誤クリック抑制
    if(!zone) return;
    if(zone.classList.contains('shk-decell')){ assign(p.id, zone.getAttribute('data-iso'), zone.getAttribute('data-slot')); }
    else { unassign(p.id); }   // shk-gantt-drop（予定エリア）＝候補に戻す
  });
  document.addEventListener('click', function(e){
    if(!_suppressClick) return;
    var host=document.getElementById('shakencal-body');
    if(host&&host.contains(e.target)){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  /* ===== 「行ける枠」の付け外し＝**押すだけ**（v1.118.0・ゆうた指定） =====
     🗣「ドラッグの挙動は候補日を増やすのはなし。あくまで**予定側の枠をクリックするのみ**」
     🔴 空いているマスを押す → その枠を入れる／すでに帯があるマスを押す → その枠を外す。
     ⚠ **範囲ドラッグで塗る作りは廃止した。** 表の中で掴む操作は「決定へ動かす」1つだけにする、
        というのが今回の決めごと。塗りを戻すと、掴んだつもりが塗りになって事故る。
     ⚠ 帯を押した時に決定へ飛ばないこと（`shkFix` を廃止した理由と同じ）。
     ⚠ ドラッグして離した直後の空クリックは `_suppressClick` が止める＝ここには来ない。 */
  window.shkSlot=function(id,iso,slot){
    var c=card(id); if(!c) return; var s=ins(c);
    if(!s.slots[iso]) s.slots[iso]=[];
    var i=s.slots[iso].indexOf(slot);
    if(i>=0){ s.slots[iso].splice(i,1); if(!s.slots[iso].length) delete s.slots[iso]; }
    else s.slots[iso].push(slot);
    save(); renderShaken();
  };

  /* ══ 回送の担当・陸運局・R の入力欄（v1.119.0） ══
     決めた直後の窓と、決定チップのメニューの**両方で同じ部品**を使う＝食い違わない。
     ⚠ 担当の既定＝いま入っている人／無ければ**自分**（v1.55.0 の決めごとを引き継ぐ）。
     ⚠ 「（未定）」を必ず先頭に置く＝**空のまま決定してよい**（ゆうた確定）ので、外す道が要る。 */
  function fieldsHtml(c){
    var s=ins(c);
    var cur=(s.resultStaff||(window.pitFlowMe?pitFlowMe():'')||'');
    var stOpts='<option value="">（未定）</option>'
      + (window.state&&Array.isArray(state.staff)?state.staff:[]).map(function(m){
          return '<option value="'+esc(m.name)+'"'+(cur===m.name?' selected':'')+'>'+esc(m.name)+'</option>'; }).join('');
    var offs=rikuunList();
    var ofOpts='<option value="">（未定）</option>'
      + offs.map(function(o){ return '<option value="'+esc(o.id)+'"'+(s.office===o.id?' selected':'')+'>'+esc(o.name)+'</option>'; }).join('');
    var rd=shRound(c);
    var rOpts='<option value="">（未定）</option>'
      + (window.PIT_SHAKEN_ROUNDS||[1,2,3,4]).map(function(n){ return '<option value="'+n+'"'+(rd===n?' selected':'')+'>'+n+'R</option>'; }).join('');
    return '<label class="shk-plabel">担当（回送＝実際に車検に行く人）</label>'
      + '<select id="shk-staff" class="shk-psel">'+stOpts+'</select>'
      + '<label class="shk-plabel">陸運局</label>'
      + '<select id="shk-office" class="shk-psel">'+ofOpts+'</select>'
      + (offs.length ? '' : '<div class="shk-phint">CoreMembers の場所マスターに「陸運局」の場所がありません。CoreMembers で登録すると、ここに出ます。</div>')
      + '<label class="shk-plabel">R（ラウンド）</label>'
      + '<select id="shk-round" class="shk-psel">'+rOpts+'</select>';
  }

  /* 決めた直後に出る窓（ゆうた指定「決定車両になった時点で入力できるように」）。
     ⚠ ここには 完了・再検 を置かない＝**決めたばかりの車を押し間違いで「済」にしないため**。 */
  window.shkDecidePop=function(id){
    var c=card(id); if(!c) return; var s=ins(c);
    if(!s.decided) return;
    var slName=s.decidedSlot==='pm'?'午後':'午前';
    pop('車検の予定を決めました',
      '<div class="shk-pinfo">'+esc(surname(c))+'様 / '+esc(c.car||'')+(c.plate?' / '+esc(c.plate):'')+'</div>'
      + '<div class="shk-pnote">予定決定：'+fmtMDW(s.decided)+' '+slName+'</div>'
      + fieldsHtml(c)
      + '<button class="shk-pbtn ok" onclick="shkSaveFields(\''+id+'\')">保存する</button>'
      + '<button class="shk-pbtn ghost" onclick="shkClosePop()">あとで入れる</button>');
  };

  /* 3つを保存する。⚠ 陸運局は id で持ち、名前は**後ろ盾の写し**として一緒に控える
     （CoreMembers で場所が消えたり名前が変わっても、過去の記録が空欄にならないように）。 */
  window.shkSaveFields=function(id){
    var c=card(id); if(!c) return; var s=ins(c);
    var stEl=document.getElementById('shk-staff'), ofEl=document.getElementById('shk-office'), rdEl=document.getElementById('shk-round');
    var staff=stEl?stEl.value:'', off=ofEl?ofEl.value:'', rd=rdEl?Number(rdEl.value||0):0;
    s.resultStaff=staff;
    s.office=off||'';
    s.officeName=off ? ((window.pitLocName?pitLocName(off):'') || s.officeName || '') : '';
    s.round=(rd>=1&&rd<=4)?rd:0;
    if(window.logFlow) logFlow(c, '車検の予定 '+(s.decided?fmtMD(s.decided):'')+'（回送:'+(staff||'—')+'／'+(s.officeName||'陸運局未定')+'／'+(s.round?s.round+'R':'R未定')+'）');
    save(); closePop(); renderShaken();
    if(window.pitToast) pitToast('車検の予定を保存しました');
  };

  // 決定チップのメニュー
  window.shkChipMenu=function(id){
    var c=card(id); if(!c) return; var s=ins(c);
    var slName=s.decidedSlot==='pm'?'午後':'午前';
    var body='<div class="shk-pinfo">'+esc(surname(c))+'様 / '+esc(c.car||'')+(c.plate?' / '+esc(c.plate):'')+'</div>';
    if(s.result==='done'){
      body+='<div class="shk-pnote">完了：'+(s.resultDate?fmtMD(s.resultDate):'')+' '+slName+(s.resultStaff?'・担当 '+esc(s.resultStaff):'')+'</div><button class="shk-pbtn" onclick="shkAct(\''+id+'\',\'reopen\')">予定に戻す</button>';
    } else if(s.decided){
      body+='<div class="shk-pnote">予定決定：'+fmtMDW(s.decided)+' '+slName+'</div>'
        + fieldsHtml(c)
        + '<button class="shk-pbtn ok2" onclick="shkSaveFields(\''+id+'\')">この内容で保存</button>'
        + '<button class="shk-pbtn ok" onclick="shkAct(\''+id+'\',\'done\')">✓ 完了（受かった）</button>'
        + '<button class="shk-pbtn re" onclick="shkAct(\''+id+'\',\'recheck\')">↺ 再検（落ちた・候補へ戻す）</button>'
        + '<button class="shk-pbtn" onclick="shkAct(\''+id+'\',\'flip\')">'+(s.decidedSlot==='pm'?'午前':'午後')+'に変更</button>'
        + '<button class="shk-pbtn" onclick="shkAct(\''+id+'\',\'tocand\')">↩ 候補（行ける日）に戻す</button>'
        + '<button class="shk-pbtn" onclick="shkAct(\''+id+'\',\'cancel\')">予定を取り消す</button>';
    } else {
      body+='<div class="shk-pnote">この車の再検記録です。</div><button class="shk-pbtn" onclick="shkClosePop()">閉じる</button>';
    }
    body+='<button class="shk-pbtn ghost" onclick="openDetail(\''+id+'\');shkClosePop()">カードを開く</button>';
    pop('車検の予定', body);
  };
  function _slT(sl){ return sl==='pm'?'PM':'AM'; }
  window.shkAct=function(id,act){ var c=card(id); if(!c) return; var s=ins(c);
    var stEl=document.getElementById('shk-staff'); var staff=stEl?stEl.value:'';
    /* 🔴 v1.119.0 完了・再検の時も、窓に出ている陸運局とRを一緒に確定する（別々に保存させない）。 */
    var ofEl=document.getElementById('shk-office'), rdEl=document.getElementById('shk-round');
    if(ofEl){ s.office=ofEl.value||''; s.officeName=s.office?((window.pitLocName?pitLocName(s.office):'')||s.officeName||''):''; }
    if(rdEl){ var _r=Number(rdEl.value||0); s.round=(_r>=1&&_r<=4)?_r:0; }
    var _wh='（回送:'+(staff||'—')+'／'+(s.officeName||'陸運局未定')+'／'+(s.round?s.round+'R':'R未定')+'）';
    if(act==='done'){ var d=s.decided||todayIso(), sl=s.decidedSlot||'am'; s.result='done'; s.resultDate=d; s.resultSlot=sl; s.resultStaff=staff;
      if(window.logFlow) logFlow(c, '車検 済 '+fmtMD(d)+' '+_slT(sl)+_wh); }
    else if(act==='recheck'){ var d2=s.decided||todayIso(), sl2=s.decidedSlot||'am';
      /* ⚠ 再検の記録にも、その時どこへ誰が行って何Rだったかを残す（あとから振り返れるように） */
      s.history.push({date:d2, slot:sl2, result:'recheck', staff:staff, office:s.office||'', officeName:s.officeName||'', round:s.round||0});
      s.decided=''; s.decidedSlot=''; s.result=''; s.resultDate=''; s.resultSlot=''; s.resultStaff='';
      /* ⚠ 陸運局とRは**残す**＝次に決め直す時、たいてい同じ所へ行くので入れ直させない。直したい時は窓で変えられる。 */
      if(window.logFlow) logFlow(c, '車検 再検 '+fmtMD(d2)+' '+_slT(sl2)+_wh); }
    else if(act==='tocand'){ closePop(); unassign(id); return; }   // 候補（行ける日）に戻す＝slotsは残す v0.124.1
    else if(act==='cancel'){ s.decided=''; s.decidedSlot=''; s.result=''; s.resultDate=''; s.resultSlot=''; }
    else if(act==='reopen'){ s.result=''; s.resultDate=''; s.resultSlot=''; s.resultStaff=''; }
    else if(act==='flip'){ s.decidedSlot=(s.decidedSlot==='pm'?'am':'pm'); }
    save(); closePop(); renderShaken();
  };

  function pop(title, body){
    var back=document.getElementById('shk-pop');
    if(!back){ back=document.createElement('div'); back.id='shk-pop'; back.className='modal-backdrop'; pitModalOutside(back, closePop); document.body.appendChild(back); }
    back.innerHTML='<div class="pdp-box shk-box"><div class="pdp-head"><span>'+title+'</span><button class="pdp-x" onclick="shkClosePop()"><i data-ic=close data-ics=16></i></button></div><div class="shk-popbody">'+body+'</div></div>';
    back.classList.add('show');
  }
  function closePop(){ var b=document.getElementById('shk-pop'); if(b) b.classList.remove('show'); }
  window.shkClosePop=closePop;
  window.renderShaken=renderShaken;
  window.shkShift=function(dir){ var t; if(dir===0){ t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7)); } else { t=new Date(window._shakenBase); t.setDate(t.getDate()+dir); } window._shakenBase=t; renderShaken(); };
})();

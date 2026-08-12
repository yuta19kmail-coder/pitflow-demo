/* ========================================
   shaken-log.js  -  車検履歴カレンダー（アーカイブ）/ PitFlow v0.111.0
   ・完全に事実ベース＝過去に「行った」実績のみ（予定は出さない）。
   ・データ源：inspSchedule.result==='done'（済）＋ history[]の再検。誰が(resultStaff/staff)・いつ(AM/PM)を月カレンダーで振り返る。
   ・全ての過去を月送りで遡れる。
   ======================================== */
(function(){
  'use strict';
  var DOW='日月火水木金土';
  function pad(n){ return (n<10?'0':'')+n; }
  function ymd(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }
  function surname(c){ return (window.pitSurname?pitSurname(c.customer):(c.customer||''))||'（未入力）'; }
  function carLabel(c){ return (c.car||c.maker||c.plate||'').toString(); }
  function team(c){ return c.boardId==='import'?'#ec4899':'#1db97a'; }
  function isShaken(c){ var ids=(Array.isArray(c.workTypes)&&c.workTypes.length)?c.workTypes:(c.workType?[c.workType]:[]); return ids.indexOf('shaken')>=0; }
  function ins(c){ return c.inspSchedule||{}; }
  function todayIso(){ var t=new Date(); t.setHours(0,0,0,0); return ymd(t); }

  // 事実ベースの実績レコードを収集
  function records(){
    var out=[];
    (state.cards||[]).forEach(function(c){ if(!isShaken(c)) return; var s=ins(c);
      if(s.result==='done'){ var d=s.resultDate||s.decided; if(d) out.push({iso:d, slot:(s.resultSlot||s.decidedSlot)==='pm'?'pm':'am', c:c, result:'done', staff:s.resultStaff||''}); }
      (s.history||[]).forEach(function(h){ if(h&&h.result==='recheck'&&h.date) out.push({iso:h.date, slot:h.slot==='pm'?'pm':'am', c:c, result:'recheck', staff:h.staff||''}); });
    });
    return out;
  }

  function monthBase(){
    if(!window._shakenLogM){ var t=new Date(); window._shakenLogM=new Date(t.getFullYear(),t.getMonth(),1); }
    return new Date(window._shakenLogM);
  }

  // 🔍 検索結果リスト（日付・車種・お客様名・担当。スペース区切りは全て含むAND） v0.124.5
  function sklResultsHtml(recs, query){
    var terms=query.toLowerCase().split(/\s+/).filter(Boolean);
    var res=recs.filter(function(r){
      var d=new Date(r.iso+'T00:00:00');
      var dstr=r.iso+' '+(d.getMonth()+1)+'/'+d.getDate()+' '+(d.getMonth()+1)+'月'+d.getDate()+'日 '+d.getFullYear();
      var hay=[surname(r.c), r.c.customer||'', r.c.kana||'', carLabel(r.c), r.c.car||'', r.c.maker||'', r.c.plate||'', r.staff||'', dstr, (r.result==='done'?'済 done':'再検 recheck')].join(' ').toLowerCase();
      return terms.every(function(t){ return hay.indexOf(t)>=0; });
    }).sort(function(a,b){ return a.iso<b.iso?1:(a.iso>b.iso?-1:(a.slot<b.slot?-1:1)); });
    var h='<div class="skl-res-head">検索結果 <b>'+res.length+'</b>件</div>';
    if(!res.length) return h+'<div class="skl-note">該当する記録はありません。日付（例 7/16 や 2026-07）・車種・お客様名・担当者などで検索できます。</div>';
    h+='<div class="skl-results">';
    res.forEach(function(r){ var d=new Date(r.iso+'T00:00:00'); var _car=carLabel(r.c);
      h+='<div class="skl-res-row '+r.result+'" data-card-id="'+r.c.id+'" onclick="openDetail(\''+r.c.id+'\')" style="border-left-color:'+team(r.c)+'">'
        +'<span class="skl-res-date">'+d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate()+'<small>('+DOW[d.getDay()]+')</small></span>'
        +'<span class="skl-ap '+r.slot+'">'+(r.slot==='pm'?'PM':'AM')+'</span>'
        +'<span class="skl-res-nm">'+esc(surname(r.c))+'様</span>'
        +'<span class="skl-res-car">'+(_car?esc(_car):'—')+'</span>'
        +'<span class="skl-rt">'+(r.result==='done'?'済':'再')+'</span>'
        +'<span class="skl-res-stf">'+(r.staff?esc(r.staff):'—')+'</span>'
        +'</div>';
    });
    return h+'</div>';
  }
  window.sklSearch=function(v){
    window._sklQuery=v;
    var m=document.getElementById('skl-main'); if(m){ m.innerHTML=sklMainHtml(); } else { renderShakenLog(); }
    var cb=document.getElementById('skl-clear'); if(cb) cb.style.display=(v&&v.trim())?'':'none';
    if(!(v&&v.trim())){ var se=document.getElementById('skl-search'); if(se&&se.value!=='') se.value=''; }
  };

  // メイン部（検索結果 or 月カレンダー）だけを返す＝検索欄は据え置きにして入力中はここだけ更新（IME変換の途切れ防止）v0.124.6
  function sklMainHtml(){
    var query=(window._sklQuery||'').trim();
    var recs=records();
    if(query) return sklResultsHtml(recs, query);
    var base=monthBase(), y=base.getFullYear(), mo=base.getMonth();
    var byDay={}; recs.forEach(function(r){ (byDay[r.iso]=byDay[r.iso]||[]).push(r); });
    var mPrefix=y+'-'+pad(mo+1)+'-';
    var mRecs=recs.filter(function(r){ return r.iso.indexOf(mPrefix)===0; });
    var doneN=mRecs.filter(function(r){return r.result==='done';}).length;
    var reN=mRecs.filter(function(r){return r.result==='recheck';}).length;
    var byStaff={}; mRecs.forEach(function(r){ var k=r.staff||'（未記録）'; byStaff[k]=(byStaff[k]||0)+1; });
    var staffArr=Object.keys(byStaff).map(function(k){return {name:k,n:byStaff[k]};}).sort(function(a,b){return b.n-a.n;});
    var h='';
    h+='<div class="skl-head"><div class="skl-nav"><button onclick="sklShift(-1)"><i data-ic=chevLeft data-ics=16></i> 前月</button><b>'+y+'年'+(mo+1)+'月</b><button onclick="sklShift(1)">次月 <i data-ic=chevRight data-ics=16></i></button><button class="skl-now" onclick="sklShift(0)">今月</button></div>';
    h+='<div class="skl-sum"><span class="skl-lg done">済 '+doneN+'</span><span class="skl-lg re">再検 '+reN+'</span><span class="skl-lg all">計 '+(doneN+reN)+'</span></div></div>';
    h+='<div class="skl-staff">'+(staffArr.length?('担当別： '+staffArr.map(function(s){return '<span class="skl-sc">'+esc(s.name)+' <b>'+s.n+'</b></span>';}).join('')):'<span class="skl-empty2">この月の実績はまだありません</span>')+'</div>';
    h+='<div class="skl-cal"><div class="skl-dows">'+DOW.split('').map(function(d,i){return '<div class="skl-dow '+(i===0?'sun':i===6?'sat':'')+'">'+d+'</div>';}).join('')+'</div><div class="skl-grid">';
    var first=new Date(y,mo,1); var start=new Date(first); start.setDate(1-first.getDay());
    var tIso=todayIso();
    for(var i=0;i<42;i++){
      var d=new Date(start); d.setDate(start.getDate()+i); var iso=ymd(d); var inM=(d.getMonth()===mo);
      var arr=(byDay[iso]||[]).slice().sort(function(a,b){ return (a.slot===b.slot?0:(a.slot==='am'?-1:1)); });
      var w=d.getDay();
      h+='<div class="skl-day'+(inM?'':' out')+(iso===tIso?' today':'')+'">'
        + '<div class="skl-dh"><span class="skl-d '+(w===0?'sun':w===6?'sat':'')+'">'+d.getDate()+'</span>'+(arr.length?'<span class="skl-cnt">'+arr.length+'</span>':'')+'</div>'
        + arr.map(function(r){ var _car=carLabel(r.c); return '<div class="skl-chip '+r.result+'" data-card-id="'+r.c.id+'" onclick="openDetail(\''+r.c.id+'\')" style="border-left-color:'+team(r.c)+'" title="'+esc(surname(r.c))+'様 '+esc(_car)+' / '+(r.result==='done'?'済':'再検')+' '+(r.slot==='pm'?'PM':'AM')+(r.staff?' / '+esc(r.staff):'')+'">'
            + '<div class="skl-r1"><span class="skl-ap '+r.slot+'">'+(r.slot==='pm'?'PM':'AM')+'</span>'
            + '<span class="skl-nm">'+esc(surname(r.c))+'様</span>'
            + '<span class="skl-rt">'+(r.result==='done'?'済':'再')+'</span></div>'
            + '<div class="skl-r2"><span class="skl-car">'+(_car?esc(_car):'—')+'</span>'
            + (r.staff?'<span class="skl-stf">'+esc(r.staff)+'</span>':'')+'</div>'
            + '</div>'; }).join('')
        + '</div>';
    }
    h+='</div></div>';
    h+='<div class="skl-note">※ 事実ベースの記録のみ（予定は含みません）。済＝受かって陸運局へ行った実績、再＝再検で行った実績。誰が行ったか（担当）も記録。月送りで過去すべてを振り返れます。</div>';
    return h;
  }

  window.renderShakenLog=function(){
    var host=document.getElementById('shakenlog-body'); if(!host) return;
    var query=(window._sklQuery||'').trim();
    var h='<div class="skl-searchbar"><input id="skl-search"class="skl-search"type="text"value="'+esc(query)+'"oninput="sklSearch(this.value)"placeholder="過去の車検を検索（日付・車種・お客様名・担当）"><button id="skl-clear"class="skl-clear"onclick="sklSearch(\'\')"style="'+(query?'':'display:none')+'">クリア</button></div>';
    h+='<div id="skl-main">'+sklMainHtml()+'</div>';
    host.innerHTML=h;
  };
  window.sklShift=function(dir){ var b; if(dir===0){ var t=new Date(); b=new Date(t.getFullYear(),t.getMonth(),1); } else { b=monthBase(); b.setMonth(b.getMonth()+dir); } window._shakenLogM=b; renderShakenLog(); };
})();

/* ========================================
   cust-merge.js ── 👤 同じお客様が2人に分かれている時、1人にまとめる（PitFlow v2.36.0）
   ----------------------------------------
   ◎なぜ要るか（2026-08-30・ゆうた指定）
     電話口はカナ「ミゾグチ」→ 来店して漢字「溝口」。呼び出さずに入れると**人ごとダブる**。
     v2.35.0 で「打っている最中に候補を出す」を入れたが、**すでに貯まっている分**は残る。その受け皿。
     🗣「統合ボタンを 6322人の下に表示して。でも**2こ探すから専用UIを出して2本検索**できるようにしないと。
     　　で**なんの情報を持つかを選択して実行**の流れか、車両と同じじゃないかな」

   ◎車の統合（veh-merge.js）と同じ決めごと
     🔴 **②は消さない。アーカイブに移すだけ。**中身もそのまま＝持っていくのは写しだけ → **取り消せる**（管理者だけ）
     🔴 **食い違う欄は黙って上書きしない。**一覧で出して ①か② を選ばせる
     🔴 **実行の前に必ず確認の窓。**①②がどれか・②はどうなるか・かかっている予約の番号まで読み上げる
     🔴 **過去のカードの中身は書き換えない。**当時の名前のまま残る（記録は当時のまま）
        ＝ 付け替えるのは「**誰の予約か**」の紐づけ（`customerId`）だけ

   ◎車の統合と違うところ（3つ）
     ① **連絡先（TEL）は「どっちも残す」が既定**（🗣「電話とかならどっちも」）
     ② 付け替えるのは `customerId`（車の統合は `vehId` とナンバー）
     ③ **車は全部①へ移す。**同じナンバーが両方に居たら、そのまま**車の統合へ渡す**
   ======================================== */
(function (w, d) {
  'use strict';

  function t(x){ return String(x == null ? '' : x).trim(); }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function norm(s){ return String(s==null?'':s).replace(/\s+/g,'').replace(/[ァ-ヶ]/g,function(ch){ return String.fromCharCode(ch.charCodeAt(0)-0x60); }).toLowerCase(); }
  function custs(){ return (w.state && state.customers) || []; }
  function cards(){ return (w.state && state.cards) || []; }
  function realPlate(p){ return w.pitIsRealPlate ? pitIsRealPlate(p) : !!t(p); }
  function findCust(id){ return custs().find(function(x){ return x && x.id===id; }) || null; }
  function disp(c){ return (w.pitCustDispName ? pitCustDispName(c) : ((c&&c.name)||(c&&c.kana)||'')) || '(無名)'; }
  function save(){ if (w.PitDB) PitDB.save(); }
  function meName(){ try { if (w.pitCurrentStaffName) return pitCurrentStaffName()||''; } catch(e){} return ''; }
  function toast(m, code){ if (w.pitToast) pitToast(m, code); }
  function 済み(c){ return w.pitCardIsDone ? pitCardIsDone(c) : false; }
  /* 🔴 番号は車の統合と**使い回さない**（一度出した番号は意味と1対1・出す所も1か所） */
  function _管理者だけ(){ toast('お客様の統合を取り消せるのは管理者だけです', 'PF-6009'); }
  function _記録なし(){ toast('取り消すお客様の統合の記録が見つかりません', 'PF-6010'); }
  /* まとめられて残っているだけの人＝呼び出し・引き当ての対象にしない（車と同じ物差し） */
  function merged(c){ return !!(c && c.mergedInto); }
  w.pitCustMerged = merged;

  function primaryTel(c){ var cs=(c&&c.contacts)||[]; var p=cs.find(function(x){ return x&&x.primary; })||cs[0]; return p?t(p.tel):''; }
  function liveVehs(c){ return ((c&&c.vehicles)||[]).filter(function(v){ return v && !v.mergedInto; }); }

  /* ---------- 見くらべる欄（人の側） ---------- */
  var FIELDS = [
    { k:'name',       l:'お名前' },
    { k:'kana',       l:'カナ' },
    { k:'lineStatus', l:'LINE', disp:function(v){ return v==='ok'?'登録済':(v==='ng'?'LINE NG':(v?v:'未案内')); } },
    /* 🔴 v2.37.3 番号に URL がまるごと入っていることがある。**欄の見くらべでも URL を並べない**
       （持っていく中身は生のまま。ここは見せ方だけ） */
    { k:'lstepId',    l:'Lステップ番号', disp:function(v){ return _lstepNo(v) || (t(v)?'（URLが入っています）':''); } }
  ];

  /* =====================================================================
     何が起きるかを先に出す（画面を持たない＝見張りから直接たたける）
     ===================================================================== */
  function plan(mainId, subId){
    var A = findCust(mainId), B = findCust(subId);
    if(!A || !B || A === B) return null;
    var rows = [];
    FIELDS.forEach(function(f){
      var a = t(A[f.k]), b = t(B[f.k]);
      if(!b) return;
      if(a === b) return;
      rows.push({ k:f.k, l:f.l, 主:(f.disp?f.disp(a):a), サブ:(f.disp?f.disp(b):b),
                  既定:(a ? 'main' : 'sub'), 種類:(a ? '食い違い' : '空埋め') });
    });
    /* 連絡先＝ぶつかっていても「どっちも残す」が既定（ゆうた指定） */
    var 連絡先 = { 主:((A.contacts||[]).map(function(x){ return t(x.tel); }).filter(Boolean)),
                   サブ:((B.contacts||[]).map(function(x){ return t(x.tel); }).filter(Boolean)) };
    /* 車＝全部①へ移す。同じナンバーが両方に居たら、あとで車の統合へ渡す */
    var かぶり = [];
    liveVehs(B).forEach(function(vb){
      if(!realPlate(vb.plate)) return;
      if(liveVehs(A).some(function(va){ return realPlate(va.plate) && norm(va.plate)===norm(vb.plate); })) かぶり.push(t(vb.plate));
    });
    /* ②を指しているカード（まだ終わっていないもの＝予約を見失わせない） */
    var 全カード = cards().filter(function(c){ return c && c.customerId===B.id; });
    var 予約 = 全カード.filter(function(c){ return !済み(c); }).map(function(c){ return { id:c.id, resNo:t(c.resNo), plate:t(c.plate) }; });
    return { A:A, B:B, rows:rows, 連絡先:連絡先, 車:{ 主:liveVehs(A).length, サブ:liveVehs(B).length, かぶり:かぶり },
             カード:全カード.length, 予約:予約 };
  }

  /* =====================================================================
     まとめる　選択 = { 欄:{ 欄名:'main'|'sub' }, 連絡先:'both'|'main'|'sub' }
     ===================================================================== */
  function apply(mainId, subId, 選択){
    選択 = 選択 || {};
    var P = plan(mainId, subId);
    if(!P){ toast('まとめられませんでした（お客様が見つかりません）', 'PF-6008'); return null; }
    var A = P.A, B = P.B;
    var 記録 = { id:'cm'+Date.now()+Math.floor(Math.random()*1000), at:Date.now(), by:meName(),
                 from:B.id, fromName:disp(B), 欄:[], 連絡先:'', 車:[], カード:[] };

    /* ① 欄（選ばれたものだけ・前の値を控える） */
    (P.rows||[]).forEach(function(r){
      var 選ぶ = (選択.欄 && 選択.欄[r.k]) || r.既定;
      if(選ぶ !== 'sub') return;
      記録.欄.push({ k:r.k, 前:(A[r.k]==null?'':A[r.k]), 後:B[r.k] });
      A[r.k] = B[r.k];
    });
    /* 🔵 ②の名前は「別名」として残す＝旧姓と同じ扱い（あとで探せる） */
    var 別名 = t(B.name) || t(B.kana);
    if(別名 && norm(別名) !== norm(t(A.name)) && norm(別名) !== norm(t(A.kana))){
      if(!Array.isArray(A.oldNames)) A.oldNames = [];
      if(A.oldNames.every(function(x){ return norm(x)!==norm(別名); })){ A.oldNames.push(別名); 記録.別名 = 別名; }
      if(A.oldNames.length>5) A.oldNames = A.oldNames.slice(-5);
    }

    /* ② 連絡先 */
    記録.連絡先 = 選択.連絡先 || 'both';
    記録.前の連絡先 = JSON.parse(JSON.stringify(A.contacts||[]));
    if(記録.連絡先 === 'sub'){ A.contacts = JSON.parse(JSON.stringify(B.contacts||[])); }
    else if(記録.連絡先 === 'both'){
      if(!Array.isArray(A.contacts)) A.contacts = [];
      (B.contacts||[]).forEach(function(ct){
        if(!t(ct.tel)) return;
        if(A.contacts.some(function(x){ return norm(x.tel)===norm(ct.tel); })) return;
        A.contacts.push({ tel:t(ct.tel), label:t(ct.label), primary:false });
      });
    }
    if(A.contacts && A.contacts.length && !A.contacts.some(function(x){ return x.primary; })) A.contacts[0].primary = true;

    /* ③ 車を全部①へ移す（写しではなく、そのまま移す＝履歴も伝票も付いてくる） */
    if(!Array.isArray(A.vehicles)) A.vehicles = [];
    (B.vehicles||[]).slice().forEach(function(v){
      記録.車.push(v.id);
      A.vehicles.push(v);
    });
    B.vehicles = [];

    /* ④ ②を指しているカードを①へ付け替える（⚠ 名前は書き換えない＝当時の記録のまま） */
    cards().forEach(function(c){
      if(!c || c.customerId !== B.id) return;
      記録.カード.push({ id:c.id, 前:B.id });
      c.customerId = A.id;
    });

    /* ⑤ ②は消さずアーカイブ */
    B.mergedInto = A.id; B.mergedAt = 記録.at; B.mergeId = 記録.id;
    var 理由 = '統合（主＝' + disp(A) + '）';
    if(w.PitArchive) PitArchive.archiveCust(B.id, 理由);
    else { B.archived = true; B.archivedAt = 記録.at; B.archiveReason = 理由; }

    if(!Array.isArray(A.mergeLog)) A.mergeLog = [];
    A.mergeLog.push(記録);
    A.updatedAt = Date.now(); B.updatedAt = Date.now();
    save();
    if(w.pitOpLog) try{ pitOpLog('顧客を統合', disp(A)+' ← '+記録.fromName+'（車'+記録.車.length+'台・カード'+記録.カード.length+'件）'); }catch(e){}
    return 記録;
  }

  /* 取り消し（🔴 管理者だけ・車の統合と同じ決まり） */
  function undo(mergeId){
    if(w.PitArchive && !PitArchive.canRestore()){ _管理者だけ(); return false; }
    var A = null, 記録 = null;
    custs().forEach(function(c){
      (Array.isArray(c.mergeLog) ? c.mergeLog : []).forEach(function(m){ if(m && m.id===mergeId){ A = c; 記録 = m; } });
    });
    if(!A || !記録){ _記録なし(); return false; }
    var B = findCust(記録.from);

    (記録.欄||[]).forEach(function(x){ if(t(A[x.k])===t(x.後)) A[x.k]=x.前; });
    if(記録.別名 && Array.isArray(A.oldNames)) A.oldNames = A.oldNames.filter(function(x){ return norm(x)!==norm(記録.別名); });
    if(記録.前の連絡先) A.contacts = JSON.parse(JSON.stringify(記録.前の連絡先));
    if(B){
      if(!Array.isArray(B.vehicles)) B.vehicles = [];
      (記録.車||[]).forEach(function(vid){
        var i = (A.vehicles||[]).findIndex(function(v){ return v && v.id===vid; });
        if(i>=0) B.vehicles.push(A.vehicles.splice(i,1)[0]);
      });
    }
    (記録.カード||[]).forEach(function(x){
      var c = cards().find(function(y){ return y && y.id===x.id; });
      if(c && c.customerId===A.id) c.customerId = x.前;
    });
    if(B){
      delete B.mergedInto; delete B.mergedAt; delete B.mergeId;
      if(w.PitArchive) PitArchive.restoreCust(B.id); else { delete B.archived; delete B.archivedAt; delete B.archiveReason; }
    }
    A.mergeLog = (A.mergeLog||[]).filter(function(m){ return m && m.id!==mergeId; });
    A.updatedAt = Date.now(); save();
    if(w.pitOpLog) try{ pitOpLog('顧客の統合を取り消し', 記録.fromName+' を戻した'); }catch(e){}
    return true;
  }

  /* =====================================================================
     画面（1枚・2本の検索）
     ===================================================================== */
  var _st = null;

  /* 🔎 v2.37.0 洗い出し（dup-find.js）から ①② を決め打ちで開けるようにした */
  function open(a, b){
    _st = { 主:'', サブ:'', q1:'', q2:'', 欄:{}, 連絡先:'both' };
    if(a && findCust(a) && !merged(findCust(a))) _st.主 = t(a);
    if(b && findCust(b) && !merged(findCust(b)) && t(b)!==_st.主) _st.サブ = t(b);
    _home();
  }
  function 探す(q){
    /* 🔤 v2.39.0 探す時は旧字・異体字も寄せる（物差しは search.js 1本・写しを作らない） */
    var nz = w.pitSearchNorm || norm;
    var k = nz(q);
    if(k.length < 2) return [];
    return custs().filter(function(c){
      if(!c || merged(c)) return false;
      if(w.PitArchive && PitArchive.custArchived && PitArchive.custArchived(c)) return false;
      if(nz(c.name).indexOf(k)>=0 || nz(c.kana).indexOf(k)>=0) return true;
      if((c.oldNames||[]).some(function(x){ return nz(x).indexOf(k)>=0; })) return true;
      if((c.contacts||[]).some(function(x){ return nz(x.tel).indexOf(k)>=0; })) return true;
      return (c.vehicles||[]).some(function(v){ return nz(v.plate).indexOf(k)>=0 || nz(v.car).indexOf(k)>=0; });
    }).slice(0, 8);
  }
  /* 🔴 v2.36.2（ゆうた指摘）「**車種とかが出なくて分かりにくい。顧客カードをそのまま2枚並べるぐらいの感じがいい**」
     ＝ 名前とTELだけでは、どっちがどっちか決められない。**顧客詳細と同じ中身**を出す。 */
  function 来店(c){
    var a = cards().filter(function(x){ return x && x.customerId===c.id && 済み(x); });
    var 日 = a.map(function(x){ return t(x.completedAt)||t(x.returnDate)||t(x.reserveDate); }).filter(Boolean).sort();
    return { 回:a.length, 最終:(日.length?日[日.length-1].replace(/-/g,'/'):'') };
  }
  /* 🔴 v2.37.3（ゆうた指摘）**Lステップの番号に、URL がまるごと入っていることがある。**
     そのまま出すと長い URL が札からはみ出して読めない。**「Lステップ」と押せる形**にする。
     ⚠ 番号だけの時も同じ見た目にそろえる（現場は番号を読みたいわけではない）。 */
  function _lstepNo(v){
    var x = t(v); if(!x) return '';
    var m = x.match(/(\d{2,})\D*$/);          /* URL の末尾の数字＝顧客番号 */
    return m ? m[1] : (/^https?:/i.test(x) ? '' : x);
  }
  function _lineHtml(c){
    var st = t(c.lineStatus);
    if(st==='ng') return '<span class="um-pill">LINE NG</span>';
    if(st==='ok'){
      var no = _lstepNo(c.lstepId);
      var url = (w.pitLstepUrl && t(c.lstepId)) ? pitLstepUrl(c.lstepId) : '';
      if(url) return '<a class="um-pill ok um-lstep" href="' + esc(url) + '" target="_blank" rel="noopener" '
                   + 'onclick="event.stopPropagation()" title="Lステップを開く">Lステップ' + (no?(' '+esc(no)):'') + '</a>';
      return '<span class="um-pill ok">LINE 登録済' + (no?('（'+esc(no)+'）'):'') + '</span>';
    }
    return '<span class="um-pill mut">LINE 未案内</span>';
  }
  /* 🔎 v2.37.1 このカードは**洗い出しの窓からも使う**（同じ見た目で状況を見せる）＝写しを作らない。
     n を渡さなければ、①②の見出しも「選び直す」も出さない。 */
  function _one(c, n){
    if(!c) return '';
    var vs = liveVehs(c), k = 来店(c);
    var h = '<div class="um-one' + (n?(' on'+n):' plain') + '">';
    if(n) h += '<div class="um-oh"><span class="um-no">' + (n===1?'①':'②') + '</span>'
       + '<span class="um-role">' + (n===1?'残す':'アーカイブへ') + '</span>'
       + '<button class="vm-mini" onclick="PitCustMerge.clear(' + n + ')">選び直す</button></div>';
    h += '<div class="um-name">' + esc(disp(c)) + ' <small>様</small></div>';
    if(t(c.kana)) h += '<div class="um-kana">' + esc(t(c.kana)) + '</div>';
    if((c.oldNames||[]).length) h += '<div class="um-old">旧：' + esc(c.oldNames.join('／')) + '</div>';
    h += '<div class="um-pills"><span class="um-pill mut">来店 ' + k.回 + '回</span>'
       + '<span class="um-pill mut">' + (k.最終?('最終 '+esc(k.最終)):'まだ来店なし') + '</span>'
       + _lineHtml(c) + '</div>';
    h += '<div class="um-line"></div>';
    h += '<div class="um-lab">連絡先</div>';
    if((c.contacts||[]).length){
      h += '<div class="um-cts">' + (c.contacts||[]).map(function(ct){
        return '<div class="um-ct"><b>' + esc(t(ct.tel)||'—') + '</b>'
             + (t(ct.label)?'<span>'+esc(t(ct.label))+'</span>':'')
             + (ct.primary?'<span class="um-pri">優先</span>':'') + '</div>';
      }).join('') + '</div>';
    } else { h += '<div class="um-empty">未登録</div>'; }
    h += '<div class="um-lab">車両 <b>' + vs.length + '台</b></div>';
    if(vs.length){
      h += '<div class="um-vehs">' + vs.map(function(v){
        var nm = ((v.maker?v.maker+' ':'')+(v.car||'')).trim();
        return '<div class="um-veh"><div class="um-vplate">' + esc(t(v.plate) || (v.perVisit?'都度車両変動':'ナンバーなし')) + '</div>'
             + '<div class="um-vcar">' + esc(nm||'—') + '</div>'
             + '<div class="um-vsub">' + (t(v.karteNo)?('カルテ '+esc(t(v.karteNo))):'') 
             + (t(v.vin)?('　車体 '+esc(t(v.vin))):'') 
             + ((v.oldPlates||[]).length?('　旧：'+esc(v.oldPlates.join('／'))):'') + '</div></div>';
      }).join('') + '</div>';
    } else { h += '<div class="um-empty">未登録</div>'; }
    h += '</div>';
    return h;
  }
  /* 🔴 v2.36.1（ゆうた報告）**検索欄そのものを作り直さない。**
     ◎何が起きていたか
       1文字打つたびに窓を丸ごと描き直していたので、**入力欄が新しく作られて IME の変換が飛んだ**
       （「こ」と打つと「k」で切れる）。
     🔴 直し＝**打っている間に描き直すのは候補の並びだけ**。入力欄はそのまま置いておく。
     ⚠ 顧客一覧の検索でも同じ事故を踏んでいる（v0.37.5「検索のIME割れ修正」）。**同じ轍を踏まない。** */
  function _listHtml(n){
    var q = n===1 ? _st.q1 : _st.q2;
    if(norm(q).length < 2) return '';
    var r = 探す(q), h = '';
    if(!r.length) h += '<div class="um-none">見つかりません</div>';
    r.forEach(function(c){
      var 済 = (n===1 ? _st.サブ : _st.主) === c.id;
      /* 🔴 候補の並びにも**車種とナンバー**を出す（名前とTELだけでは選べない） */
      var vs = liveVehs(c);
      var 車 = vs.slice(0,2).map(function(v){
        var nm = ((v.maker?v.maker+' ':'')+(v.car||'')).trim();
        return (t(v.plate)||(v.perVisit?'都度車両変動':'ナンバーなし')) + (nm?('・'+nm):'');
      }).join('／') + (vs.length>2?('　ほか'+(vs.length-2)+'台'):'');
      h += '<button class="um-row"' + (済?' disabled title="もう片方で選ばれています"':'') + ' onclick="PitCustMerge.pick(' + n + ',\'' + esc(c.id) + '\')">'
         + '<b>' + esc(disp(c)) + '</b><span class="um-sub">' + esc(t(c.kana)) + '　' + esc(primaryTel(c) || 'TELなし')
         + ((c.oldNames||[]).length?('　旧：'+esc(c.oldNames.join('／'))):'') + '</span>'
         + '<span class="um-sub2">' + esc(車 || '車の登録なし') + '</span></button>';
    });
    return h;
  }
  function _search(n){
    var q = n===1 ? _st.q1 : _st.q2;
    return '<div class="um-sec">' + (n===1?'① <b>残す方</b>を探す':'② <b>寄せる方</b>を探す（アーカイブに移ります）') + '</div>'
      + '<input class="um-input" id="um-q' + n + '" value="' + esc(q) + '" placeholder="名前・カナ・電話・ナンバーで探す（2文字以上）"'
      + ' autocomplete="off" oninput="PitCustMerge.q(' + n + ',this.value)">'
      + '<div class="um-list" id="um-list' + n + '">' + _listHtml(n) + '</div>';
  }
  /* 打っている間はここだけ差し替える（入力欄には触らない） */
  function _paint(n){
    var box = d.getElementById('um-list' + n);
    if(!box) return _home();          /* 窓の形が変わっている時だけ描き直す */
    box.innerHTML = _listHtml(n);
    if(w.pitIcons) try{ pitIcons(box); }catch(e){}
  }

  function _home(){
    if(!_st) return;
    var A = findCust(_st.主), B = findCust(_st.サブ);
    var P = (A && B) ? plan(A.id, B.id) : null;
    var canR = !(w.PitArchive) || PitArchive.canRestore();

    var h = '<div class="cm-head"><i data-ic=link data-ics=16></i> お客様をまとめる'
          + '<span class="cm-sub">同じ方が2人に分かれている時</span>'
          + '<button class="cm-x" onclick="custCloseModal()"><i data-ic=close data-ics=16></i></button></div>';
    h += '<div class="cm-body">';
    h += '<div class="vm-note"><b>①＝残す方</b>、<b>②＝寄せる方</b>を、それぞれ探して選んでください。'
       + '②は<b>消えません</b>（アーカイブに移るだけ）。車も予約も履歴も①へ付いてきます。<br>'
       + '⚠ <b>別の方どうしには使いません。</b>ご家族・同姓同名は別のお客様です。</div>';

    h += '<div class="um-2">';
    h += '<div class="um-col">' + (A ? _one(A,1) : _search(1)) + '</div>';
    h += '<div class="um-col">' + (B ? _one(B,2) : _search(2)) + '</div>';
    h += '</div>';

    if(P){
      h += '<div class="vm-sum">'
         + '<div class="vm-sumi"><b>' + (P.車.主 + P.車.サブ) + '</b><span>①になる車</span></div>'
         + '<div class="vm-sumi"><b>' + P.カード + '</b><span>付け替えるカード</span></div>'
         + '<div class="vm-sumi' + (P.予約.length?' hot':'') + '"><b>' + P.予約.length + '</b><span>かかっている予約</span></div>'
         + '<div class="vm-sumi' + (P.車.かぶり.length?' hot':'') + '"><b>' + P.車.かぶり.length + '</b><span>同じナンバー</span></div>'
         + '</div>';

      if(P.予約.length){
        h += '<div class="vm-sec">かかっている予約（まだ終わっていないもの）</div><div class="vm-resv">';
        P.予約.forEach(function(r){
          h += '<div class="vm-rsv"><span class="vm-pn on2">②</span><b>' + esc(r.resNo||'（番号なし）') + '</b>'
             + '<span class="vm-pcar">' + esc(r.plate||'ナンバーなし') + '</span>'
             + '<span class="vm-rsvto">①のお客様のまま残ります</span></div>';
        });
        h += '</div>';
      }

      h += '<div class="vm-sec">どちらを残すか</div>';
      if(P.rows.length){
        h += '<div class="vm-rows">';
        P.rows.forEach(function(r){
          var 選 = _st.欄[r.k] || r.既定;
          h += '<div class="vm-row"><div class="vm-rl">' + esc(r.l)
             + (r.種類==='空埋め'?'<span class="vm-rt">①が空</span>':'') + '</div>'
             + '<button class="vm-opt' + (選==='main'?' on':'') + '" onclick="PitCustMerge.setField(\'' + esc(r.k) + '\',\'main\')"><i>①</i>' + esc(r.主||'（空）') + '</button>'
             + '<button class="vm-opt' + (選==='sub'?' on':'') + '" onclick="PitCustMerge.setField(\'' + esc(r.k) + '\',\'sub\')"><i>②</i>' + esc(r.サブ||'（空）') + '</button></div>';
        });
        h += '</div>';
      } else {
        h += '<div class="vm-none">食い違う欄はありません。</div>';
      }

      /* 連絡先＝「どっちも残す」が既定（ゆうた指定） */
      h += '<div class="vm-row"><div class="vm-rl">連絡先</div>'
         + '<button class="vm-opt' + (_st.連絡先==='main'?' on':'') + '" onclick="PitCustMerge.setTel(\'main\')"><i>①</i>' + esc(P.連絡先.主.join('／')||'（なし）') + '</button>'
         + '<button class="vm-opt' + (_st.連絡先==='sub'?' on':'') + '" onclick="PitCustMerge.setTel(\'sub\')"><i>②</i>' + esc(P.連絡先.サブ.join('／')||'（なし）') + '</button></div>'
         + '<div class="vm-row"><div class="vm-rl"></div>'
         + '<button class="vm-opt both' + (_st.連絡先==='both'?' on':'') + '" onclick="PitCustMerge.setTel(\'both\')"><i>①②</i>どっちも残す（優先＝①）</button></div>'
         + '<p class="mg-note">⚠ 連絡先は「どっちも残す」が既定です。消すのは人が決めた時だけ。</p>';

      if(P.車.かぶり.length){
        h += '<div class="vm-note" style="border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.07)">'
           + '⚠ <b>同じナンバーの車が両方にいます</b>（' + esc(P.車.かぶり.join('／')) + '）。'
           + 'まとめたあと、そのまま<b>「車をまとめる」</b>の窓を開きます。</div>';
      }
    }

    /* まとめた記録 */
    var logs = [];
    custs().forEach(function(c){ (Array.isArray(c.mergeLog)?c.mergeLog:[]).forEach(function(m){ if(m&&m.from) logs.push({主:c, 記録:m}); }); });
    logs.sort(function(a,b){ return (b.記録.at||0)-(a.記録.at||0); });
    if(logs.length){
      h += '<div class="vm-sec">まとめた記録</div><div class="vm-logs">';
      logs.slice(0,8).forEach(function(x){
        var dt=new Date(x.記録.at||0), p2=function(n){ return (n<10?'0':'')+n; };
        h += '<div class="vm-log"><div class="vm-logmain"><b>' + esc(disp(x.主)) + '</b> ← ' + esc(x.記録.fromName||'')
           + '<span class="vm-logsub">' + dt.getFullYear()+'/'+(dt.getMonth()+1)+'/'+dt.getDate()+' '+p2(dt.getHours())+':'+p2(dt.getMinutes())
           + (x.記録.by?('　'+esc(x.記録.by)):'') + '　車' + (x.記録.車||[]).length + '台・カード' + (x.記録.カード||[]).length + '件</span></div>'
           + (canR ? '<button class="vm-undo" onclick="PitCustMerge.undoAsk(\'' + esc(x.記録.id) + '\')">取り消す</button>'
                   : '<span class="vm-lock">管理者だけ</span>') + '</div>';
      });
      h += '</div>';
    }

    h += '</div><div class="cm-foot"><button class="cm-cancel" onclick="custCloseModal()">閉じる</button>'
       + (P ? '<button class="cm-save" onclick="PitCustMerge.go()">この2人をまとめる</button>' : '') + '</div>';
    if(w.custShowModal) custShowModal(h, 'vm-box um-box');
  }

  function go(){
    if(!_st || !_st.主 || !_st.サブ) return;
    var P = plan(_st.主, _st.サブ); if(!P) return;
    var telTxt = _st.連絡先==='both' ? '2件とも残す（優先＝①）'
               : (_st.連絡先==='main' ? '①のものだけ' : '②のものだけ');
    var det = ['① 残す　' + disp(P.A) + '（' + (primaryTel(P.A)||'TELなし') + '・車 ' + P.車.主 + '台）',
               '② 寄せる　' + disp(P.B) + '（' + (primaryTel(P.B)||'TELなし') + '・車 ' + P.車.サブ + '台）→ アーカイブへ（消えません）',
               '・②の車 ' + P.車.サブ + '台 が①へ移ります',
               '・②のカード ' + P.カード + '件 が①のお客様になります（当時の名前は書き換えません）',
               '・連絡先は ' + telTxt,
               '・②のお名前は「別名」として残り、検索で当たります'];
    if(P.予約.length){
      det.push('・かかっている予約 ' + P.予約.length + '件 は残ります：');
      P.予約.slice(0,6).forEach(function(r){ det.push('　　' + (r.resNo||'（番号なし）') + ' → ①のお客様のまま'); });
      if(P.予約.length>6) det.push('　　…ほか ' + (P.予約.length-6) + '件');
    }
    if(P.車.かぶり.length) det.push('⚠ 同じナンバーの車が両方にいます（' + P.車.かぶり.join('／') + '）。このあと「車をまとめる」を開きます');
    det.push('⚠ 取り消せるのは管理者だけです');
    var ask = w.pitAsk ? pitAsk('①に②をまとめます。よろしいですか？', { detail:det, ok:'まとめる' }) : Promise.resolve(true);
    ask.then(function(yes){
      if(!yes) return;
      var かぶり = P.車.かぶり.length, aid = _st.主;
      var 記録 = apply(_st.主, _st.サブ, { 欄:_st.欄, 連絡先:_st.連絡先 });
      if(!記録) return;
      toast('まとめました');
      if(w.renderCustomers) try{ renderCustomers(); }catch(e){}
      /* 🔴 v2.37.3（ゆうた指定）「**統合した後に、検索画面に戻ってほしい。つぎつぎ行きたい**」
         ＝ 顧客詳細へは行かない。**まとめる窓を空で開き直す**（＝2本の検索画面）。
         ⚠ 同じナンバーが両方に居た時だけは、先に「車をまとめる」へ渡す（そこは片づけないと残るので）。 */
      if(かぶり && w.PitVehMerge){ _st = null; PitVehMerge.open(aid); }
      else open();
    });
  }

  function undoAsk(mergeId){
    var 記録 = null;
    custs().forEach(function(c){ (Array.isArray(c.mergeLog)?c.mergeLog:[]).forEach(function(m){ if(m&&m.id===mergeId) 記録=m; }); });
    if(!記録){ _記録なし(); return; }
    var det = ['・②「' + (記録.fromName||'') + '」をアーカイブから戻します',
               '・移した車 ' + (記録.車||[]).length + '台 を②へ返します',
               '・付け替えたカード ' + (記録.カード||[]).length + '件 を②へ戻します',
               '⚠ まとめたあとで人が直した値は、そのまま残します'];
    var ask = w.pitAsk ? pitAsk('この統合を取り消しますか？', { detail:det, ok:'取り消す', danger:true }) : Promise.resolve(true);
    ask.then(function(yes){
      if(!yes) return;
      if(!undo(mergeId)) return;
      toast('統合を取り消しました');
      if(w.renderCustomers) try{ renderCustomers(); }catch(e){}
      _st = _st || { 主:'', サブ:'', q1:'', q2:'', 欄:{}, 連絡先:'both' };
      _home();
    });
  }

  w.PitCustMerge = {
    open: open, plan: plan, apply: apply, undo: undo, undoAsk: undoAsk, go: go, 探す: 探す,
    /* 🔴 打っている間は窓を描き直さない（IMEが飛ぶ）＝候補の並びだけ差し替える */
    カード:   function(c){ return _one(c, 0); },   /* 洗い出しの窓から借りる（同じ見た目） */
    q:        function(n, v){ if(!_st) return; if(n===1) _st.q1=v; else _st.q2=v; _paint(n); },
    pick:     function(n, id){ if(!_st) return; if(n===1) _st.主=id; else _st.サブ=id; _st.欄={}; _home(); },
    clear:    function(n){ if(!_st) return; if(n===1){ _st.主=''; _st.q1=''; } else { _st.サブ=''; _st.q2=''; } _st.欄={}; _home(); },
    setField: function(k, which){ if(!_st) return; _st.欄[k]=which; _home(); },
    setTel:   function(v){ if(!_st) return; _st.連絡先=v; _home(); }
  };
})(window, document);

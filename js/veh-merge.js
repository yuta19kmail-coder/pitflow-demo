/* ========================================
   veh-merge.js ── 🚗 同じ車が2件に分かれている時、1台にまとめる（PitFlow v2.31.0）
   ----------------------------------------
   ◎なぜ作ったか（2026-08-30・ゆうた指定）
     🗣「複数台として登録されている車両の統合。**顧客はいじらない。**
     　　A と B があった時に **主とサブを決めて、主の車両にサブの履歴やその他情報を入れる**イメージ」

   ◎決めごと
     🔴 **顧客はまたがない。** まとめられるのは**同じお客様の中の2台**だけ。
        （別のお客様どうしをまとめるのは、顧客の統合＝別もの）
     🔴 **サブは消さない。アーカイブするだけ。** 中身もそのまま残す＝**持っていくのは写しだけ。**
        だから取り消せる（`PitVehMerge.undo`・**管理者だけ**＝アーカイブの決まりに合わせる）。
     🔴 **食い違う欄は黙って上書きしない。** 一覧で出して、主かサブかを選ばせる。
        主が空でサブに入っている欄だけ、既定で「サブを採る」。
     🔴🔴 **サブのナンバーの扱いは毎回選ばせる**（ゆうた指定 2026-08-30）
        ・**ナンバー変更** → 主に「**旧ナンバー**」として持たせる。**過去のカードは書き換えない**
          （当時の伝票・紙と食い違わせない）
        ・**登録間違い**   → 旧ナンバーは残さず、そのナンバーの**カードを主のナンバーに直す**
        ⚠ どちらでも履歴は主に付く。**どちらも選ばないと、過去のカードが行方不明になる。**

   ◎🔴 いちばんの勘どころ＝**来店履歴はナンバーで引いている**
     `customers.js` の `_histCards` / `_custCardsAll` はカードの**ナンバー**で車を探す。
     だから旧ナンバーも引き当てに効かせる＝**`pitVehPlates(車)` 1本を通す。写しを作らない。**

   ◎外から呼ぶもの
     PitVehMerge.open(顧客id, 主の車id)      … 画面を開く（顧客詳細の車カードから）
     PitVehMerge.plan(顧客id, 主id, サブid)  … 何が起きるかを先に出す（画面を持たない＝見張れる）
     PitVehMerge.apply(顧客id, 主id, サブid, 選択) … 実際にまとめる。戻り値＝記録（取り消しの鍵）
     PitVehMerge.undo(顧客id, 記録id)        … 取り消し（管理者だけ）
   ======================================== */
(function (w, d) {
  'use strict';

  function t(x){ return String(x == null ? '' : x).trim(); }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function num(x){ var n = Number(String(x==null?'':x).replace(/[^0-9.-]/g,'')); return isFinite(n)?n:0; }
  function norm(s){ return String(s==null?'':s).replace(/\s+/g,'').toLowerCase(); }
  function custs(){ return (w.state && state.customers) || []; }
  function cards(){ return (w.state && state.cards) || []; }
  /* 🔴 「0」「なし」「新規車両」などは車を見分ける鍵にしない＝物差しは customers.js 1本 */
  function realPlate(p){ return w.pitIsRealPlate ? pitIsRealPlate(p) : !!t(p); }
  function findCust(id){ return custs().find(function(x){ return x && x.id===id; }) || null; }
  function findVeh(cust, id){ return ((cust && cust.vehicles)||[]).find(function(v){ return v && v.id===id; }) || null; }
  function save(){ if (w.PitDB) PitDB.save(); }
  function meName(){ try { if (w.pitCurrentStaffName) return pitCurrentStaffName()||''; } catch(e){} return ''; }
  function toast(m, code){ if (w.pitToast) pitToast(m, code); }

  /* ---------- 🔴 車を見分けるナンバー＝いまのナンバー＋旧ナンバー（ここ1本） ---------- */
  function platesOf(v){
    var out=[];
    if(!v) return out;
    if(realPlate(v.plate)) out.push(t(v.plate));
    (Array.isArray(v.oldPlates)?v.oldPlates:[]).forEach(function(p){
      if(realPlate(p) && out.every(function(x){ return norm(x)!==norm(p); })) out.push(t(p));
    });
    return out;
  }
  w.pitVehPlates = platesOf;
  /* まとめられて残っているだけの車（＝主に吸収済み）。呼び出し・引き当ての対象にしない */
  function merged(v){ return !!(v && v.mergedInto); }
  w.pitVehMerged = merged;

  /* ---------- 見くらべる欄 ---------- */
  function boardLabel(v){ return v==='import'?'輸入車':(v==='default'?'国産車':t(v)); }
  function divLabel(v){ var dv=((w.state&&state.divisions)||[]).find(function(x){ return x.id===v; }); return dv?dv.label:t(v); }
  var FIELDS = [
    { k:'maker',      l:'メーカー' },
    { k:'car',        l:'車種' },
    { k:'karteNo',    l:'カルテNo' },
    { k:'vin',        l:'車体番号' },
    { k:'boardId',    l:'国産／輸入',   disp: boardLabel },
    { k:'division',   l:'課',           disp: divLabel },
    { k:'frontStaff', l:'フロント担当', pair:'frontStaffId' }
  ];
  function fieldOf(k){ return FIELDS.find(function(x){ return x.k===k; }) || null; }

  /* 伝票1枚を見わける鍵＝伝票番号＋売上日＋金額（同じ車の中なのでナンバーは要らない） */
  function slipKey(x){ return t(x && (x.伝票番号 || x.伝票)) + '|' + t(x && x.売上日) + '|' + num(x && x.金額); }

  /* =====================================================================
     何が起きるかを先に出す（画面を持たない＝見張りから直接たたける）
     ===================================================================== */
  function plan(custId, mainId, subId){
    var cust = findCust(custId); if(!cust) return null;
    var main = findVeh(cust, mainId), sub = findVeh(cust, subId);
    if(!main || !sub || main === sub) return null;

    var 主plate = realPlate(main.plate), サブplate = realPlate(sub.plate);
    var rows = [];
    /* 主がナンバーを持っていない時だけ、ナンバーも「欄」として選ばせる
       （＝「新規車両」で先に登録して、あとで本ナンバーで登録し直した形） */
    if(!主plate && サブplate){
      rows.push({ k:'plate', l:'ナンバー', 主:'', サブ:t(sub.plate), 既定:'sub', 種類:'空埋め' });
    }
    FIELDS.forEach(function(f){
      var a = t(main[f.k]), b = t(sub[f.k]);
      if(!b) return;      /* サブに何も無ければ話が無い */
      if(a === b) return; /* 同じなら出さない */
      rows.push({ k:f.k, l:f.l,
                  主:(f.disp?f.disp(a):a), サブ:(f.disp?f.disp(b):b),
                  既定:(a ? 'main' : 'sub'), 種類:(a ? '食い違い' : '空埋め') });
    });

    var 主伝票 = Array.isArray(main.伝票) ? main.伝票 : [];
    var サブ伝票 = Array.isArray(sub.伝票) ? sub.伝票 : [];
    var have = {}; 主伝票.forEach(function(x){ have[slipKey(x)] = 1; });
    var 足す = サブ伝票.filter(function(x){ return !have[slipKey(x)]; });

    var pl = サブplate ? cards().filter(function(c){ return c && realPlate(c.plate) && norm(c.plate)===norm(sub.plate); }) : [];
    var vi = cards().filter(function(c){ return c && c.vehId && c.vehId===sub.id; });

    return { cust:cust, main:main, sub:sub, rows:rows,
             伝票:{ 主:主伝票.length, サブ:サブ伝票.length, 足す:足す.length, 重なり:(サブ伝票.length - 足す.length) },
             カード:{ ナンバー:pl.length, 紐づけ:vi.length },
             ナンバーを選ぶ:(主plate && サブplate) };
  }

  /* =====================================================================
     まとめる
     選択 = { 欄:{ 欄名:'main'|'sub' }, ナンバー:'旧として残す'|'捨てる' }
     ===================================================================== */
  function apply(custId, mainId, subId, 選択){
    選択 = 選択 || {};
    var P = plan(custId, mainId, subId);
    if(!P){ toast('まとめられませんでした（車が見つかりません）', 'PF-6004'); return null; }
    if(P.ナンバーを選ぶ && !選択.ナンバー){ toast('サブのナンバーの扱いを選んでください', 'PF-6005'); return null; }
    var cust = P.cust, main = P.main, sub = P.sub;

    var 記録 = { id:'mg'+Date.now()+Math.floor(Math.random()*1000), at:Date.now(), by:meName(),
                 from:sub.id, fromPlate:t(sub.plate), 欄:[], 伝票:[], カード:[], ナンバー:'' };

    /* ① 欄（選ばれたものだけ・前の値を控える） */
    (P.rows || []).forEach(function(r){
      var 選ぶ = (選択.欄 && 選択.欄[r.k]) || r.既定;
      if(選ぶ !== 'sub') return;
      記録.欄.push({ k:r.k, 前:(main[r.k]==null?'':main[r.k]), 後:sub[r.k] });
      main[r.k] = sub[r.k];
      var f = fieldOf(r.k);
      if(f && f.pair){
        記録.欄.push({ k:f.pair, 前:(main[f.pair]==null?'':main[f.pair]), 後:(sub[f.pair]||'') });
        main[f.pair] = sub[f.pair] || '';
      }
    });

    /* ② 伝票（重なっているものは足さない・売上日の新しい順にそろえる） */
    if(!Array.isArray(main.伝票)) main.伝票 = [];
    var have = {}; main.伝票.forEach(function(x){ have[slipKey(x)] = 1; });
    (Array.isArray(sub.伝票) ? sub.伝票 : []).forEach(function(x){
      var k = slipKey(x); if(have[k]) return; have[k] = 1;
      main.伝票.push(JSON.parse(JSON.stringify(x)));
      記録.伝票.push(k);
    });
    main.伝票.sort(function(a,b){ return t(b.売上日).localeCompare(t(a.売上日)); });

    /* ③ サブのナンバー（両方が本物のナンバーを持っている時だけ） */
    if(P.ナンバーを選ぶ){
      記録.ナンバー = 選択.ナンバー;
      if(選択.ナンバー === '旧として残す'){
        if(!Array.isArray(main.oldPlates)) main.oldPlates = [];
        if(main.oldPlates.every(function(p){ return norm(p)!==norm(sub.plate); })) main.oldPlates.push(t(sub.plate));
      } else {
        /* 登録間違い＝そのナンバーのカードを主のナンバーに直す（前の値は記録に残す） */
        cards().forEach(function(c){
          if(!c || !realPlate(c.plate) || norm(c.plate)!==norm(sub.plate)) return;
          記録.カード.push({ id:c.id, 前plate:c.plate, 後plate:t(main.plate) });
          c.plate = t(main.plate);
        });
      }
    }

    /* ④ 車の紐づけ（vehId）を主へ寄せる */
    cards().forEach(function(c){
      if(!c || !c.vehId || c.vehId!==sub.id) return;
      記録.カード.push({ id:c.id, 前vehId:sub.id, 後vehId:main.id });
      c.vehId = main.id;
    });

    /* ⑤ サブは消さずアーカイブ（中身はそのまま＝取り消しの道） */
    sub.mergedInto = main.id; sub.mergedAt = 記録.at; sub.mergeId = 記録.id;
    var 理由 = '統合（主＝' + (t(main.plate) || t(main.car) || 'この車') + '）';
    if(w.PitArchive) PitArchive.archiveVeh(cust.id, sub.id, 理由);
    else { sub.archived = true; sub.archivedAt = 記録.at; sub.archiveReason = 理由; }

    if(!Array.isArray(main.mergeLog)) main.mergeLog = [];
    main.mergeLog.push(記録);
    main.updatedAt = Date.now(); cust.updatedAt = Date.now();
    save();
    if(w.pitOpLog) try {
      pitOpLog('車両を統合',
        ((w.pitCustDispName ? pitCustDispName(cust) : (cust.name||'')) || '') +
        ' / 主 ' + (t(main.plate) || t(main.car) || '—') +
        ' ← サブ ' + (記録.fromPlate || t(sub.car) || '—') +
        (記録.ナンバー ? ('（' + 記録.ナンバー + '）') : ''));
    } catch(e){}
    return 記録;
  }

  /* =====================================================================
     取り消し（🔴 管理者だけ＝アーカイブを戻すのと同じ決まり）
     ⚠ 「そのままの姿」でなければ触らない＝あとから人が直した値は上書きしない
     ===================================================================== */
  function undo(custId, mergeId){
    if(w.PitArchive && !PitArchive.canRestore()){ toast('統合を取り消せるのは管理者だけです', 'PF-6006'); return false; }
    var cust = findCust(custId); if(!cust) return false;
    var main = null, 記録 = null;
    (cust.vehicles || []).forEach(function(v){
      (Array.isArray(v.mergeLog) ? v.mergeLog : []).forEach(function(m){ if(m && m.id===mergeId){ main = v; 記録 = m; } });
    });
    if(!main || !記録){ toast('取り消す記録が見つかりません', 'PF-6007'); return false; }
    var sub = findVeh(cust, 記録.from);

    (記録.欄 || []).forEach(function(x){ if(t(main[x.k]) === t(x.後)) main[x.k] = x.前; });

    var けす = {}; (記録.伝票 || []).forEach(function(k){ けす[k] = 1; });
    if(Array.isArray(main.伝票)) main.伝票 = main.伝票.filter(function(x){ return !けす[slipKey(x)]; });

    if(記録.ナンバー === '旧として残す' && Array.isArray(main.oldPlates))
      main.oldPlates = main.oldPlates.filter(function(p){ return norm(p) !== norm(記録.fromPlate); });

    (記録.カード || []).forEach(function(x){
      var c = cards().find(function(y){ return y && y.id===x.id; }); if(!c) return;
      if(x.後plate != null && t(c.plate) === t(x.後plate)) c.plate = x.前plate;
      if(x.後vehId != null && c.vehId === x.後vehId)       c.vehId = x.前vehId;
    });

    if(sub){
      delete sub.mergedInto; delete sub.mergedAt; delete sub.mergeId;
      if(w.PitArchive) PitArchive.restoreVeh(cust.id, sub.id);
      else { delete sub.archived; delete sub.archivedAt; delete sub.archiveReason; }
    }
    main.mergeLog = (main.mergeLog || []).filter(function(m){ return m && m.id !== mergeId; });
    main.updatedAt = Date.now(); cust.updatedAt = Date.now();
    save();
    if(w.pitOpLog) try { pitOpLog('車両の統合を取り消し', (記録.fromPlate || '') + ' を戻した'); } catch(e){}
    return true;
  }

  /* =====================================================================
     画面
     ===================================================================== */
  var _st = null;

  function vehTitle(v){
    var nm = ((v.maker ? v.maker + ' ' : '') + (v.car || '')).trim();
    return (t(v.plate) || (v.perVisit ? '都度車両変動' : 'ナンバーなし')) + (nm ? '（' + nm + '）' : '');
  }

  function open(custId, mainId){
    var cust = findCust(custId); if(!cust) return;
    var main = findVeh(cust, mainId); if(!main) return;
    var ほか = (cust.vehicles || []).filter(function(v){ return v && v.id !== mainId && !merged(v); });
    if(!ほか.length){ toast('まとめられる車が、このお客様には他にありません', 'PF-6004'); return; }
    _st = { custId:custId, mainId:mainId, subId:'', 欄:{}, ナンバー:'' };
    if(ほか.length === 1){ _st.subId = ほか[0].id; return _form(); }
    _pick(cust, main, ほか);
  }

  function _head(sub){
    return '<div class="cm-head"><i data-ic=car data-ics=16></i> 車をまとめる'
         + '<span class="cm-sub">' + esc(sub || '同じ車が2件に分かれている時') + '</span>'
         + '<button class="cm-x" onclick="custCloseModal()"><i data-ic=close data-ics=16></i></button></div>';
  }

  function _pick(cust, main, ほか){
    var h = _head('主＝' + vehTitle(main));
    h += '<div class="cm-body"><div class="vm-note">この車に<b>まとめる相手（サブ）</b>を選んでください。'
       + 'サブは<b>消えません</b>。アーカイブに移して、履歴と足りない欄を主へ写します。</div><div class="vm-pick">';
    ほか.forEach(function(v){
      var arc = (w.PitArchive ? PitArchive.vehSelfArchived(v) : !!v.archived);
      h += '<button class="vm-pickrow" onclick="PitVehMerge.pick(\'' + esc(v.id) + '\')">'
         + '<span class="vm-pplate">' + esc(t(v.plate) || (v.perVisit ? '都度車両変動' : 'ナンバーなし')) + '</span>'
         + '<span class="vm-pcar">' + esc(((v.maker ? v.maker + ' ' : '') + (v.car || '')).trim() || '—') + '</span>'
         + (v.karteNo ? '<span class="vm-ptag">カルテ ' + esc(v.karteNo) + '</span>' : '')
         + (arc ? '<span class="vm-ptag arch">アーカイブ済み</span>' : '')
         + '</button>';
    });
    h += '</div></div><div class="cm-foot"><button class="cm-cancel" onclick="custCloseModal()">キャンセル</button></div>';
    if(w.custShowModal) custShowModal(h, 'vm-box');
  }

  function _form(){
    if(!_st) return;
    var P = plan(_st.custId, _st.mainId, _st.subId);
    if(!P){ toast('まとめられませんでした（車が見つかりません）', 'PF-6004'); return; }

    var h = _head('主＝' + vehTitle(P.main) + '　←　サブ＝' + vehTitle(P.sub));
    h += '<div class="cm-body">';

    /* 何が動くか（先に出す） */
    h += '<div class="vm-sum">'
       + '<div class="vm-sumi"><b>' + P.伝票.足す + '</b><span>足す伝票</span></div>'
       + '<div class="vm-sumi"><b>' + P.伝票.重なり + '</b><span>重なり（足さない）</span></div>'
       + '<div class="vm-sumi"><b>' + (P.カード.ナンバー + P.カード.紐づけ) + '</b><span>関わるカード</span></div>'
       + '<div class="vm-sumi"><b>' + P.rows.length + '</b><span>選ぶ欄</span></div>'
       + '</div>';

    /* 食い違う欄 */
    if(P.rows.length){
      h += '<div class="vm-sec">どちらを残すか</div><div class="vm-rows">';
      P.rows.forEach(function(r){
        var 選 = _st.欄[r.k] || r.既定;
        h += '<div class="vm-row"><div class="vm-rl">' + esc(r.l)
           + (r.種類 === '空埋め' ? '<span class="vm-rt">主が空</span>' : '') + '</div>'
           + '<button class="vm-opt' + (選==='main'?' on':'') + '" onclick="PitVehMerge.setField(\'' + esc(r.k) + '\',\'main\')">'
           + '<i>主</i>' + esc(r.主 || '（空）') + '</button>'
           + '<button class="vm-opt' + (選==='sub'?' on':'') + '" onclick="PitVehMerge.setField(\'' + esc(r.k) + '\',\'sub\')">'
           + '<i>サブ</i>' + esc(r.サブ || '（空）') + '</button></div>';
      });
      h += '</div>';
    } else {
      h += '<div class="vm-none">食い違う欄はありません。履歴だけを主へ寄せます。</div>';
    }

    /* サブのナンバーの扱い */
    if(P.ナンバーを選ぶ){
      h += '<div class="vm-sec">サブのナンバー「' + esc(t(P.sub.plate)) + '」をどうするか　<span class="vm-must">選んでください</span></div>'
         + '<div class="vm-plate">'
         + '<button class="vm-pl' + (_st.ナンバー==='旧として残す'?' on':'') + '" onclick="PitVehMerge.setPlate(\'旧として残す\')">'
         + '<b>ナンバー変更だった</b><span>主に<b>旧ナンバー</b>として持たせます。過去のカードは<b>書き換えません</b>（当時の伝票と食い違わせない）。履歴は旧ナンバーでも主に付きます。</span></button>'
         + '<button class="vm-pl' + (_st.ナンバー==='捨てる'?' on':'') + '" onclick="PitVehMerge.setPlate(\'捨てる\')">'
         + '<b>登録間違いだった</b><span>旧ナンバーは残しません。このナンバーのカード <b>' + P.カード.ナンバー + '件</b> を、主のナンバー「' + esc(t(P.main.plate)) + '」に直します。</span></button>'
         + '</div>';
    }

    h += '</div><div class="cm-foot">'
       + '<button class="cm-cancel" onclick="custCloseModal()">キャンセル</button>'
       + '<button class="cm-save" onclick="PitVehMerge.go()">まとめる</button></div>';
    if(w.custShowModal) custShowModal(h, 'vm-box');
  }

  function go(){
    if(!_st) return;
    var P = plan(_st.custId, _st.mainId, _st.subId); if(!P) return;
    if(P.ナンバーを選ぶ && !_st.ナンバー){ toast('サブのナンバーの扱いを選んでください', 'PF-6005'); return; }
    var det = ['・サブ「' + (t(P.sub.plate) || '（ナンバーなし）') + '」はアーカイブに移ります（消えません）',
               '・伝票を ' + P.伝票.足す + '件 主へ写します',
               '・カード ' + (P.カード.ナンバー + P.カード.紐づけ) + '件 が主の車を指すようになります'];
    if(P.ナンバーを選ぶ) det.push('・ナンバーは「' + _st.ナンバー + '」で処理します');
    det.push('・取り消せるのは管理者だけです');
    var ask = w.pitAsk ? pitAsk('この2台を1台にまとめますか？', { title:'車をまとめる', detail:det, ok:'まとめる' })
                       : Promise.resolve(true);
    ask.then(function(yes){
      if(!yes) return;
      var 記録 = apply(_st.custId, _st.mainId, _st.subId, { 欄:_st.欄, ナンバー:_st.ナンバー });
      if(!記録) return;
      var cid = _st.custId; _st = null;
      if(w.custCloseModal) custCloseModal();
      if(w.custOpen) custOpen(cid);
      toast('まとめました');
    });
  }

  /* 取り消しの入口（顧客詳細の車カード・管理者だけに出る）
     ⚠ **いちばん新しい1件から**戻す。まとめて戻さない＝1回ずつ確かめられるように。 */
  function undoAsk(custId, mainId){
    var cust = findCust(custId); if(!cust) return;
    var main = findVeh(cust, mainId); if(!main) return;
    var log = Array.isArray(main.mergeLog) ? main.mergeLog : [];
    var 記録 = log[log.length - 1];
    if(!記録){ toast('取り消す記録がありません', 'PF-6007'); return; }
    var det = ['・サブ「' + (記録.fromPlate || '（ナンバーなし）') + '」をアーカイブから戻します',
               '・写した伝票 ' + (記録.伝票 || []).length + '件 を主から外します',
               '・直したカード ' + (記録.カード || []).length + '件 を元に戻します',
               '⚠ 統合のあとで人が直した値は、そのまま残します（勝手に上書きしない）'];
    var ask = w.pitAsk ? pitAsk('この統合を取り消しますか？', { title:'統合を取り消す', detail:det, ok:'取り消す', danger:true })
                       : Promise.resolve(true);
    ask.then(function(yes){
      if(!yes) return;
      if(!undo(custId, 記録.id)) return;
      if(w.custCloseModal) custCloseModal();
      if(w.custOpen) custOpen(custId);
      toast('統合を取り消しました');
    });
  }

  w.PitVehMerge = {
    open: open, plan: plan, apply: apply, undo: undo, undoAsk: undoAsk, go: go,
    platesOf: platesOf,
    pick: function(id){ if(!_st) return; _st.subId = id; _st.欄 = {}; _st.ナンバー = ''; _form(); },
    setField: function(k, which){ if(!_st) return; _st.欄[k] = which; _form(); },
    setPlate: function(v){ if(!_st) return; _st.ナンバー = v; _form(); }
  };
})(window, document);

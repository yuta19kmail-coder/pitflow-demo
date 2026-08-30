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

    /* 🔴🔴 2026-08-30 ゆうた「**それに伴う予約がある場合、予約自体も見失わないように**」
       ＝ まだ終わっていないカード（予約中・作業中）を、**1件ずつ名指しで出す。**
       ⚠ 「終わったか」の物差しは customers.js の `pitCardIsDone` 1本。ここで条件を書き写さない。 */
    var 済み = w.pitCardIsDone || function(){ return false; };
    var 予約 = cards().filter(function(c){
      if(!c || 済み(c)) return false;
      var サブの = (c.vehId && c.vehId === sub.id) || (サブplate && realPlate(c.plate) && norm(c.plate) === norm(sub.plate));
      var 主の   = (c.vehId && c.vehId === main.id) || (主plate && realPlate(c.plate) && norm(c.plate) === norm(main.plate));
      return サブの || 主の;
    }).map(function(c){
      var サブの = (c.vehId && c.vehId === sub.id) || (サブplate && realPlate(c.plate) && norm(c.plate) === norm(sub.plate));
      return { id:c.id, resNo:t(c.resNo), plate:t(c.plate), 側:(サブの ? 'サブ' : '主'),
               直す:!!(サブの && 主plate && サブplate && realPlate(c.plate) && norm(c.plate) === norm(sub.plate)) };
    });

    return { cust:cust, main:main, sub:sub, rows:rows,
             伝票:{ 主:主伝票.length, サブ:サブ伝票.length, 足す:足す.length, 重なり:(サブ伝票.length - 足す.length) },
             カード:{ ナンバー:pl.length, 紐づけ:vi.length },
             予約:予約,
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
      var 旧残す = (選択.ナンバー === '旧として残す');
      if(旧残す){
        if(!Array.isArray(main.oldPlates)) main.oldPlates = [];
        if(main.oldPlates.every(function(p){ return norm(p)!==norm(sub.plate); })) main.oldPlates.push(t(sub.plate));
      }
      /* 🔴🔴 ナンバーの直し方（ゆうた「予約自体も見失わないように」）
         ・**登録間違い** … そのナンバーのカードを全部、主のナンバーに直す
         ・**ナンバー変更** … **まだ終わっていない予約だけ**直す。
           　過去の実績は**当時のナンバーのまま**残す（伝票・紙と食い違わせない）。
           　旧ナンバーは主が持っているので、履歴はそれでも主から引ける。 */
      var 済み = w.pitCardIsDone || function(){ return false; };
      cards().forEach(function(c){
        if(!c || !realPlate(c.plate) || norm(c.plate)!==norm(sub.plate)) return;
        if(旧残す && 済み(c)) return;
        記録.カード.push({ id:c.id, 前plate:c.plate, 後plate:t(main.plate) });
        c.plate = t(main.plate);
      });
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
  var _st = null;   /* { custId, 主, サブ, 欄:{}, ナンバー:'' } */

  function vehTitle(v){
    if(!v) return '';
    var nm = ((v.maker ? v.maker + ' ' : '') + (v.car || '')).trim();
    return (t(v.plate) || (v.perVisit ? '都度車両変動' : 'ナンバーなし')) + (nm ? '（' + nm + '）' : '');
  }
  function _when(ms){
    if(!ms) return '';
    var x = new Date(ms), p = function(n){ return (n<10?'0':'') + n; };
    return x.getFullYear() + '/' + (x.getMonth()+1) + '/' + x.getDate() + ' ' + p(x.getHours()) + ':' + p(x.getMinutes());
  }
  function 生きている(cust){ return (cust.vehicles || []).filter(function(v){ return v && !merged(v); }); }
  function 記録たち(cust){
    var out = [];
    (cust.vehicles || []).forEach(function(v){
      (Array.isArray(v.mergeLog) ? v.mergeLog : []).forEach(function(m){ if(m) out.push({ 主:v, 記録:m }); });
    });
    return out.sort(function(a,b){ return (b.記録.at || 0) - (a.記録.at || 0); });
  }

  /* 🔴 入口は**顧客詳細の上のバーの小さいボタン1つだけ**（2026-08-30 ゆうた指定）。
     🗣「車両にボタンを足すんじゃなくて**顧客情報の編集の横に**ボタンを足して、**専用UI**で実行できるように。
     　　**基本はあまり触る前提ではない**感じで」
     🗣「**今 何と何がくっつくのか分からない。クリックして ① ② みたいなマークが出て選べる**ようにしたい」
     ＝ 車のカードには置かない。**1枚の画面で ①→② を押して、その場で何が起きるかが見える。** */
  function open(custId, mainId){
    var cust = findCust(custId); if(!cust) return;
    _st = { custId:custId, 主:'', サブ:'', 欄:{}, ナンバー:'' };
    if(mainId && findVeh(cust, mainId) && !merged(findVeh(cust, mainId))) _st.主 = t(mainId);
    _home();
  }

  /* 車1台の行。①（残す）／②（寄せる）の印が付く */
  function _carRow(v){
    var n = (_st.主 === v.id) ? 1 : (_st.サブ === v.id ? 2 : 0);
    var arc = (w.PitArchive ? PitArchive.vehSelfArchived(v) : !!v.archived);
    return '<button class="vm-car' + (n ? ' on' + n : '') + '" onclick="PitVehMerge.tap(\'' + esc(v.id) + '\')">'
         + '<span class="vm-no">' + (n === 1 ? '①' : (n === 2 ? '②' : '')) + '</span>'
         + '<span class="vm-pplate">' + esc(t(v.plate) || (v.perVisit ? '都度車両変動' : 'ナンバーなし')) + '</span>'
         + '<span class="vm-pcar">' + esc(((v.maker ? v.maker + ' ' : '') + (v.car || '')).trim() || '—') + '</span>'
         + (v.karteNo ? '<span class="vm-ptag">カルテ ' + esc(v.karteNo) + '</span>' : '')
         + ((Array.isArray(v.伝票) && v.伝票.length) ? '<span class="vm-ptag">伝票 ' + v.伝票.length + '</span>' : '')
         + (arc ? '<span class="vm-ptag arch">アーカイブ済み</span>' : '')
         + '<span class="vm-role">' + (n === 1 ? '残す' : (n === 2 ? 'アーカイブへ' : '')) + '</span>'
         + '</button>';
  }

  /* 🖥 画面は1枚。①②を押す → その下に「何が起きるか」が出る → まとめる */
  function _home(){
    var cust = findCust(_st.custId); if(!cust) return;
    var vs = 生きている(cust), logs = 記録たち(cust);
    var canR = !(w.PitArchive) || PitArchive.canRestore();
    var 主 = findVeh(cust, _st.主), サブ = findVeh(cust, _st.サブ);
    var P = (_st.主 && _st.サブ) ? plan(_st.custId, _st.主, _st.サブ) : null;

    var h = '<div class="cm-head"><i data-ic=link data-ics=16></i> 車をまとめる'
          + '<span class="cm-sub">' + esc((w.pitCustDispName ? pitCustDispName(cust) : (cust.name || '')) || '(無名)') + ' 様</span>'
          + '<button class="cm-x" onclick="PitVehMerge.back()" title="顧客詳細へ戻る"><i data-ic=close data-ics=16></i></button></div>';
    h += '<div class="cm-body">';
    h += '<div class="vm-note"><b>同じ車が2件に分かれて登録されている</b>時だけ使います。'
       + '<b>①＝残す車</b>、<b>②＝寄せる車</b>の順に押してください。②は<b>消えません</b>（アーカイブに移るだけ）。<br>'
       + '⚠ <b>乗り換え・増車など「別の車」には使いません。</b>お客様どうしをまとめるものでもありません。</div>';

    if(vs.length < 2){
      h += '<div class="vm-none">この方の車は' + vs.length + '台なので、まとめられません。</div>';
    } else {
      h += '<div class="vm-sec">まとめる2台を押す　<span class="vm-step">' +
           (!_st.主 ? '①＝残す車を押してください' : (!_st.サブ ? '②＝寄せる車を押してください' : '選べました')) +
           '</span></div>';
      h += '<div class="vm-cars">' + vs.map(_carRow).join('') + '</div>';
      if(_st.主 || _st.サブ){
        h += '<div class="vm-pair">'
           + '<span class="vm-pn on1">①</span><b>' + esc(vehTitle(主) || '未選択') + '</b>'
           + '<span class="vm-arrow">←</span>'
           + '<span class="vm-pn on2">②</span><b>' + esc(vehTitle(サブ) || '未選択') + '</b>'
           + '<button class="vm-mini" onclick="PitVehMerge.swap()">①②を入れ替える</button>'
           + '<button class="vm-mini" onclick="PitVehMerge.clear()">選び直す</button></div>';
      }
    }

    if(P){
      h += '<div class="vm-sum">'
         + '<div class="vm-sumi"><b>' + P.伝票.足す + '</b><span>①へ写す伝票</span></div>'
         + '<div class="vm-sumi"><b>' + P.伝票.重なり + '</b><span>重なり（写さない）</span></div>'
         + '<div class="vm-sumi"><b>' + (P.カード.ナンバー + P.カード.紐づけ) + '</b><span>関わるカード</span></div>'
         + '<div class="vm-sumi' + (P.予約.length ? ' hot' : '') + '"><b>' + P.予約.length + '</b><span>かかっている予約</span></div>'
         + '</div>';

      /* 🔴 ゆうた「それに伴う予約がある場合、予約自体も見失わないように」
         ＝ **まだ終わっていない予約を1件ずつ名指しで出す。**数だけにしない。 */
      if(P.予約.length){
        h += '<div class="vm-sec">かかっている予約（まだ終わっていないもの）</div><div class="vm-resv">';
        P.予約.forEach(function(r){
          h += '<div class="vm-rsv"><span class="vm-pn ' + (r.側==='サブ'?'on2':'on1') + '">' + (r.側==='サブ'?'②':'①') + '</span>'
             + '<b>' + esc(r.resNo || '（番号なし）') + '</b>'
             + '<span class="vm-pcar">' + esc(r.plate || 'ナンバーなし') + '</span>'
             + '<span class="vm-rsvto">' + (r.直す ? '①のナンバーに直します' : '①の車としてそのまま残ります') + '</span></div>';
        });
        h += '</div>';
      }

      if(P.rows.length){
        h += '<div class="vm-sec">どちらを残すか</div><div class="vm-rows">';
        P.rows.forEach(function(r){
          var 選 = _st.欄[r.k] || r.既定;
          h += '<div class="vm-row"><div class="vm-rl">' + esc(r.l)
             + (r.種類 === '空埋め' ? '<span class="vm-rt">①が空</span>' : '') + '</div>'
             + '<button class="vm-opt' + (選==='main'?' on':'') + '" onclick="PitVehMerge.setField(\'' + esc(r.k) + '\',\'main\')">'
             + '<i>①</i>' + esc(r.主 || '（空）') + '</button>'
             + '<button class="vm-opt' + (選==='sub'?' on':'') + '" onclick="PitVehMerge.setField(\'' + esc(r.k) + '\',\'sub\')">'
             + '<i>②</i>' + esc(r.サブ || '（空）') + '</button></div>';
        });
        h += '</div>';
      } else {
        h += '<div class="vm-none">食い違う欄はありません。履歴だけを①へ寄せます。</div>';
      }

      if(P.ナンバーを選ぶ){
        h += '<div class="vm-sec">②のナンバー「' + esc(t(P.sub.plate)) + '」をどうするか　<span class="vm-must">選んでください</span></div>'
           + '<div class="vm-plate">'
           + '<button class="vm-pl' + (_st.ナンバー==='旧として残す'?' on':'') + '" onclick="PitVehMerge.setPlate(\'旧として残す\')">'
           + '<b>ナンバー変更だった</b><span>①に<b>旧ナンバー</b>として持たせます。過去のカードは<b>書き換えません</b>（当時の伝票と食い違わせない）。履歴は旧ナンバーでも①に付きます。</span></button>'
           + '<button class="vm-pl' + (_st.ナンバー==='捨てる'?' on':'') + '" onclick="PitVehMerge.setPlate(\'捨てる\')">'
           + '<b>登録間違いだった</b><span>旧ナンバーは残しません。このナンバーのカード <b>' + P.カード.ナンバー + '件</b> を、①のナンバー「' + esc(t(P.main.plate)) + '」に直します。</span></button>'
           + '</div>';
      }
    }

    if(logs.length){
      h += '<div class="vm-sec">まとめた記録</div><div class="vm-logs">';
      logs.forEach(function(x){
        h += '<div class="vm-log"><div class="vm-logmain">'
           + '<b>' + esc(t(x.主.plate) || t(x.主.car) || '—') + '</b> ← ' + esc(x.記録.fromPlate || '（ナンバーなし）')
           + (x.記録.ナンバー ? '<span class="vm-ptag">' + esc(x.記録.ナンバー) + '</span>' : '')
           + '<span class="vm-logsub">' + esc(_when(x.記録.at)) + (x.記録.by ? '　' + esc(x.記録.by) : '')
           + '　伝票' + (x.記録.伝票 || []).length + '・カード' + (x.記録.カード || []).length + '</span></div>'
           + (canR ? '<button class="vm-undo" onclick="PitVehMerge.undoAsk(\'' + esc(x.記録.id) + '\')">取り消す</button>'
                   : '<span class="vm-lock">管理者だけ</span>')
           + '</div>';
      });
      h += '</div>';
    }

    h += '</div><div class="cm-foot">'
       + '<button class="cm-cancel" onclick="PitVehMerge.back()">← 顧客詳細へ戻る</button>'
       + (P ? '<button class="cm-save" onclick="PitVehMerge.go()">この2台をまとめる</button>' : '')
       + '</div>';
    if(w.custShowModal) custShowModal(h, 'vm-box');
  }

  /* 押した時＝①→②の順に付く。同じものをもう一度押すと外れる */
  function tap(id){
    if(!_st) return;
    if(_st.主 === id){ _st.主 = _st.サブ; _st.サブ = ''; }
    else if(_st.サブ === id){ _st.サブ = ''; }
    else if(!_st.主){ _st.主 = id; }
    else if(!_st.サブ){ _st.サブ = id; }
    else { _st.サブ = id; }     /* 3台目を押したら、②を差し替える */
    _st.欄 = {}; _st.ナンバー = '';
    _home();
  }

  /* 🔴 実行の前に必ず確認の窓（ゆうた指定「本当にいいのかポップアップも頼む」）
     ＝ **①と②がどれか**、**②はどうなるか**を、番号のまま読み上げる。 */
  function go(){
    if(!_st || !_st.主 || !_st.サブ) return;
    var P = plan(_st.custId, _st.主, _st.サブ); if(!P) return;
    if(P.ナンバーを選ぶ && !_st.ナンバー){ toast('②のナンバーの扱いを選んでください', 'PF-6005'); return; }
    var det = ['① 残す　' + vehTitle(P.main),
               '② 寄せる　' + vehTitle(P.sub) + ' → アーカイブへ（消えません）',
               '・伝票を ' + P.伝票.足す + '件 ①へ写します',
               '・カード ' + (P.カード.ナンバー + P.カード.紐づけ) + '件 が①の車を指すようになります'];
    if(P.ナンバーを選ぶ) det.push('・②のナンバーは「' + _st.ナンバー + '」として扱います');
    /* 🔴 予約は数で終わらせない。**番号を読み上げて**、どうなるかまで書く */
    if(P.予約.length){
      det.push('・かかっている予約 ' + P.予約.length + '件 は残ります（消えません）：');
      P.予約.slice(0, 6).forEach(function(r){
        det.push('　　' + (r.側==='サブ'?'②':'①') + ' ' + (r.resNo || '（番号なし）') +
                 '　' + (r.直す ? '→ ①のナンバーに直す' : '→ ①の車としてそのまま'));
      });
      if(P.予約.length > 6) det.push('　　…ほか ' + (P.予約.length - 6) + '件');
    }
    det.push('⚠ 取り消せるのは管理者だけです');
    var ask = w.pitAsk ? pitAsk('①に②をまとめます。よろしいですか？', { title:'車をまとめる', detail:det, ok:'まとめる' })
                       : Promise.resolve(true);
    ask.then(function(yes){
      if(!yes) return;
      var 記録 = apply(_st.custId, _st.主, _st.サブ, { 欄:_st.欄, ナンバー:_st.ナンバー });
      if(!記録) return;
      _st.主 = ''; _st.サブ = ''; _st.欄 = {}; _st.ナンバー = '';
      toast('まとめました');
      _home();
    });
  }

  /* 取り消しの窓（管理者だけ・いちばん近い1件ずつ） */
  function undoAsk(mergeId){
    if(!_st) return;
    var cust = findCust(_st.custId); if(!cust) return;
    var 記録 = null;
    (cust.vehicles || []).forEach(function(v){
      (Array.isArray(v.mergeLog) ? v.mergeLog : []).forEach(function(m){ if(m && m.id === mergeId) 記録 = m; });
    });
    if(!記録){ toast('取り消す記録が見つかりません', 'PF-6007'); return; }
    var det = ['・② 「' + (記録.fromPlate || '（ナンバーなし）') + '」をアーカイブから戻します',
               '・写した伝票 ' + (記録.伝票 || []).length + '件 を①から外します',
               '・直したカード ' + (記録.カード || []).length + '件 を元に戻します',
               '⚠ まとめたあとで人が直した値は、そのまま残します（勝手に上書きしない）'];
    var ask = w.pitAsk ? pitAsk('この統合を取り消しますか？', { title:'統合を取り消す', detail:det, ok:'取り消す', danger:true })
                       : Promise.resolve(true);
    ask.then(function(yes){
      if(!yes) return;
      if(!undo(_st.custId, mergeId)) return;
      toast('統合を取り消しました');
      _home();
    });
  }

  /* 🔴 画面から呼ばれるものは、必ずここに載せる。
     ⚠ 載せ忘れると「窓は出るのに押しても何も起きない」＝見張り⑧がここを見ている。 */
  w.PitVehMerge = {
    open: open, plan: plan, apply: apply, undo: undo, undoAsk: undoAsk, go: go,
    platesOf: platesOf, tap: tap,
    /* 窓は1つしかない（顧客詳細と同じ器）。閉じる＝顧客詳細を描き直す */
    back:     function(){ var id=_st?_st.custId:''; _st=null; if(id&&w.custOpen) custOpen(id); else if(w.custCloseModal) custCloseModal(); },
    swap:     function(){ if(!_st) return; var a=_st.主; _st.主=_st.サブ; _st.サブ=a; _st.欄={}; _st.ナンバー=''; _home(); },
    clear:    function(){ if(!_st) return; _st.主=''; _st.サブ=''; _st.欄={}; _st.ナンバー=''; _home(); },
    setField: function(k, which){ if(!_st) return; _st.欄[k] = which; _home(); },
    setPlate: function(v){ if(!_st) return; _st.ナンバー = v; _home(); }
  };
})(window, document);

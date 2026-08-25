/* ========================================
   customers.js  -  顧客（人）＋車両（複数台）／PitFlow v0.38.0
   ----------------------------------------
   ◎位置づけ：整備ソフトが正式台帳。ここは現場の控え＋来店履歴ビュー。乗っ取らない。
   ◎モデル（v0.38.0で人主体に）：
     顧客(人) = { id, name, kana, contacts:[{tel,label,primary}],
                  vehicles:[{ id, plate, maker, car, boardId, division, frontStaff }], updatedAt }
     ・連絡先は人ごと。担当/課/区分は車両ごと（同じ人でも国産/輸入で変わるので）。
     ・新規車両は既存車両から担当/課/区分をデフォ継承（普段は同じ・たまに違うを両取り）。
   ◎呼び出し：名前→人→車を選ぶ／ナンバー→その車と人が一発（候補は車両単位）。
   ◎履歴：その人の全車両ナンバーに一致する入庫カードを時系列表示。
   ======================================== */
(function () {
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function norm(s){ return (s||'').replace(/\s+/g,'').replace(/[ァ-ヶ]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60)).toLowerCase(); }
  function list(){ if(!Array.isArray(state.customers)) state.customers=[]; return state.customers; }
  function courseLabel(div){ const d=(state.divisions||[]).find(x=>x.id===div); return d?d.label:''; }
  function courseColorOf(div){ const d=(state.divisions||[]).find(x=>x.id===div); return (d&&d.color)?d.color:'#64748b'; }
  /* 区分(国産/輸入)＝boardIdの色、課(1課/2課)＝divisionの色。両者は独立（国産車を2課が担当 等もある） */
  function teamInfo(v){
    const course=courseLabel(v && v.division);
    const courseColor=courseColorOf(v && v.division);
    if(v && v.boardId==='import')  return { label:'輸入車', course:course, color:'#ec4899', courseColor:courseColor };
    if(v && v.boardId==='default') return { label:'国産車', course:course, color:'#1db97a', courseColor:courseColor };
    return { label:'', course:course, color:'#64748b', courseColor:courseColor };
  }
  function frontStaffList(){ return (state.staff||[]).filter(s=>s.front).map(s=>s.name); }
  /* v1.5.0：担当の表示名。メンバー番号が入っていれば今の名前を優先（改名に追従） */
  function frontName(v){
    if(!v) return '';
    const m = (v.frontStaffId && window.pitStaffById) ? window.pitStaffById(v.frontStaffId) : null;
    return m ? m.name : (v.frontStaff||'');
  }
  /* v1.8.0：担当の状態（在籍／退職／名簿外）。表示に印を付けるため。 */
  function frontMark(v){
    const nm = frontName(v);
    if(!nm) return '';
    const m = window.pitStaffAny ? window.pitStaffAny(v.frontStaffId || nm) : null;
    if(!m) return '（名簿外）';
    return m.left ? '（退職）' : '';
  }
  function primaryTel(cust){ const cs=(cust&&cust.contacts)||[]; const p=cs.find(x=>x.primary)||cs[0]; return p?(p.tel||''):''; }
  function vehLabel(v){ return ((v.maker?v.maker+' ':'')+(v.car||'')).trim() || (v.plate||'—'); }

  /* 🔴 v1.52.0 アーカイブした車の扱い（ゆうた指定）
     ・**顧客一覧には出さない**＝1人1行に戻る（前は「現所有＋アーカイブ」で2行になっていた）。
     ・**顧客詳細では車のカードから外し**、来店履歴の下の「アーカイブ車両」欄にまとめる。
     ⚠ ここで見るのは **その車自身が片付いているか**（`vehSelfArchived`）だけ。
        顧客ごとアーカイブされている時は、車は「持ち主のとばっちり」なので**ふつうに出す**
        （顧客を戻せば車も戻る＝archive-pit.js の決めごとと同じ考え方）。 */
  function vehArchivedSelf(v){ return window.PitArchive ? PitArchive.vehSelfArchived(v) : !!(v && v.archived); }
  function liveVehs(cust){ return ((cust&&cust.vehicles)||[]).filter(function(v){ return !vehArchivedSelf(v); }); }
  function archVehs(cust){ return ((cust&&cust.vehicles)||[]).filter(function(v){ return  vehArchivedSelf(v); }); }
  window.pitLiveVehicles = liveVehs;

  /* 🔴 v1.52.0 「都度車両変動」＝同業の法人など、来るたびに入る車が違うお客様（ゆうた指定）
     ・車の登録は **1件だけ**。**カルテNo.・担当・課・区分は共通**で、**ナンバーは持たない**。
     ・車種名は **予約のたびに手で入れる**。その名前が予約カード・表紙・実績・履歴にそのまま出る。
     ⚠ 車の側は書き換えない（前回の名前を `lastCar` に控えるだけ）＝**過去の予約は当時の車種名のまま残る**。 */
  function isPerVisit(v){ return !!(v && v.perVisit); }
  window.pitIsPerVisitVeh = isPerVisit;

  /* 🔴 v1.53.0 ①（ゆうた確認）**カナだけで受けたお客様も顧客として登録する**
     ⚠ 「漢字が分からない新規のお客様はカナだけでOK」（v1.25.0）で受けた予約が、
        **1枚残らず顧客控えに残っていなかった**（2026-08-06 本番調査で14枚／カナだけの予約は100%取りこぼし）。
        原因＝控えを作る側が**漢字の欄しか見ていなかった**。画面はカナを名前として出しているのに、である。
     ⚠ 表示の決まりは予約カード（`pitCustName`）と同じ＝**漢字が無ければカナを名前として出す。**
        ここ以外で `cust.name` を直に出さないこと。 */
  function custDispName(cust){
    const n = String((cust&&cust.name)||'').trim();
    if(n) return n;
    return String((cust&&cust.kana)||'').trim();
  }
  window.pitCustDispName = custDispName;

  /* 🔴 v1.53.0 ②④（ゆうた確認）**ナンバーとして意味をなさない値は「車の見分け」に使わない**
     ⚠ 本番には整備ソフト取込の受け皿として **ナンバーが「0」の車が82台**（「1」が2台）あった。
        このまま照合に使うと、「0」と打った予約がその82台のうちの誰かに吸い込まれ、
        **名前もTELも上書きされる**（＝別のお客様の乗っ取り）。
     ⚠ 「新規車両」スイッチが入れる文言も同じ穴。使うほど前の人を乗っ取る（本番の実害は0件のうちに塞ぐ）。
     ⚠ **データは消さない**＝照合に使わないだけ。ただし**控えに新しく保存する時は空にする**（これ以上増やさない）。 */
  /* ⚠ norm() はカタカナをひらがなに直すので、この一覧も同じ物差しに通してから比べる
        （「ナンバーなし」をそのまま比べても一生一致しない） */
  /* ⚠ 「仮登録車両」は整備ソフトが“番号がまだ無い車”に入れる文言。本物の番号ではない。
        （過去伝票の束 864枚のうち 43枚がこれ。照合に使うと全部が同じ1台に吸い込まれる） */
  const PLATE_NG = ['なし','無し','未定','不明','無','新規車両','仮登録車両','仮登録','ナンバーなし','ナンバー無し','番号なし','未登録','仮ナンバー','-','ー','―','−','--','ーー','・','／','/'].map(norm);
  function isRealPlate(plate){
    const s = String(plate==null?'':plate).trim();
    if(!s) return false;
    const k = norm(s);
    if(!k) return false;
    if(/^[0-9]{1,2}$/.test(k)) return false;          /* 「0」「1」「00」… 数字だけ1〜2文字は番号ではない */
    if(PLATE_NG.indexOf(k)>=0) return false;
    if(k.length<3) return false;                       /* 3文字未満は番号として成り立たない */
    return true;
  }
  window.pitIsRealPlate = isRealPlate;

  /* ================================================================
     🚗 v2.2.0 ナンバーから、その車そのものを引く（車体番号の出し入れ用）
     ----------------------------------------------------------------
     🔴 車体番号（車台番号）は**その車の一生ものの番号**。ナンバーは変わるが、これは変わらない。
        クォーターチェックが伝票から拾って、ここに書き足す。
     🔴 **上書きはしない。** すでに別の番号が入っていたら、書かずに知らせる
        （ナンバーの付け替えも、結びつけのまちがいも、どちらもありうるので人が見る）。
     ⚠ 出し入れの入口は**この4本だけ**（v2.12.0 で `pitVehSetVinOn` を足した）。
        ほかの所で `veh.vin` を直に触らないこと。
     ================================================================ */
  function vehByPlate(plate){
    if(!isRealPlate(plate)) return null;
    const q=norm(plate), arr=list();
    for(let i=0;i<arr.length;i++){
      const p=arr[i], vs=(p&&Array.isArray(p.vehicles))?p.vehicles:[];
      for(let k=0;k<vs.length;k++){
        if(isRealPlate(vs[k].plate)&&norm(vs[k].plate)===q) return {cust:p, veh:vs[k]};
      }
    }
    return null;
  }
  window.pitVehByPlate = vehByPlate;
  window.pitVehVin = function(plate){ const h=vehByPlate(plate); return h?String(h.veh.vin||''):''; };
  /* 書き足す。返り＝'入れた' / 'そのまま'（同じ番号）/ 'ちがう'（別の番号が入っている）/ '車がない'
     🔴 v2.12.0 **車そのものを渡す形**を本体にした。
        ナンバーで引くと、**同じナンバーの車が2台ある時にどちらか分からない**。
        呼ぶ側がすでに車を1台に決めているなら、その車に書く（過去の伝票の取り込みがこれ）。 */
  function vehSetVinOn(cust, veh, vin){
    vin=String(vin||'').trim();
    if(!vin) return 'そのまま';
    if(!veh) return '車がない';
    const now=String(veh.vin||'').trim();
    if(now && now.toUpperCase()===vin.toUpperCase()) return 'そのまま';
    if(now) return 'ちがう';                       /* 🔴 上書きしない */
    veh.vin=vin; veh.updatedAt=Date.now();
    if(cust) cust.updatedAt=Date.now();
    return '入れた';
  }
  window.pitVehSetVinOn = vehSetVinOn;
  window.pitVehSetVin = function(plate, vin){
    const h=vehByPlate(plate);
    if(!h) return String(vin||'').trim() ? '車がない' : 'そのまま';
    return vehSetVinOn(h.cust, h.veh, vin);
  };

  /* ===== 入庫カードから upsert（人を特定→車両を upsert） =====
     🔴 v1.53.0 ③（ゆうた確認）**どうやってその人だと決めたか**を一緒に返す。
        ナンバーで当てた時だけ「名前が違うなら上書きしない」という守りを入れるため。 */
  function _findPerson(c, vehicle){
    const arr=list();
    if(c.customerId){ const p=arr.find(x=>x.id===c.customerId); if(p) return {p:p, why:'id'}; }
    if(isRealPlate(vehicle.plate)){
      const p=arr.find(x=>Array.isArray(x.vehicles)&&x.vehicles.some(v=>isRealPlate(v.plate)&&norm(v.plate)===norm(vehicle.plate)));
      if(p) return {p:p, why:'plate'};
    }
    const nm=norm(c.customer), kn=norm(c.kana);
    const pt=norm((c.contacts&&c.contacts.find(x=>x.primary)||{}).tel||c.tel);
    /* 名前（漢字）で引く。TELがあればTELも一致すること。
       🔴 TELが空のときは名前だけで決めない＝**カナも一致していること**を条件に足す（同姓同名の別人対策）。
          ⚠ どちらかにカナが無い時は今までどおり名前だけで一致とみなす（昔の控えを切らないため）。 */
    if(nm){
      const p=arr.find(function(x){
        if(norm(x.name)!==nm) return false;
        if(pt) return norm(primaryTel(x))===pt;
        const xk=norm(x.kana);
        if(kn && xk) return kn===xk;
        return true;
      });
      if(p) return {p:p, why:'name'};
    }
    /* 🔴 v1.53.0 ① カナだけで受けたお客様＝カナ＋TELで引く（TELが無ければカナだけ） */
    if(!nm && kn){
      const p=arr.find(function(x){
        if(norm(x.kana)!==kn) return false;
        if(pt) return norm(primaryTel(x))===pt;
        return !String(x.name||'').trim();     /* 漢字を持っている人には、カナだけの予約をくっつけない */
      });
      if(p) return {p:p, why:'kana'};
    }
    return null;
  }
  function upsertCustomerFromCard(c){
    if(!c) return;
    const name=(c.customer||'').trim();
    const kana=(c.kana||'').trim();
    const _fm0 = window.pitStaffByName ? window.pitStaffByName(c.frontStaff) : null;   /* v1.5.0：担当をメンバーに結びつける */
    const rawPlate=(c.plate||'').trim();
    const vehicle={ plate:(isRealPlate(rawPlate)?rawPlate:''), maker:(c.maker||'').trim(), car:(c.car||'').trim(), boardId:c.boardId||'', division:c.division||'', frontStaff:(c.frontStaff||'').trim(), frontStaffId:(_fm0?_fm0.id:''), karteNo:(c.karteNo||'').trim() };
    /* 🔴 v1.53.0 ① 漢字が無くても **カナがあれば作る**（ここが14枚の取りこぼしの正体） */
    if(!name && !kana && !vehicle.plate) return;
    const contacts = Array.isArray(c.contacts)
      ? c.contacts.filter(x=>(x.tel||'').trim()||(x.label||'').trim()).map(x=>({tel:(x.tel||'').trim(),label:(x.label||'').trim(),primary:!!x.primary}))
      : ((c.tel||'').trim() ? [{tel:(c.tel||'').trim(),label:'個人携帯',primary:true}] : []);
    if(contacts.length && !contacts.some(x=>x.primary)) contacts[0].primary=true;
    const hit=_findPerson(c, {plate:vehicle.plate});
    let p = hit ? hit.p : null;
    /* 🔴 v1.53.0 ③（ゆうた確認）**ナンバーで当てたのに名前が明らかに違う＝別人**。
       ⚠ 前はここで問答無用に名前・カナ・連絡先を上書きしていたので、
          ナンバーの打ち間違い／前オーナーの車で **既存のお客様が別人に化けていた**。
       ⚠ 勝手に新しい人も作らない（同じ方の二重登録が増えるため）。**知らせて何もしない**のが安全側。
          正しく結び付けたい時は、カードの「顧客呼び出し」で選んでもらう。 */
    if(p && hit.why==='plate'){
      const mine = norm(name) || norm(kana);
      const theirs = norm(p.name) || norm(p.kana);
      if(mine && theirs && mine!==theirs){
        if(window.pitToast) pitToast('このナンバーは「'+(custDispName(p)||'(無名)')+'」様で登録済みです。顧客控えは変更していません', 'PF-6001');
        if(window.pitOpLog) try{ pitOpLog('顧客控えの更新を見送り', 'ナンバー '+rawPlate+' は別のお客様（'+(custDispName(p)||'(無名)')+'）で登録済み'); }catch(e){}
        return;
      }
    }
    if(!p){ p={ id:'cu'+Date.now()+Math.floor(Math.random()*1000), name, kana, contacts, vehicles:[], updatedAt:Date.now() }; list().push(p); }
    else { p.name=name||p.name; p.kana=kana||p.kana; if(contacts.length) p.contacts=contacts; }
    // v0.93.0 LINEは人単位で保持（カードに値があれば更新・無ければ既存維持）
    if(c.lineStatus) p.lineStatus=c.lineStatus;
    if((c.lstepId||'').trim()) p.lstepId=(c.lstepId||'').trim();
    if(!Array.isArray(p.vehicles)) p.vehicles=[];
    /* 🔴 v1.52.0 都度車両変動の車は **ナンバーが無い**ので、ふつうに突き合わせると
       予約のたびに「新しい車」として増えてしまう。カードが持っている車両ID（`vehId`）で引き当て、
       **車種名は車の側に書き戻さない**（`lastCar` に控えるだけ）。 */
    if(c.perVisit && c.vehId){
      const pv = p.vehicles.find(x=>x && x.id===c.vehId);
      if(pv){
        pv.perVisit = true;
        if(vehicle.karteNo) pv.karteNo = vehicle.karteNo;
        if(vehicle.boardId) pv.boardId = vehicle.boardId;
        if(vehicle.division) pv.division = vehicle.division;
        if(vehicle.frontStaff){ pv.frontStaff = vehicle.frontStaff; pv.frontStaffId = vehicle.frontStaffId||''; }
        const nm = ((vehicle.maker?vehicle.maker+' ':'')+(vehicle.car||'')).trim();
        if(nm) pv.lastCar = nm;                 /* 前回どんな車が来たか（表示の参考だけ） */
        pv.updatedAt = Date.now();
        p.updatedAt = Date.now(); c.customerId = p.id;
        if(window.PitDB) PitDB.save();
        return;
      }
    }
    /* 🔴 v1.53.0 ② 車の突き合わせも「意味のあるナンバー」だけ。
       ⚠ `vehicle.plate` はこの時点で既に選り分け済み（意味をなさない値は空にしてある）。
          ＝「0」の車どうしが1台にまとまったり、上書きし合ったりしない。 */
    let v = vehicle.plate ? p.vehicles.find(x=>isRealPlate(x.plate)&&norm(x.plate)===norm(vehicle.plate)) : null;
    /* 🔴 v1.53.0 ナンバーがまだ無い車（カナだけの新規のお客様・ナンバー未定の新車）を、
       **保存のたびに増やさない**ための引き当て。⚠ 前は「ナンバーが空なら必ず新しい車」だったので、
       同じ予約を開いて閉じるたびに同じ車が1台ずつ増えていた。
       順番＝①カードが覚えている車 ②カルテNo. ③メーカー＋車種。 */
    if(!v && !vehicle.plate){
      if(c.vehId) v = p.vehicles.find(x=>x && x.id===c.vehId) || null;
      if(!v && vehicle.karteNo) v = p.vehicles.find(x=>x && !x.perVisit && !isRealPlate(x.plate) && norm(x.karteNo)===norm(vehicle.karteNo)) || null;
      if(!v && (vehicle.maker||vehicle.car)){
        const key=norm(vehicle.maker+vehicle.car);
        v = p.vehicles.find(x=>x && !x.perVisit && !isRealPlate(x.plate) && norm(String(x.maker||'')+String(x.car||''))===key) || null;
      }
    }
    if(v){ v.plate=vehicle.plate||v.plate; v.maker=vehicle.maker||v.maker; v.car=vehicle.car||v.car; if(vehicle.boardId)v.boardId=vehicle.boardId; if(vehicle.division)v.division=vehicle.division; if(vehicle.frontStaff){v.frontStaff=vehicle.frontStaff; v.frontStaffId=vehicle.frontStaffId||'';} if(vehicle.karteNo)v.karteNo=vehicle.karteNo; v.updatedAt=Date.now(); }
    else if(vehicle.plate||vehicle.maker||vehicle.car){
      const base=p.vehicles[p.vehicles.length-1]||{};   // 新車両：未指定の担当/課/区分は既存からデフォ継承
      v={ id:'v'+Date.now()+Math.floor(Math.random()*1000), plate:vehicle.plate, maker:vehicle.maker, car:vehicle.car,
        boardId:vehicle.boardId||base.boardId||'', division:vehicle.division||base.division||'', frontStaff:vehicle.frontStaff||base.frontStaff||'', frontStaffId:vehicle.frontStaffId||base.frontStaffId||'', karteNo:vehicle.karteNo||'', updatedAt:Date.now() };
      p.vehicles.push(v);
    }
    p.updatedAt=Date.now();
    c.customerId=p.id;
    if(v && v.id) c.vehId=v.id;   /* 🔴 v1.53.0 どの車の予約かをカードに覚えさせる（次の保存で増やさない） */
    if(window.PitDB) PitDB.save();
  }
  window.upsertCustomerFromCard=upsertCustomerFromCard;

  /* ===== 検索 ===== */
  function match(cust,q){
    if(norm(cust.name).includes(q)||norm(cust.kana).includes(q)) return true;
    if((cust.contacts||[]).some(ct=>norm(ct.tel).includes(q))) return true;
    if((cust.vehicles||[]).some(v=>norm(v.plate).includes(q)||norm(v.car).includes(q)||norm(v.maker).includes(q))) return true;
    return false;
  }

  /* ===== カードの「呼び出し」＝候補は車両単位（名前で引けば人の全車両・ナンバーでその車） ===== */
  /* 🔴 v1.177.0（ゆうた報告「検索ボックスの挙動が おそい」）
     打ち終わるまで待って1回だけ描く。**待ち方の物差しは search.js の1本**（`pitTypeSoon`）。
     ⚠ ここに書き写さない。`custSuggest(q)` は今までどおり「呼んだらその場で描く」まま（試験もこれを使う）。 */
  window.custSuggestSoon=function(qstr,ev){
    const v=String(qstr==null?'':qstr);
    if(!window.pitTypeSoon){ custSuggest(v); return; }
    pitTypeSoon('recall', ev, function(){ custSuggest(v); });
  };
  window.custSuggest=function(qstr){
    /* 🔴 v1.44.0 候補の箱は**いま開いているフォームの中**から探す。
       入庫カードのフォームは置き場所が2つ（#md-body／#md-body-modal）あり、
       前に開いた方が残っていると同じ id が2つできて**前のカードの箱**に候補を出してしまう。 */
    const _hid = (typeof _cardBodyId !== 'undefined' && _cardBodyId) ? _cardBodyId : 'md-body';
    const _host = document.getElementById(_hid) || document;
    const box = _host.querySelector('#cf-recall-list'); if(!box) return;
    /* 🔴 v1.102.0（ゆうた報告「ダッシュボードのマスター検索に比べて、新規予約での検索の結果が薄い。
                     なんか件数制限みたいなものがある」）
       ◎前まで（薄かった理由は3つ）
         ① **10件で打ち切っていた**（しかも「何件あるか」も出さないので、気づけない）
         ② **スペース区切りが効かない**＝「山田 アクア」と2語で打つと 0件（全文一致しか見ていなかった）
         ③ **全角の英数字をならしていなかった**＝全角で打ったナンバー・電話が当たらない
       ◎これから
         🔴 **探し方はマスター検索と同じ物差し**（search.js の `pitSearchNorm` / `pitSearchWords`）。
            ⚠ ここに書き写さないこと。写すと、また片方だけ直って食い違う。
         🔴 **上限なし＝全件出す**（v1.102.1・ゆうた指定「どっちも顧客検索の上限は設けないで全件出して」）。
            ⚠ 数が多い時だけ、頭に「◯件」と「もう1語足すと絞れる」を出す。**黙って切らない・勝手に絞らない。** */
    const words = (window.pitSearchWords ? pitSearchWords(qstr) : (norm(qstr) ? [norm(qstr)] : []));
    if(!words.length){ box.innerHTML=''; box.style.display='none'; return; }
    const nz = window.pitSearchNorm || norm;
    const entries=[];
    /* 🔴 v1.49.0 アーカイブした顧客・車両は呼び出しの候補に出さない（archive-pit.js が判定）。
       ⚠ 顧客をアーカイブすると、その車も全部まとめて候補から消える。 */
    const _vis = c => (window.PitArchive ? PitArchive.custVisible(c) : true);
    const _vveh = (c,v) => (window.PitArchive ? !PitArchive.vehArchived(c,v) : true);
    const _hit = arr => { const blob = nz(arr.filter(Boolean).join(' ')); return words.every(w => blob.indexOf(w) >= 0); };
    list().filter(_vis).forEach(function(cust){
      /* 人の手がかり（名前・カナ・電話）は**どの車の行にも付けて**見る。
         ＝名前で引けばその人の車が全部出る／「名前＋車種」の2語でも当たる。 */
      const who = [cust.name, cust.kana].concat((cust.contacts||[]).map(ct=>ct&&ct.tel));
      const vehs = (cust.vehicles||[]).filter(v=>_vveh(cust,v));
      vehs.forEach(function(v){
        if(_hit(who.concat([v.plate, v.maker, v.car]))) entries.push({cust:cust, v:v});
      });
      if(!vehs.length && _hit(who)) entries.push({cust:cust, v:null});
    });
    entries.sort((a,b)=>nz(a.cust.kana+a.cust.name).localeCompare(nz(b.cust.kana+b.cust.name),'ja'));
    if(!entries.length){ box.innerHTML=''; box.style.display='none'; return; }
    const HINT_FROM = 30;   /* この数を超えたら「何件出ているか」を添える（切るための数ではない） */
    /* 🔴🔴 v1.176.0（ゆうた指定）**当たった所を塗る／どの欄で当たったかを出す。**
       🗣「ナンバーで 920 で検索した時に 9/20 とかでヒットして？？？って迷って意外とはかどらない」
       🔴 塗り方も「どの欄か」も **search.js の1本**（`pitSearchMark` / `pitSearchWhere`）。
          ⚠ ここに書き写さない。探し方（`pitSearchWords`）を借りているのと同じ筋。
       ⚠ **拾う範囲は1文字も変えていない**（見えるようにするだけ）。 */
    const mk = window.pitSearchMark ? function(t){ return pitSearchMark(t, words); } : esc;
    const where = function(cust, v){
      if (!window.pitSearchWhere) return '';
      const F = [];
      const add = (label, x) => { if (x) F.push({ label: label, text: String(x) }); };
      add('お名前', cust.name); add('カナ', cust.kana);
      (cust.contacts||[]).forEach(ct => { add('TEL', ct && ct.tel); });
      if (v){ add('ナンバー', v.plate); add('メーカー', v.maker); add('車種', v.car); }
      const w = pitSearchWhere(F, words);
      return w.length ? '<span class="cf-recall-where">'+w.map(function(x){ return esc(x.label)+(x.as?'（'+esc(x.as)+'）':''); }).join('・')+'に一致</span>' : '';
    };
    box.innerHTML=(entries.length>HINT_FROM
        ? '<div class="cf-recall-more">'+entries.length+'件（全部出しています）。名前と車種など、スペースで区切ってもう1語足すと絞れます</div>'
        : '')
      +entries.map(function(e){
      const t=e.v?teamInfo(e.v):{label:'',color:'#64748b'};
      const tag=t.label?(' <i style="color:'+t.color+'">●</i>'+esc(t.label)):'';
      const vtxt=e.v?(mk(vehLabel(e.v))+(e.v.plate?' / '+mk(e.v.plate):'')):'（車両なし）';
      return '<button type="button" class="cf-recall-item" onclick="custPick(\''+e.cust.id+'\',\''+(e.v?e.v.id:'')+'\')">'+
        '<b>'+mk(custDispName(e.cust)||'(無名)')+'</b> <span>'+vtxt+tag+'</span>'+where(e.cust,e.v)+'</button>';
    }).join('');
    box.style.display='block';
  };
  window.custPick=function(custId,vehId){
    const cust=list().find(x=>x.id===custId); if(!cust) return;
    const c=state.cards.find(x=>x.id===_editingCardId); if(!c) return;
    c.customer=cust.name||c.customer; c.kana=cust.kana||c.kana; c.customerId=cust.id;   /* 🔴 漢字が無い人は customer が空のまま＝カードもカナで出る（v1.53.0） */
    c.repeat='repeater';   // 呼び出した＝必ずリピーター（初回/リピーターを自動でリピーターに）
    // v0.93.0 LINE（人単位）を引き継ぐ
    if(cust.lineStatus!=null) c.lineStatus=cust.lineStatus;
    if((cust.lstepId||'').trim()) c.lstepId=cust.lstepId;
    if(Array.isArray(cust.contacts)&&cust.contacts.length){
      c.contacts=cust.contacts.map(x=>({tel:x.tel,label:x.label,primary:!!x.primary}));
      const pri=c.contacts.find(x=>x.primary)||c.contacts[0]; c.tel=pri?(pri.tel||''):'';
    }
    const v=(cust.vehicles||[]).find(x=>x.id===vehId)||liveVehs(cust)[0]||(cust.vehicles||[])[0];
    // フロント担当は「その車両に登録済みのものだけ」入れる（推測での自動入力はしない・ゆうた方針 2026-06-23）。
    if(v){
      /* 🔴 v1.52.0 都度車両変動の車を呼び出した時は、**ナンバー・メーカー・車種を空にする**。
         毎回ちがう車なので、車種名はこのあと手で打ってもらう（打った名前がカード・表紙・実績に出る）。 */
      if(isPerVisit(v)){
        c.perVisit=true; c.vehId=v.id; c.plate=''; c.maker=''; c.car='';
        if(window.pitToast) pitToast('都度車両変動のお客様です。今回の車種名を入力してください', 'PF-6002');
      } else {
        c.perVisit=false; c.vehId=v.id;
        c.plate=v.plate||c.plate; c.maker=v.maker||c.maker; c.car=v.car||c.car;
      }
      if(v.boardId)c.boardId=v.boardId; if(v.division)c.division=v.division; if(v.frontStaff)c.frontStaff=v.frontStaff; if(v.karteNo)c.karteNo=v.karteNo;
    }
    renderCardForm(c);
  };

  /* ===== 顧客ビュー（人の行＋展開で車両） ===== */
  let _q='', _sortKey='updatedAt', _sortDir='desc';
  let _detailFromSearch=false;   // 顧客詳細を検索結果から開いたか（閉じたら検索結果に戻す）
  const _filters={ board:'', div:'', front:'', maker:'' };
  const _expanded=new Set();
  function fmtDate(ms){ if(!ms) return '—'; const d=new Date(ms); return d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate(); }
  function _distinctVeh(key){ const s=new Set(); list().forEach(cust=>(cust.vehicles||[]).forEach(v=>{ const x=(v[key]||'').trim(); if(x) s.add(x); })); return Array.from(s).sort((a,b)=>norm(a).localeCompare(norm(b),'ja')); }
  function custMatchFilter(cust){
    /* 🔴 v1.52.0 絞り込みも「いま持っている車」だけで見る（アーカイブした車は一覧に出さないため） */
    const vs=liveVehs(cust);
    if(_filters.board && !vs.some(v=>(v.boardId||'')===_filters.board)) return false;
    if(_filters.div   && !vs.some(v=>(v.division||'')===_filters.div)) return false;
    if(_filters.front && !vs.some(v=>(v.frontStaff||'')===_filters.front)) return false;
    if(_filters.maker && !vs.some(v=>(v.maker||'')===_filters.maker)) return false;
    return true;
  }
  function firstVeh(cust){ return liveVehs(cust)[0] || (cust.vehicles||[])[0] || {}; }
  function sortVal(cust,k){
    const v=firstVeh(cust);
    switch(k){
      case 'name':  return norm(cust.kana)||norm(cust.name);
      case 'kana':  return norm(cust.kana);
      case 'maker': return norm(v.maker);
      case 'karte': return norm(v.karteNo);
      case 'car':   return norm(v.car);
      case 'plate': return norm(v.plate);
      case 'tel':   return norm(primaryTel(cust));
      case 'board': return v.boardId==='default'?'1':(v.boardId==='import'?'2':'9');
      case 'div':   return v.division||'z';
      case 'front': return norm(frontName(v));
      case 'updatedAt': return cust.updatedAt||0;
    }
    return '';
  }
  /* 🔴 v1.49.0 顧客一覧・検索の切替。false＝ふつうの顧客だけ／true＝**アーカイブ済みだけ**（ゆうた指定）。
     ⚠ 画面の中だけで覚える（保存しない）。顧客画面を開き直せば「ふつう」に戻る。 */
  let _archMode=false;
  window.custToggleArchived=function(){ _archMode=!_archMode; renderCustomers(); };
  window.custIsArchivedMode=function(){ return _archMode; };
  function _archived(cust){ return window.PitArchive ? PitArchive.custArchived(cust) : !!(cust&&cust.archived); }
  function _rows(){
    const q=norm(_q);
    let rows=list().filter(cust=>{ if(_archived(cust)!==_archMode) return false; if(q&&!match(cust,q)) return false; if(!custMatchFilter(cust)) return false; return true; });
    const dir=_sortDir==='asc'?1:-1;
    rows.sort((a,b)=>{ const va=sortVal(a,_sortKey), vb=sortVal(b,_sortKey); if(va<vb) return -dir; if(va>vb) return dir; return (b.updatedAt||0)-(a.updatedAt||0); });
    return rows;
  }
  window.custSort=function(k){ if(_sortKey===k){_sortDir=_sortDir==='asc'?'desc':'asc';} else {_sortKey=k;_sortDir=(k==='updatedAt')?'desc':'asc';} renderCustTable(); };
  window.custSetFilter=function(kind,val){ _filters[kind]=val; renderCustTable(); };
  window.custToggleExpand=function(id){ if(_expanded.has(id)) _expanded.delete(id); else _expanded.add(id); renderCustTable(); };

  window.renderCustomers=function(){
    const wrap=document.getElementById('view-customers-body'); if(!wrap) return;
    const opt=(arr,sel,ph)=>'<option value="">'+ph+'</option>'+arr.map(v=>'<option value="'+esc(v)+'"'+(sel===v?' selected':'')+'>'+esc(v)+'</option>').join('');
    let h='';
    h+='<div class="cust-head">'+
       '<input class="cust-search"placeholder="'+(_archMode?'アーカイブ済みから探す（名前・ナンバー・車・電話）':'名前・カナ(ひらがなOK)・ナンバー・車・電話で絞り込み')+'"value="'+esc(_q)+'"oninput="custFilter(this.value)">'+
       /* 🔴 v1.49.0 アーカイブ済みへの切替（ゆうた指定）。押している間は一覧が入れ替わる。 */
       '<button type="button" class="cust-archbtn'+(_archMode?' on':'')+'" onclick="custToggleArchived()" title="'+(_archMode?'ふつうの顧客一覧に戻る':'アーカイブ済みの顧客を探す')+'">'+
         (_archMode?'<i data-ic=users data-ics=15></i> 通常検索へ':'<i data-ic=box data-ics=15></i> アーカイブ検索')+'</button>'+
       '<span class="cust-count" id="cust-count"></span>'+
       '</div>';
    h+='<div class="cust-filters">'+
       '<select class="cust-fsel" onchange="custSetFilter(\'board\',this.value)"><option value="">区分：すべて</option>'+
         '<option value="default"'+(_filters.board==='default'?' selected':'')+'>国産車</option>'+
         '<option value="import"'+(_filters.board==='import'?' selected':'')+'>輸入車</option></select>'+
       '<select class="cust-fsel" onchange="custSetFilter(\'div\',this.value)"><option value="">課：すべて</option>'+
         (state.divisions||[]).map(d=>'<option value="'+d.id+'"'+(_filters.div===d.id?' selected':'')+'>'+esc(d.label)+'</option>').join('')+'</select>'+
       '<select class="cust-fsel" onchange="custSetFilter(\'front\',this.value)">'+opt(_distinctVeh('frontStaff'),_filters.front,'担当：すべて')+'</select>'+
       '<select class="cust-fsel" onchange="custSetFilter(\'maker\',this.value)">'+opt(_distinctVeh('maker'),_filters.maker,'メーカー：すべて')+'</select>'+
       '</div>';
    h+='<div id="cust-thost"></div>';
    wrap.innerHTML=h;
    renderCustTable();
  };
  window.renderCustTable=function(){
    const host=document.getElementById('cust-thost'); if(!host) return;
    const rows=_rows();
    const _all=list().filter(c=>_archived(c)===_archMode).length;
    const cnt=document.getElementById('cust-count');
    if(cnt) cnt.textContent=rows.length+' 人 / '+(_archMode?'アーカイブ済み ':'')+'全 '+_all+' 人';
    if(!rows.length){ host.innerHTML='<div class="cust-empty">'+(_archMode?'アーカイブ済みの顧客はいません':(list().length?'該当なし':'まだ登録がありません。入庫カードを保存すると自動で貯まります。'))+'</div>'; return; }
    // 以前の1行テーブル。基本1人1行＝先頭車両を表示。2台目以降は「車の欄だけ」を下に増やす（人の欄は空）
    const cols=[ ['name','名前'],['kana','カナ'],['maker','メーカー'],['karte','カルテNo'],['car','車種'],['plate','ナンバー'],['tel','TEL'],['board','区分'],['div','課'],['front','担当'],['updatedAt','最終入庫'] ];
    const arrow=k=> _sortKey===k?(_sortDir==='asc'?' <i data-ic=chevUp data-ics=15></i>':' <i data-ic=chevDown data-ics=15></i>'):'';
    let h='<div class="ct-wrap"><table class="ct"><thead><tr>';
    cols.forEach(c=>{ h+='<th class="ct-th'+(_sortKey===c[0]?' on':'')+'" onclick="custSort(\''+c[0]+'\')">'+esc(c[1])+arrow(c[0])+'</th>'; });
    h+='<th class="ct-th ct-acth">操作</th></tr></thead><tbody>';
    let shownRows=0;
    for(let ri=0; ri<rows.length && shownRows<400; ri++){
      const cust=rows[ri];
      /* 🔴 v1.52.0（ゆうた指定）**アーカイブした車は一覧に出さない**。
         ⚠ 前は「現所有＋アーカイブ」で1人が2行になっていた。いま持っている車だけ並べる。 */
      const _live=liveVehs(cust);
      const vs=_live.length?_live:[null];
      vs.forEach(function(v,vi){
        const first=vi===0, last=vi===vs.length-1;
        const t=teamInfo(v||{});
        const pillC=(s,col)=>s?'<span class="ct-pill" style="background:'+col+'22;color:'+col+';border-color:'+col+'66">'+esc(s)+'</span>':'—';
        h+='<tr class="'+(last?'ct-rb':'ct-norb')+(first?'':' ct-cont')+' ct-clickrow" onclick="custOpen(\''+cust.id+'\')" title="顧客詳細を開く">'+
           '<td class="ct-name">'+(first?esc(custDispName(cust)||'(無名)'):'')+'</td>'+
           '<td class="ct-mut">'+(first?esc(cust.kana||'—'):'')+'</td>'+
           '<td>'+(v?esc(v.maker||'—'):'—')+'</td>'+
           '<td class="ct-mut">'+(v?esc(v.karteNo||'—'):'—')+'</td>'+
           '<td>'+(v?esc(v.car||(isPerVisit(v)?(v.lastCar?('前回：'+v.lastCar):'—'):'—')):'—')+'</td>'+
           /* 🔴 v1.52.0 都度車両変動の車は**ナンバーを持たない**ので、代わりに印を出す */
           '<td class="ct-mut">'+(v?(isPerVisit(v)?'<span class="ct-pv">都度変動</span>':esc(v.plate||'—')):'—')+'</td>'+
           '<td class="ct-mut">'+(first?esc(primaryTel(cust)||'—'):'')+'</td>'+
           '<td>'+pillC(t.label,t.color)+'</td>'+
           '<td>'+pillC(t.course,t.courseColor)+'</td>'+
           '<td>'+(v?(esc(frontName(v)||'—')+(frontMark(v)?'<small style="color:var(--text3)">'+frontMark(v)+'</small>':'')):'—')+'</td>'+
           '<td class="ct-mut">'+(v?fmtDate(v.updatedAt):(first?fmtDate(cust.updatedAt):''))+'</td>'+
           /* 🔴 v1.52.0（ゆうた指定）**Lステップは新規予約の「右」**。
              ⚠ Lステップが有る人と無い人で新規予約の位置がガタつかないよう、
                 無い人にも**同じ幅の空きマス**を置いて位置を固定する。 */
           '<td class="ct-act"><div class="ct-actrow">'+
             '<button class="ct-b ct-bnew" onclick="event.stopPropagation();custNewReserveFor(\''+cust.id+'\',\''+((v&&v.id)||'')+'\')" title="この車で新規予約">🆕 新規予約</button>'+
             ((first && (cust.lineStatus||'')==='ok' && (cust.lstepId||'').trim() && window.pitLstepUrl)
               ? '<a class="ct-licon" href="'+esc(pitLstepUrl(cust.lstepId))+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Lステップを開く">L</a>'
               : '<span class="ct-licon-none" aria-hidden="true"></span>')+
           '</div></td>'+
           '</tr>';
        shownRows++;
      });
    }
    h+='</tbody></table></div>';
    if(rows.length>300) h+='<div class="cust-empty">（先頭の方を表示）絞り込みで探してください</div>';
    host.innerHTML=h;
  };
  window.custFilter=function(v){ _q=v; renderCustTable(); };   // 検索欄は据え置き＝IME(変換)が壊れない
  /* 🔴 v1.49.0 「削除」はやめて「アーカイブ」に（ゆうた指定）。
     ⚠ **データは消さない**＝印を立てるだけ。検索から消えるが、履歴も金額もそのまま残る。
     ⚠ 戻せるのは**管理者だけ**（archive-pit.js が判定）。 */
  /* 🔴 v1.49.1 確認は**アプリの中のダイアログ（UI.confirm）**で出す（ゆうた指定＝どれにも確認を入れる）。
     ⚠ ブラウザ標準の confirm() は出ている間 JS が止まって「反応が悪い」体感になるので使わない
        （ui-dialog.js の注記どおり）。UI が無い環境でだけ confirm() に落とす。
     ⚠ **アーカイブする・戻す・乗り換え** の3つとも、必ずここを通す。 */
  function _ask(title, detail, okLabel, danger){
    if(window.UI && UI.confirm) return UI.confirm(title, { detail:detail, ok:okLabel||'OK', cancel:'やめる', danger:!!danger });
    return Promise.resolve(window.confirm(title + '\n\n' + (detail||'')));
  }
  /* 🔴 v1.136.0 断り方は `archive-pit.js` の1本（`PitArchive.denyRestore`）に寄せた。
     ⚠ ここに文言を書き写すと、カード側（予約カードのアーカイブ）とズレる。
        エラー番号 PF-0020 も1か所からしか出さない（テストが見張っている）。 */
  function _deny(){
    if (window.PitArchive && PitArchive.denyRestore) { PitArchive.denyRestore(); return; }
    if (window.UI && UI.alert) UI.alert('戻せるのは管理者だけです', { detail:'アーカイブから戻す操作は、PitFlow の役割が「管理」の人だけができます。' });
  }
  window.custArchive=function(id){
    const c=list().find(r=>r.id===id); if(!c) return;
    _ask('「'+(custDispName(c)||'(無名)')+'」様をアーカイブしますか？',
         '・検索や顧客呼び出しに出なくなります（この方の車も全部）\n・データは消えません。履歴も金額もそのまま残ります\n・戻せるのは管理者だけです',
         'アーカイブする', true).then(function(okd){
      if(!okd) return;
      if(window.PitArchive) PitArchive.archiveCust(id);
      _expanded.delete(id);
      if(window.pitToast) pitToast('アーカイブしました');
      closeModal(); renderCustomers();
    });
  };
  window.custRestore=function(id){
    if(window.PitArchive && !PitArchive.canRestore()){ _deny(); return; }
    const c=list().find(r=>r.id===id); if(!c) return;
    _ask('「'+(custDispName(c)||'(無名)')+'」様を元に戻しますか？',
         '・検索や顧客呼び出しにまた出るようになります\n・1台ずつアーカイブした車は、アーカイブのままです',
         '元に戻す').then(function(okd){
      if(!okd) return;
      if(window.PitArchive) PitArchive.restoreCust(id);
      if(window.pitToast) pitToast('元に戻しました');
      closeModal(); renderCustomers();
    });
  };
  /* 車両ごとのアーカイブ／戻す */
  window.custVehArchive=function(custId,vehId){
    const c=list().find(r=>r.id===custId); if(!c) return;
    const v=(c.vehicles||[]).find(x=>x.id===vehId); if(!v) return;
    const nm=((v.maker?v.maker+' ':'')+(v.car||'')).trim()||v.plate||'この車';
    _ask(nm+' をアーカイブしますか？',
         (v.plate?('ナンバー：'+v.plate+'\n'):'')+'・検索や顧客呼び出しに出なくなります\n・入庫の履歴は顧客詳細に残ります\n・戻せるのは管理者だけです',
         'アーカイブする', true).then(function(okd){
      if(!okd) return;
      if(window.PitArchive) PitArchive.archiveVeh(custId,vehId);
      if(window.pitToast) pitToast('この車をアーカイブしました');
      custOpen(custId);
    });
  };
  window.custVehRestore=function(custId,vehId){
    if(window.PitArchive && !PitArchive.canRestore()){ _deny(); return; }
    const c=list().find(r=>r.id===custId); if(!c) return;
    const v=(c.vehicles||[]).find(x=>x.id===vehId); if(!v) return;
    const nm=((v.maker?v.maker+' ':'')+(v.car||'')).trim()||v.plate||'この車';
    _ask(nm+' を元に戻しますか？', (v.plate?('ナンバー：'+v.plate+'\n'):'')+'・検索や顧客呼び出しにまた出るようになります',
         '元に戻す').then(function(okd){
      if(!okd) return;
      if(window.PitArchive) PitArchive.restoreVeh(custId,vehId);
      if(window.pitToast) pitToast('この車を元に戻しました');
      custOpen(custId);
    });
  };
  window.custReseed=function(){
    pitAsk('サンプル顧客を入れ替えます（今の控えは消えます）。よろしいですか？', { danger:true, ok:'入れ替える' }).then(function(yes){
      if(!yes) return;
      if(window.seedSampleCustomers) seedSampleCustomers(400,true);
    });
  };

  /* ===== モーダル共通 ===== */
  function openModal(html, boxClass){
    let m=document.getElementById('cust-modal');
    if(!m){ m=document.createElement('div'); m.id='cust-modal'; m.className='cm-overlay'; document.body.appendChild(m); }
    m.innerHTML='<div class="cm-box '+(boxClass||'')+'">'+html+'</div>';
    m.classList.add('show');
    m.onclick=function(e){ if(e.target===m) closeModal(); };
  }
  function closeModal(){
    const m=document.getElementById('cust-modal'); if(m){ m.classList.remove('show'); m.innerHTML=''; }
    if(_detailFromSearch){ _detailFromSearch=false; if(window.pitSearchReopen) pitSearchReopen(); }   // 検索結果に戻す
  }
  window.custCloseModal=closeModal;
  /* 🔴 v1.52.0 顧客・車両の登録画面（cust-reg.js）から同じモーダルの器を使うために外へ出す */
  window.custShowModal=openModal;

  /* ===== 編集（人＋連絡先＋車両） ===== */
  function _boardSel(v){ return '<select class="ce-board"><option value="">—</option><option value="default"'+(v==='default'?' selected':'')+'>国産</option><option value="import"'+(v==='import'?' selected':'')+'>輸入</option></select>'; }
  function _divSel(v){ return '<select class="ce-div"><option value="">—</option>'+(state.divisions||[]).map(d=>'<option value="'+d.id+'"'+(v===d.id?' selected':'')+'>'+esc(d.label)+'</option>').join('')+'</select>'; }
  function _frontSel(v){ return '<select class="ce-front"><option value="">—</option>'+frontStaffList().map(n=>'<option value="'+esc(n)+'"'+(v===n?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select>'; }
  function _renderEdit(cust){
    let h='<div class="cm-head"><i data-ic=pencil data-ics=16></i> 顧客を編集 <span class="cm-sub">'+esc(custDispName(cust)||'')+'</span><button class="cm-x" onclick="custCloseModal()"><i data-ic=close data-ics=16></i></button></div><div class="cm-body">';
    h+='<div class="cm-2"><div class="cm-f"><label>お客様名</label><input id="ce-name" value="'+esc(cust.name||'')+'"></div>'+
       '<div class="cm-f"><label>カナ</label><input id="ce-kana" value="'+esc(cust.kana||'')+'"></div></div>';
    // 連絡先
    h+='<div class="ce-sec">連絡先</div><div id="ce-contacts">';
    (cust.contacts||[]).forEach(function(ct){
      h+='<div class="ce-ct"><label class="cf-ct-pri"><input type="radio" name="ce-pri" '+(ct.primary?'checked':'')+'> 優先</label>'+
         '<input class="ce-ctel" value="'+esc(ct.tel||'')+'" placeholder="090-1234-5678">'+
         '<input class="ce-clabel" value="'+esc(ct.label||'')+'" placeholder="ラベル">'+
         '<button type="button" class="cf-ct-del" onclick="custEditDelContact(this)"><i data-ic=trash data-ics=16></i></button></div>';
    });
    h+='</div><button class="ce-add" onclick="custEditAddContact()">＋ 連絡先</button>';
    // LINE（新規予約欄と同じ：未案内/LINE NG/登録済＋Lステップ番号）
    const lineOpts=[['','未案内'],['ng','LINE NG'],['ok','登録済']].map(function(o){ return '<option value="'+o[0]+'"'+(((cust.lineStatus||'')===o[0])?' selected':'')+'>'+o[1]+'</option>'; }).join('');
    const ceIsOk=((cust.lineStatus||'')==='ok');
    const ceUrl=(ceIsOk && (cust.lstepId||'').trim() && window.pitLstepUrl)?pitLstepUrl(cust.lstepId):'';
    h+='<div class="ce-sec">LINE</div><div class="ce-line">'+
       '<select id="ce-line-status" class="ce-line-sel" onchange="custEditSyncLine()">'+lineOpts+'</select>'+
       '<input id="ce-lstep" class="ce-line-id" value="'+esc(cust.lstepId||'')+'" placeholder="Lステップ番号 / URL貼付OK（登録済のとき）" oninput="custEditSyncLine()"'+(ceIsOk?'':' style="display:none"')+'>'+
       '<a id="ce-lstep-link" class="ct-bline" href="'+esc(ceUrl)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Lステップを開く"'+(ceUrl?'':' style="display:none"')+'><i data-ic=link data-ics=16></i> Lステップ</a>'+
       '</div>';
    // 車両
    h+='<div class="ce-sec">車両（複数台OK）</div><div id="ce-vehicles">';
    (cust.vehicles||[]).forEach(function(v){
      /* 🔴 v1.52.0 片付けた車・都度変動の車は、編集画面でもひと目で分かるように印を出す */
      const vTag = (vehArchivedSelf(v)?'<span class="ce-vtag arch"><i data-ic=box data-ics=13></i> アーカイブ済み</span>':'')
                 + (isPerVisit(v)?'<span class="ce-vtag pv"><i data-ic=swap data-ics=13></i> 都度車両変動（ナンバーなし）</span>':'');
      h+='<div class="ce-veh'+(vehArchivedSelf(v)?' ce-veh-arch':'')+'" data-vid="'+esc(v.id||'')+'">'+(vTag?'<div class="ce-vtags">'+vTag+'</div>':'')+'<div class="ce-veh-l">'+
         '<input class="ce-plate" value="'+esc(v.plate||'')+'" placeholder="'+(isPerVisit(v)?'（都度変動＝ナンバーなし）':'野田 300 ひ 5555')+'"'+(isPerVisit(v)?' disabled':'')+'>'+
         '<input class="ce-maker" value="'+esc(v.maker||'')+'" placeholder="メーカー">'+
         '<input class="ce-car" value="'+esc(v.car||'')+'" placeholder="車種">'+
         '<input class="ce-karte" value="'+esc(v.karteNo||'')+'" placeholder="カルテNo">'+
         /* 🚗 v2.2.0 車体番号。クォーターチェックが伝票から入れるが、手でも直せる */
         '<input class="ce-vin" value="'+esc(v.vin||'')+'" placeholder="車体番号">'+
         '</div><div class="ce-veh-r">'+_boardSel(v.boardId)+_divSel(v.division)+_frontSel(v.frontStaff)+
         '<button type="button" class="cf-ct-del" onclick="custEditDelVehicle(this)"><i data-ic=trash data-ics=16></i></button></div></div>';
    });
    h+='</div><button class="ce-add" onclick="custEditAddVehicle()">＋ 車両を追加</button>';
    h+='</div><div class="cm-foot"><button class="cm-cancel" onclick="custCloseModal()">キャンセル</button><button class="cm-save" onclick="custSaveEdit(\''+cust.id+'\')">保存</button></div>';
    openModal(h);
  }
  function _readEdit(cust){
    const g=id=>{ const e=document.getElementById(id); return e?e.value.trim():''; };
    cust.name=g('ce-name'); cust.kana=g('ce-kana');
    const lsel=document.getElementById('ce-line-status'); cust.lineStatus=lsel?lsel.value:'';
    cust.lstepId=g('ce-lstep');
    const contacts=[];
    document.querySelectorAll('#ce-contacts .ce-ct').forEach(function(row){
      const tel=(row.querySelector('.ce-ctel').value||'').trim();
      const label=(row.querySelector('.ce-clabel').value||'').trim();
      const primary=row.querySelector('input[name="ce-pri"]').checked;
      if(tel||label) contacts.push({tel,label,primary});
    });
    if(contacts.length && !contacts.some(x=>x.primary)) contacts[0].primary=true;
    cust.contacts=contacts;
    const vehicles=[];
    document.querySelectorAll('#ce-vehicles .ce-veh').forEach(function(row){
      const plate=(row.querySelector('.ce-plate').value||'').trim();
      const maker=(row.querySelector('.ce-maker').value||'').trim();
      const car=(row.querySelector('.ce-car').value||'').trim();
      const ke=row.querySelector('.ce-karte'); const karteNo=ke?(ke.value||'').trim():'';
      /* 🚗 v2.2.0 車体番号。⚠ 画面に無い項目は触らない（prev から引き継ぐ）ので、ここで読む */
      const ve=row.querySelector('.ce-vin'); const vin=ve?(ve.value||'').trim():'';
      const boardId=row.querySelector('.ce-board').value;
      const division=row.querySelector('.ce-div').value;
      const frontStaff=row.querySelector('.ce-front').value;
      /* v1.5.0：担当はメンバーの番号も一緒に持つ（CoreFlowで改名されても追従できるように） */
      const _fm = window.pitStaffByName ? window.pitStaffByName(frontStaff) : null;
      const vid=row.dataset.vid||('v'+Date.now()+Math.floor(Math.random()*1000));
      /* 🔴 v1.52.0 **元の車のデータに上書きする**（作り直さない）。
         ⚠ 前は毎回まっさらな車を組み立て直していたので、編集して保存するだけで
            **アーカイブの印（archived）や「都度車両変動」の印が消えていた**。
            画面に無い項目は触らない、が鉄則。 */
      const prev=((cust.vehicles||[]).find(x=>x&&x.id===vid))||{};
      const isPV=!!prev.perVisit;
      if(plate||maker||car||isPV||(karteNo&&prev.id)) vehicles.push(Object.assign({}, prev, { id:vid, plate,maker,car,karteNo,vin,boardId,division,frontStaff, frontStaffId:(_fm?_fm.id:'') }));
    });
    cust.vehicles=vehicles;
  }
  window.custEdit=function(id){ const cust=list().find(x=>x.id===id); if(!cust) return; _renderEdit(cust); };
  window.custSaveEdit=function(id){
    const cust=list().find(x=>x.id===id); if(!cust) return;
    _readEdit(cust); cust.updatedAt=Date.now();
    if(window.PitDB) PitDB.save(); closeModal(); renderCustomers();
  };
  window.custEditAddContact=function(){ const cust=_editTarget(); if(!cust) return; _readEdit(cust); cust.contacts.push({tel:'',label:'',primary:!cust.contacts.length}); _renderEdit(cust); };
  window.custEditDelContact=function(btn){ const cust=_editTarget(); if(!cust) return; _readEdit(cust); const row=btn.closest('.ce-ct'); const rows=[].slice.call(document.querySelectorAll('#ce-contacts .ce-ct')); const i=rows.indexOf(row); if(i>=0) cust.contacts.splice(i,1); _renderEdit(cust); };
  window.custEditAddVehicle=function(){ const cust=_editTarget(); if(!cust) return; _readEdit(cust); const base=cust.vehicles[cust.vehicles.length-1]||{}; cust.vehicles.push({ id:'v'+Date.now()+Math.floor(Math.random()*1000), plate:'',maker:'',car:'', boardId:base.boardId||'', division:base.division||'', frontStaff:base.frontStaff||'' }); _renderEdit(cust); };
  window.custEditDelVehicle=function(btn){ const cust=_editTarget(); if(!cust) return; _readEdit(cust); const row=btn.closest('.ce-veh'); const rows=[].slice.call(document.querySelectorAll('#ce-vehicles .ce-veh')); const i=rows.indexOf(row); if(i>=0) cust.vehicles.splice(i,1); _renderEdit(cust); };
  // v0.96.1 編集画面のLINE欄：状態=登録済のときだけ番号入力を出し、番号→🔗Lステップリンクを自動生成（新規予約欄と同じ挙動）
  window.custEditSyncLine=function(){
    const sel=document.getElementById('ce-line-status');
    const inp=document.getElementById('ce-lstep');
    const link=document.getElementById('ce-lstep-link');
    if(!sel||!inp||!link) return;
    const ok=sel.value==='ok';
    inp.style.display=ok?'':'none';
    const url=(ok && inp.value.trim() && window.pitLstepUrl)?pitLstepUrl(inp.value.trim()):'';
    if(url){ link.href=url; link.style.display=''; }
    else { link.removeAttribute('href'); link.style.display='none'; }
  };
  function _editTarget(){ const head=document.querySelector('#cust-modal .cm-save'); if(!head) return null; const m=head.getAttribute('onclick')||''; const id=(m.match(/custSaveEdit\('([^']+)'\)/)||[])[1]; return id?list().find(x=>x.id===id):null; }

  /* ===== 履歴（車両＝そのナンバー単位） ===== */
  function cardDate(c){ return c.returnDate || c.reserveDate || ''; }
  /* 🧾 v2.2.0 その入庫にぶら下がっている伝票を引く（🔴 1予約に1伝票） */
  /* 🧾 v2.11.2（ゆうた「ナンバーがなくても伝票とは紐づくわけだから」）
     🔴 **伝票は予約番号で紐づく。** まずその車の中を見て、無ければ**全部の車から探す**。
     ⚠ 1予約に1伝票なので、見つかったら1つだけ。 */
  function _denOf(veh, c){
    const res=String((c&&c.resNo)||'').trim();
    if(!res) return null;
    const mine=(veh&&Array.isArray(veh.伝票))?veh.伝票:[];
    const hit=mine.find(x=>x&&String(x.予約番号||'').trim()===res);
    if(hit) return hit;
    let out=null;
    (list()||[]).some(cu=>(cu.vehicles||[]).some(v=>{
      const f=(Array.isArray(v.伝票)?v.伝票:[]).find(x=>x&&String(x.予約番号||'').trim()===res);
      if(f){ out=f; return true; } return false;
    }));
    return out;
  }
  /* ✂️ v2.11.1 伝票の開け閉め（custDenToggle）は消した。
     ゆうた「伝票は直近のを開いた形で最初から出して。**閉じておくっていう動作は要らない**」 */
  /* ================================================================
     🕘🕘 v2.11.0 **来店履歴の画面**（ゆうた指定 2026-08-25）
     ----------------------------------------------------------------
     🗣「履歴画面自体は今**ワイドがかなりなくてスクロールが入っちゃってる**。もっと広げてほしい」
     🗣「また**左側にサイドバーを付けて履歴全体を横断**できるようにしてほしい」
     🗣「サイドバーには複数車種のために**顧客全体でみるのか、車両で見るのかのソートボタン**も搭載」

     ◎作り＝左に車の一覧、右に履歴。**見る範囲**は2つだけ。
       ・この車だけ  … 選んでいる車のぶん
       ・お客様ぜんぶ … その顧客の全部の車を混ぜて、日付の新しい順
     🔴 拾う決まりは今までどおり `_cardDone`（実績になったものだけ）1本。ここで作り直さない。
     ⚠ 覚えは `_hist` 1つ。開き直しても同じ所を見る。
     ================================================================ */
  var _hist = { custId:'', vehId:'', mode:'veh' };

  /* この顧客の「見せる車」（アーカイブ済みも履歴は見たいので出す） */
  function _histCars(cust){ return (cust.vehicles||[]).filter(function(v){ return v && isRealPlate(v.plate); }); }

  /* その車の、実績になったカード（新しい順）
     🔴 ナンバーで引く。「0」などの仮ナンバーでは引かない（他人のカードが混ざるため） */
  function _histCards(plate){
    const arr = Array.isArray(state.cards) ? state.cards : [];
    if (!isRealPlate(plate)) return { done:[], open:0 };
    const all = arr.filter(function(c){ return isRealPlate(c.plate) && norm(c.plate) === norm(plate); });
    const done = all.filter(_cardDone).slice().sort(function(a,b){ return (_doneDate(b)||'').localeCompare(_doneDate(a)||''); });
    return { done: done, open: all.length - done.length };
  }

  /* 履歴の1行 */
  function _histRow(c, veh, showCar){
    /* 🔧 作業タイプの拾い方は `pit-share.js` の `pitCardWorkTypes` 1本 */
    const _wts = (window.pitCardWorkTypes ? pitCardWorkTypes(c) : []);
    const wt = _wts[0] || null;
    const wl = _wts.length ? _wts.map(function(x){ return x.label; }).join('＋') : '—';
    const wc = wt ? wt.color : '#64748b';
    /* 🔴 状態の言葉は pit-share.js の `pitCardStatusText` 1本 */
    const st = (window.pitCardStatusText) ? pitCardStatusText(c)
             : ((typeof statusLabel === 'function') ? statusLabel(c.status) : (c.status||''));
    const amt = _cardCancelled(c) ? 'キャンセル' : _cardNoSale(c) ? '売上なし'
              : ((c.amountFinal!=null&&c.amountFinal!=='') ? ('¥'+Number(c.amountFinal).toLocaleString())
              : ((c.estAmount!=null&&c.estAmount!=='') ? ('¥'+Number(c.estAmount).toLocaleString()) : '—'));
    const dt = _doneDate(c) || '日付未定';
    /* 🔴🔴 v2.11.0 ここは `esc()` で丸ごと包まない。
       包むと `<i data-ic=van>` が**そのまま文字で出る**（ゆうた「コードの一部が出ちゃってる」）。
       ⚠ 中の値（名前・期間）だけを esc する。 */
    let loa = '';
    if (c.needLoaner){
      const l = (state.loaners||[]).find(function(x){ return x.id===c.loanerId; });
      const nm = (window.pitLoanerModel?pitLoanerModel(c.loanerId):'') || (l ? (l.name||'代車') : '');
      const pr = (window.pitLoanerPeriodOf?pitLoanerPeriodOf(c).text:'');
      loa = '<span class="ch-loa"><i data-ic=van data-ics=15></i>代車'
          + (nm?('（'+esc(nm)+'）'):'') + (pr?(' '+esc(pr)):'') + '</span>';
    }
    /* 🧾 その入庫の伝票（クォーターチェックが書き込んだもの）。1予約に1伝票。 */
    const den = _denOf(veh, c);
    const ara = den ? (Number(den.金額||0)-Number(den.原価||0)) : 0;
    const pct = (den&&Number(den.金額)) ? Math.round(ara/Number(den.金額)*1000)/10 : 0;
    const hou = den ? ((den.法定||[]).reduce(function(a,x){ return a+Number(x.金額||0); },0)) : 0;
    const oid = 'dn'+esc(String(c.id||''));
    /* 2行目に並べる札（ゆうた「細かいバッチ類や返車済み等情報を羅列」） */
    let tags = '<span class="ch-tag st">'+esc(st)+'</span>';
    if (window.pitCardIntern && pitCardIntern(c)) tags += '<span class="ch-tag">'+esc(pitInternLabel(c))+'</span>';
    (Array.isArray(c.workSpecials)?c.workSpecials:[]).forEach(function(id){
      const lb = window.pitSpecialLabel ? pitSpecialLabel(id) : '';
      if (lb) tags += '<span class="ch-tag">'+esc(lb)+'</span>';
    });
    if (c.earlyDiscount) tags += '<span class="ch-tag">早期割</span>';
    if (c.resNo) tags += '<span class="ch-tag no">'+esc(c.resNo)+'</span>';
    /* 🧾 v2.11.1（ゆうた）**伝票は最初から開いた形で出す。畳む動作は要らない。** */
    return '<div class="ch-item'+(den?' has-den':'')+'" id="'+oid+'">'
      + '<div class="ch-row">'
      +   '<div class="ch-dt">'+esc(dt)+'</div>'
      +   '<div class="ch-wt" style="background:'+wc+'">'+esc(wl)+'</div>'
      +   '<div class="ch-mid">'
      +     '<div class="ch-l1"><b>'+esc(c.car||'—')+'</b>'
      +       (showCar && c.plate ? '<span class="ch-plate">'+esc(c.plate)+'</span>' : '')
      +       (c.frontStaff?'<span class="ch-st2">担当 '+esc(c.frontStaff)+'</span>':'')
      +       loa + '</div>'
      +     (c.menu?'<div class="ch-sub">'+esc(String(c.menu).split('\n')[0])+'</div>':'')
      +     '<div class="ch-tags">'+tags+'</div>'
      +   '</div>'
      +   '<div class="ch-amt">'+esc(amt)+'</div>'
      +   '<div class="ch-btns">'+_histBtns(c, { detail:true })+'</div>'
      + '</div>'
      + (den?'<div class="ch-den">'
             + '<div class="ch-den-h"><b>'+Number(den.金額||0).toLocaleString()+'円</b>'
             + '<span>原価 '+Number(den.原価||0).toLocaleString()+'円</span>'
             + '<em>粗利 '+ara.toLocaleString()+'円（'+pct+'%）</em>'
             + (hou?'<span class="ch-den-hou">＋法定費用 '+hou.toLocaleString()+'円</span>':'')
             + '<i>伝票 '+esc(den.伝票番号||'')+'</i></div>'
             + (window.pitQDenTable?pitQDenTable(den):'')
           + '</div>':'')
      + '</div>';
  }

  /* ================================================================
     🔘 v2.11.1 行の右のボタン（ゆうた「実績ボードは別途ボタンにして履歴と並べて」）
     ----------------------------------------------------------------
     🔴 **状態は押させない。** 「返車済み」は**ただの札**にして、
        飛び先は**ボタン**として並べる（押せる所と、読む所を混ぜない）。
     ⚠ 作り方はここ1本。顧客詳細の行も、履歴の画面の行も同じ形を使う。
     ================================================================ */
  function _histBtns(c, opt){
    opt = opt || {};
    const isNS = _cardNoSale(c) || _cardCancelled(c);
    /* ⚠ アイコンは出す／出さないを選べる。並べる場所によって見え方が変わるため。 */
    const ic = (opt.icons === false) ? function(){ return ''; }
                                     : function(n){ return '<i data-ic='+n+' data-ics=14></i> '; };
    let h = '';
    if (opt.hist){
      h += '<button class="cd-b" onclick="event.stopPropagation();custHistory(\''+opt.hist.custId+'\',\''+esc(opt.hist.vehId||'')+'\',\''+esc(c.id)+'\')">'
         +   ic('clock') + '履歴</button>';
    }
    if (c.status === 'reserved'){
      h += '<button class="cd-b" onclick="event.stopPropagation();pitGotoReserveDate(\''+esc(c.reserveDate||'')+'\')">'
         +   ic('calendar') + '予約表</button>';
    } else if (c.status === 'returned' && !isNS){
      h += '<button class="cd-b" onclick="event.stopPropagation();pitGotoResultMonth(\''+esc(c.returnDate||c.reserveDate||'')+'\')">'
         +   ic('chart') + '実績ボード</button>';
    }
    if (opt.detail){
      h += '<button class="cd-b" onclick="event.stopPropagation();pitOpenCardDetail(\''+esc(c.id)+'\')">'
         +   ic('file') + '予約詳細</button>';
    }
    return h;
  }

  /* ================================================================
     🗃 v2.12.0 **カードが無い伝票の行**（PitFlow を始める前のぶん）
     ----------------------------------------------------------------
     来店履歴は「カードにぶら下がった伝票」を出す作りだが、
     始動前の伝票には予約カードが無い。**それでも出さないと、入れた意味が無い。**
     🔴 出し方は**カードの行とそろえる**（同じカード・同じ札・同じ伝票の表）。
     ⚠ 押す先が無いのでボタンは出さない（押せて効かないボタンを作らない）。
     ================================================================ */
  function _denOnlyRow(den, veh, showCar){
    const ara=Number(den.金額||0)-Number(den.原価||0);
    const pct=Number(den.金額)?Math.round(ara/Number(den.金額)*1000)/10:0;
    const hou=(den.法定||[]).reduce((a,x)=>a+Number(x.金額||0),0);
    return '<div class="ch-item has-den" id="dnp'+esc(String(den.伝票番号||''))+'">'
      + '<div class="ch-row">'
      +   '<div class="ch-dt">'+esc(den.売上日||'')+'</div>'
      +   '<div class="ch-wt" style="background:#64748b">伝票</div>'
      +   '<div class="ch-mid">'
      +     '<div class="ch-l1"><b>'+esc((veh&&(veh.car||veh.maker))||'—')+'</b>'
      +       (showCar&&veh&&veh.plate?'<span class="ch-plate">'+esc(veh.plate)+'</span>':'')
      +       (den.フロント?'<span class="ch-st2">担当 '+esc(den.フロント)+'</span>':'')
      +     '</div>'
      +     '<div class="ch-tags"><span class="ch-tag st">PitFlow を始める前</span>'
      +       '<span class="ch-tag no">'+esc(den.伝票番号||'')+'</span></div>'
      +   '</div>'
      +   '<div class="ch-amt">¥'+Number(den.金額||0).toLocaleString()+'</div>'
      +   '<div class="ch-btns"></div>'
      + '</div>'
      + '<div class="ch-den">'
      +   '<div class="ch-den-h"><b>'+Number(den.金額||0).toLocaleString()+'円</b>'
      +   '<span>原価 '+Number(den.原価||0).toLocaleString()+'円</span>'
      +   '<em>粗利 '+ara.toLocaleString()+'円（'+pct+'%）</em>'
      +   (hou?'<span class="ch-den-hou">＋法定費用 '+hou.toLocaleString()+'円</span>':'')
      +   '<i>伝票 '+esc(den.伝票番号||'')+'</i></div>'
      +   (window.pitQDenTable?pitQDenTable(den):'')
      + '</div></div>';
  }
  /* その車の伝票のうち、**どのカードにも紐づいていない**もの（＝始動前のぶん） */
  function _denOnly(veh, cards){
    const a=(veh&&Array.isArray(veh.伝票))?veh.伝票:[];
    const used={}; (cards||[]).forEach(c=>{ if(c&&c.resNo) used[String(c.resNo).trim()]=1; });
    return a.filter(x=>x && !(String(x.予約番号||'').trim() && used[String(x.予約番号).trim()]));
  }

  function _histHtml(){
    /* ⚠ 1件だけの道（車に紐づかないカード）ではお客様が引けない。空で進める。 */
    const cust = list().find(function(x){ return x.id===_hist.custId; }) || null;
    if (!cust && !_hist.only) return '';
    const cars = cust ? _histCars(cust) : [];
    const cur  = cars.find(function(v){ return v.id===_hist.vehId; }) || cars[0] || null;
    const ぜんぶ = (_hist.mode === 'cust');

    /* 出す行を作る。お客様ぜんぶの時は全部の車を混ぜて、日付の新しい順 */
    let rows = [], open = 0;
    /* 🔴 v2.11.2（ゆうた「1件なら1件だし」）
       ナンバーが無くて車に紐づかないカードは、**そのカード1件だけ**を出す。
       ＝ 押しても何も出ない、という行き止まりを作らない。 */
    if (_hist.only){
      const c = (state.cards||[]).find(x => x && x.id === _hist.only);
      if (c) rows = [{ c:c, v:cur }];
    } else if (ぜんぶ){
      cars.forEach(function(v){
        const r = _histCards(v.plate); open += r.open;
        r.done.forEach(function(c){ rows.push({ c:c, v:v }); });
        /* 🗃 v2.12.0 カードが無い伝票（始動前）も混ぜる */
        _denOnly(v, r.done).forEach(function(dn){ rows.push({ den:dn, v:v, 日:dn.売上日 }); });
      });
      rows.sort(function(a,b){
        return (b.日||_doneDate(b.c)||'').localeCompare(a.日||_doneDate(a.c)||''); });
    } else if (cur){
      const r = _histCards(cur.plate); open = r.open;
      rows = r.done.map(function(c){ return { c:c, v:cur }; })
        .concat(_denOnly(cur, r.done).map(function(dn){ return { den:dn, v:cur, 日:dn.売上日 }; }));
      rows.sort(function(a,b){
        return (b.日||_doneDate(b.c)||'').localeCompare(a.日||_doneDate(a.c)||''); });
    }

    let h = '<div class="cm-head"><i data-ic=clock data-ics=16></i> 作業履歴 '
      + '<span class="cm-sub">'+esc((cust?custDispName(cust):(_hist.名||''))||'(無名)')+'</span>'
      + '<button class="cm-x" onclick="custCloseModal()"><i data-ic=close data-ics=16></i></button></div>';
    h += '<div class="ch-wrap">';

    /* ---- 左のサイドバー ---- */
    h += '<aside class="ch-side">';
    /* ⚠ 車が1台も無い（＝1件だけの道）時は、切替も車の一覧も出さない。
       押しても何も変わらないボタンを並べないため。 */
    if (!_hist.only){
      h += '<div class="ch-mode">'
         +   '<button class="ch-mb'+(ぜんぶ?'':' on')+'" onclick="custHistMode(\'veh\')">この車</button>'
         +   '<button class="ch-mb'+(ぜんぶ?' on':'')+'" onclick="custHistMode(\'cust\')">お客様ぜんぶ</button>'
         + '</div>';
    }
    h += '<div class="ch-cars">';
    cars.forEach(function(v){
      const _d = _histCards(v.plate).done;
      const n = _d.length + _denOnly(v, _d).length;
      const on = (!ぜんぶ && cur && v.id===cur.id);
      h += '<button class="ch-car'+(on?' on':'')+'" onclick="custHistVeh(\''+esc(v.id||'')+'\')">'
         +   '<span class="ch-car-c">'+esc(vehLabel(v))+'</span>'
         +   '<span class="ch-car-p">'+esc(v.plate||'—')+'</span>'
         +   '<span class="ch-car-n">'+n+'</span>'
         + '</button>';
    });
    h += '</div>';
    h += '<div class="ch-sum">'+rows.length+'件'+(open?('　／　予約・作業中 '+open+'件'):'')+'</div>';
    h += '</aside>';

    /* ---- 右の本体 ---- */
    h += '<div class="ch-main">';
    if (!rows.length){
      h += '<div class="cust-empty">作業履歴はまだありません。'
         + (open?'<br><b>いま予約・作業中が '+open+'件 あります</b>':'') + '</div>';
    } else {
      h += '<div class="ch-list">';
      rows.forEach(function(r){
        h += r.den ? _denOnlyRow(r.den, r.v, ぜんぶ) : _histRow(r.c, r.v, ぜんぶ);
      });
      h += '</div>';
    }
    h += '</div></div>';
    return h;
  }

  /* ⚠ アイコンを埋める入口は `pit-icons.js` の **`icoBoot`**（`pitIcons` という名前は無い）。
     見張っている MutationObserver でも埋まるが、**開いた瞬間に**埋めたいのでここでも呼ぶ。 */
  /* ⚠ アイコンを埋める入口は `pit-icons.js` の **`icoBoot`**（`pitIcons` という名前は無い）。 */
  function _histOpen(){
    openModal(_histHtml(), 'ch-box');
    const box = document.getElementById('cust-modal');
    if (window.icoBoot) { try { icoBoot(box); } catch(e){} }
    /* 🔴 v2.11.1 その行から来たなら、**そこまで動かす**（ゆうた「該当の履歴をクリックした場合はそこから」）。
       ⚠ 伝票はもう開いているので、探して読むだけでいい。 */
    if (_hist.cardId && box){
      const el = box.querySelector('#dn'+_hist.cardId);
      if (el){
        el.classList.add('is-here');
        const main = box.querySelector('.ch-main');
        if (main) main.scrollTop = Math.max(0, el.offsetTop - main.offsetTop - 8);
      }
    }
  }

  window.custHistory = function(custId, vehId, cardId){
    _hist = { custId: custId, vehId: vehId || '', mode: 'veh', cardId: String(cardId || '') };
    _histOpen();
  };
  /* 🔘 v2.11.1（ゆうた「アーカイブ済みのカード詳細の引継ぎメモの下にも履歴ボタンが欲しい」）
     カードからは**ナンバーしか手元に無い**ので、ここで顧客と車を引いて開く。
     🔴 引き方は `vehByPlate` 1本（ほかで `vehicles` を舐め直さない）。 */
  /* 🔘 v2.11.2（ゆうた「ナンバーがなくても伝票とは紐づくわけだから入れて。
        この車両ではなく単純に**作業履歴**にして。そうすればその先の画面で
        車両に紐づいたら横断できるし、1件なら1件だし」）
     🔴 **カードから開く入口はここ1本。**
       ① ナンバーでお客様の車が引けた → いつもの画面（サイドバーで横断できる）
       ② 引けなかった              → **そのカード1件だけ**を出す（行き止まりにしない）
     ⚠ 伝票は予約番号で引くので、②でも伝票は出る（`_denOf` が全部の車から探す）。 */
  window.custHistoryForCard = function(cardId){
    const c = (state.cards||[]).find(x => x && x.id === cardId);
    if (!c) return;
    const h = isRealPlate(c.plate) ? vehByPlate(c.plate) : null;
    if (h && h.cust){
      window.custHistory(h.cust.id, (h.veh && h.veh.id) || '', cardId);
      return;
    }
    _hist = { custId:'', vehId:'', mode:'veh', cardId:String(cardId||''), only:String(cardId||''),
              名: String(c.customer || (window.pitCustName?pitCustName(c):'') || '') };
    _histOpen();
  };
  /* 昔の名前（ナンバーから開く）。中身は上の1本を通す。 */
  window.custHistoryByPlate = function(plate, cardId){
    if (cardId) return window.custHistoryForCard(cardId);
    const h = vehByPlate(plate);
    if (h && h.cust) window.custHistory(h.cust.id, (h.veh && h.veh.id) || '', '');
  };
  window.custHistMode = function(m){ _hist.mode = (m==='cust'?'cust':'veh'); _histOpen(); };
  window.custHistVeh  = function(id){ _hist.vehId = id; _hist.mode = 'veh'; _histOpen(); };

  /* ===== 顧客詳細（グラフィカル・一覧の名前クリックで開く／編集・削除もここから） ===== */
  function _statusLbl(c){
    if(c.status==='reserved') return '予約';
    if(_cardCancelled(c)) return 'キャンセル';   /* 🔴 v1.101.0 人が押した予約キャンセル */
    if(_cardNoSale(c)) return '売上なし';   /* 🔴 v1.99.0 実績ではないので「返車済み」とは言わない */
    if(c.status==='returned') return '返車済み';
    const b=(state.boards||[]).find(x=>x.id===c.boardId)||(state.boards||[])[0];
    const col=b&&(b.cols||[]).find(x=>x.id===c.status);
    return col?col.name:(c.status||'');
  }
  /* 🔴 v1.54.0（ゆうた指定）**来店履歴に載せるのは「実績になったもの」だけ。**
     ⚠ 前は予約を入れた段階で履歴に出ていた。
        ゆうた＝「**あくまでタスクフローを通過して返車まで完了して、実績ボードに乗ったタイミングで記載**。
                金額もそこで本当に確定だし」。
     ⚠ 判定＝**返車済み（status='returned'）で、実績の日付（completedAt）が入っている**もの。
        これは実績ビューが見ているのと同じ印で、当日ビューの「返車済みにする」で入り、
        **同時に売上（amountFinal）も確定値で固められる**。
     ⚠ 作業完了（workDone）はまだ返車前なので**入れない**。 */
  /* 🔴 v1.99.0（ゆうた指定）**「売上なしでアーカイブ」した車も来店履歴には出す。**
     ゆうた＝「実績には反映させずに、あくまで来店しただけの扱いで、
              ただ次回以降に内容を把握できるようにしたい」
     ⚠ 実績・売上には一切乗らない（物差し＝sales-count.js の pitCardNoSale が全部ふさいでいる）。
        ここは**来店の事実だけ**を残す入口。 */
  function _cardNoSale(c){ return !!(window.pitCardNoSale && pitCardNoSale(c)); }
  /* 🔴 v1.101.0（ゆうた指定）**人が押した「予約キャンセル」も来店履歴に残す。**
     ゆうた＝「予約キャンセル。これは顧客情報の来店履歴に**キャンセルの旨を記載し、
              アーカイブとして残す**」
     ⚠ **自動で入る「未入庫（来なかった）」は出さない**（別物・ゆうた確定）。
        見分けは `c.cancelled`（人が押した）と `c.noShow`（自動）。 */
  function _cardCancelled(c){ return !!(c && c.status==='cancelled' && c.cancelled); }
  function _cardDone(c){
    if (!c) return false;
    if (_cardNoSale(c)) return true;
    if (_cardCancelled(c)) return true;
    /* 🛡 v2.9.0 保険で入金待ち＝実績日はまだ空だが、**車はもう返している**。
       来店した事実は残す（売上なしアーカイブと同じ考え方）。日付は下の `_doneDate` が返車日を使う。 */
    if (window.pitInsPayWait && pitInsPayWait(c)) return true;
    return !!(c.status==='returned' && String(c.completedAt||'').trim());
  }
  window.pitCardIsDone = _cardDone;
  /* ================================================================
     🗓🗓 v2.9.4 **「最終入庫」は、来店履歴のいちばん新しい日**（ゆうた 2026-08-25）
     ----------------------------------------------------------------
     🗣「成田 脩人さん。カードがないと。**最終入庫 2026/8/20 なぜか残っている。
     　　でも実績にはない。これなんだ？？**」
     ◎正体 …… ここは `cust.updatedAt` ／ `vehicle.updatedAt`（＝**レコードを最後に触った時刻**）を
       「最終入庫」と書いて出していた。成田さんの車は **8/20 に11/07の車検予約を作った時**に
       更新されただけで、**8/20 に入庫した事実は無い**。**札が嘘をついていた。**
     🔴 入庫の事実は**カード**にしか無い。だから来店履歴（`_custCards`）のいちばん新しい日を返す。
     🔴 **物差しはここ1本。** 検索（search.js）もこれを借りる（`updatedAt` を書き写さない）。
     ⚠ 1度も来ていないお客様は **''（空）** を返す。呼ぶ側が「まだ来店なし」と言う。
        ⚠ ここで 0 や updatedAt を代わりに返さないこと。**それが今回の嘘の作り方だった。**
     ================================================================ */
  function lastVisitOf(cust){
    if (!cust) return '';
    var a = _custCards(cust);                 /* 来店履歴＝実績になったもの。新しい順に並んでいる */
    for (var i = 0; i < a.length; i++){
      var d = String(_doneDate(a[i]) || '').trim();
      if (d) return d;                        /* 'YYYY-MM-DD' */
    }
    return '';
  }
  window.pitCustLastVisit = lastVisitOf;
  /* 🗓 v2.9.5 **その1台を「いつのこと」として置くか。** 来店履歴も実績カレンダーもここを見る。
     🔴 売上なしアーカイブは `completedAt` を**入れない**決めごと（v1.99.0・二重の守り）なので、
        `completedAt` だけを見ると**どのカレンダーにも置けない**（ゆうたが踏んだ）。
        だから来た日（入庫日）に落とす。**この落とし方はここ1本。** */
  window.pitCardDoneDate = _doneDate;
  /* その人のカード全部（予約中も含む）。件数の案内に使う */
  function _custCardsAll(cust){
    /* 🔴 v1.53.0 意味をなさないナンバー（「0」など）は突き合わせに使わない */
    const plates=(cust.vehicles||[]).filter(v=>isRealPlate(v.plate)).map(v=>norm(v.plate));
    return (Array.isArray(state.cards)?state.cards:[]).filter(function(c){
      return (c.customerId&&c.customerId===cust.id) || (isRealPlate(c.plate)&&plates.indexOf(norm(c.plate))>=0);
    });
  }
  /* 来店履歴に出すもの＝実績になったものだけ。並びは実績の日付の新しい順 */
  function _custCards(cust){
    return _custCardsAll(cust).filter(_cardDone).slice()
      .sort((a,b)=>(_doneDate(b)||'').localeCompare(_doneDate(a)||''));
  }
  /* 売上なしの車は実績カウント日を持たない＝**来た日（入庫日）**を履歴の日付にする */
  function _doneDate(c){
    if (_cardCancelled(c)) return c.reserveDate || c.cancelledAt || '';   /* 来るはずだった日 */
    if (_cardNoSale(c)) return c.reserveDate || c.returnDate || '';
    /* 🛡 v2.9.0 保険で入金待ち＝**本当の返車日**を履歴の日付にする（実績日はまだ無い） */
    if (window.pitInsPayWait && pitInsPayWait(c)) return c.returnDateFinal || c.returnDate || c.reserveDate || '';
    return c.completedAt || c.returnDate || c.reserveDate || '';
  }
  /* v0.93.0 LINE状態→表示HTML（NG=地味ピル／登録済+番号=Lステップボタン）。未案内は出さない。 */
  function _lineHtml(o){
    var st=(o&&o.lineStatus)||'';
    if(st==='ng') return '<span class="cd-pill mut">LINE NG</span>';
    if(st==='ok'){
      var id=((o&&o.lstepId)||'').trim();
      var url=(id&&window.pitLstepUrl)?pitLstepUrl(id):'';
      return url?'<a class="cd-pill green cd-line-link" href="'+esc(url)+'" target="_blank" rel="noopener" draggable="true" onclick="event.stopPropagation()"><i data-ic=link data-ics=16></i> Lステップ</a>':'<span class="cd-pill green">LINE登録済</span>';
    }
    return '';
  }
  /* v0.96.2 LINE/Lステップを連絡先と同じ「枠（cd-ct）」で1つ表示。登録済＋番号＝🔗Lステップリンク／番号なし＝LINE登録済／NG＝LINE NG。未案内は出さない。 */
  function _lineContactRow(o){
    var st=(o&&o.lineStatus)||'';
    if(st!=='ok' && st!=='ng') return '';
    var main, lab;
    if(st==='ng'){ main='LINE NG'; lab='LINE'; }
    else {
      var id=((o&&o.lstepId)||'').trim();
      var url=(id&&window.pitLstepUrl)?pitLstepUrl(id):'';
      main=url?'<a class="cd-pill green cd-line-link" href="'+esc(url)+'" target="_blank" rel="noopener" draggable="true" onclick="event.stopPropagation()" title="Lステップを開く"><i data-ic=link data-ics=16></i> Lステップ</a>':'LINE登録済';
      lab='LINE / Lステップ';
    }
    return '<div class="cd-ct"><div class="cd-ctic"><i data-ic=comment data-ics=16></i></div><div class="cd-ctmain"><div class="cd-cttel">'+main+'</div><div class="cd-ctlab">'+lab+'</div></div></div>';
  }
  /* v0.96.9 「🆕 新規予約」＝顧客/車両（or既存カード）から新規予約カードを作成。カルテNo・LINEも引き継ぐ。 */
  function _newReserveBase(){
    const id='c'+Date.now();
    const today=(typeof ymd==='function')?ymd(new Date()):'';
    return { id, resNo:(window.pitGenResNo?pitGenResNo():''), status:'reserved', boardId:null, bayId:null, division:null,
      log:[{label:'予約作成',at:Date.now()}], customer:'', tel:'', maker:'', car:'', plate:'',
      reserveDate:today, reserveTime:'', returnDate:'', bookedAt:today,
      reserveStaff:(typeof pitCurrentStaffName==='function'?(pitCurrentStaffName()||''):''),
      estHoldDays:'', estAmount:null, menu:'', workType:null, dropType:null, consult:false,
      needLoaner:false, needWash:false, urgent:false, memo:'' };
  }
  function _openReserveWith(over){
    const card=_newReserveBase(); Object.assign(card, over||{});
    card._draft = true;   /* v1.17.0：保存ボタンを押すまで下書き扱い（views.js の openNewReserve と同じ） */
    if(!Array.isArray(state.cards)) state.cards=[];
    state.cards.push(card);
    if(window.PitDB) PitDB.save(true);
    if(window.openCard) openCard(card.id,'page');
  }
  window.custNewReserveFor=function(custId,vehId){
    const cust=list().find(x=>x.id===custId); const over={};
    if(cust){
      over.customer=cust.name||''; over.kana=cust.kana||''; over.customerId=cust.id; over.repeat='repeater';
      if(cust.lineStatus!=null) over.lineStatus=cust.lineStatus;
      if((cust.lstepId||'')!=='') over.lstepId=String(cust.lstepId).trim();
      if(Array.isArray(cust.contacts)&&cust.contacts.length){ over.contacts=cust.contacts.map(x=>({tel:x.tel,label:x.label,primary:!!x.primary})); const p=over.contacts.find(x=>x.primary)||over.contacts[0]; over.tel=p?(p.tel||''):''; }
      const v=(cust.vehicles||[]).find(x=>x.id===vehId)||liveVehs(cust)[0]||(cust.vehicles||[])[0];
      if(v){
        /* 🔴 v1.52.0 都度車両変動＝**ナンバーと車種は入れない**（毎回ちがう車なので、その場で打つ）。
           カルテNo.・担当・課・区分だけ引き継ぐ。 */
        if(isPerVisit(v)){ over.perVisit=true; over.vehId=v.id; over.plate=''; over.maker=''; over.car=''; }
        else { over.plate=v.plate||''; over.maker=v.maker||''; over.car=v.car||''; over.vehId=v.id; }
        if(v.boardId)over.boardId=v.boardId; if(v.division)over.division=v.division; if(v.frontStaff)over.frontStaff=v.frontStaff; if((v.karteNo||'').trim())over.karteNo=v.karteNo.trim();
      }
    }
    _openReserveWith(over);
  };
  window.custNewReserveForCardId=function(cardId){
    const c=(state.cards||[]).find(x=>x.id===cardId);
    if(!c){ _openReserveWith({}); return; }
    _openReserveWith({ customer:c.customer||'', kana:c.kana||'', customerId:c.customerId||null, repeat:'repeater',
      contacts:Array.isArray(c.contacts)?c.contacts.map(x=>({tel:x.tel,label:x.label,primary:!!x.primary})):[],
      tel:c.tel||'', plate:c.plate||'', maker:c.maker||'', car:c.car||'',
      boardId:c.boardId||null, division:c.division||null, frontStaff:c.frontStaff||'',
      karteNo:(c.karteNo||'').trim(), lineStatus:c.lineStatus||'', lstepId:(c.lstepId!=null?String(c.lstepId).trim():'') });
  };
  window.custOpen=function(id){
    const cust=list().find(x=>x.id===id); if(!cust) return;
    _detailFromSearch = !!window._pitReturnToSearch; window._pitReturnToSearch=false;   // 検索由来かを取り込む
    const backLbl = _detailFromSearch ? '← 検索結果へ戻る' : '← 顧客一覧へ戻る';
    /* 🔴 v1.52.0 車のカードに出すのは「いま持っている車」だけ。
       アーカイブした車は下の「アーカイブ車両」欄にまとめる（ゆうた指定）。 */
    const vehicles=liveVehs(cust);
    const archived=archVehs(cust);
    const cards=_custCards(cust);                       /* 実績になったものだけ（v1.54.0） */
    const openCards=_custCardsAll(cust).filter(c=>!_cardDone(c));   /* いま予約・作業中のもの */
    /* 🔴 v1.101.0 キャンセルは**来ていない**ので「来店回数」には数えない。
       ⚠ ただし**履歴には出す**ので、一覧を出すかどうかは別の数（histN）で見ること。
          ここを1つの数で兼ねると、キャンセルだけのお客様で履歴が丸ごと消える。 */
    const histN=cards.length;
    const visits=cards.filter(function(c){ return !_cardCancelled(c); }).length;
    /* 🔴 v1.54.0 金額は**確定額（返車時に固めたもの）**を使う。まだ無ければ概算で埋める */
    const total=cards.reduce(function(s,c){ if(_cardCancelled(c)||_cardNoSale(c)) return s;   /* 🔴 キャンセル・売上なしは金額に入れない */
      const a=(c.amountFinal!=null&&c.amountFinal!=='')?Number(c.amountFinal):(Number(c.estAmount)||0); return s+(isFinite(a)?a:0); },0);
    /* 🗓 v2.9.4 最終入庫＝**来店履歴のいちばん新しい日**（`updatedAt` は「レコードを触った日」であって入庫ではない） */
    const last=lastVisitOf(cust);
    const yen=function(n){ return '¥'+Number(n||0).toLocaleString('ja-JP'); };

    let h='';
    // 上部バー
    h+='<div class="cd-top"><button class="cd-back" onclick="custCloseModal()">'+backLbl+'</button>'+
       /* 🔴 v1.49.1（ゆうた指定）アーカイブ／戻すは**右上に小さいアイコンだけ**。
          ⚠ ふだん押すものではないので、編集ボタンと同じ大きさで並べない。
          ⚠ 何のボタンか分かるよう title を必ず付ける（アイコンだけなので）。 */
       '<div class="cd-acts"><button class="cd-btn" onclick="custEdit(\''+cust.id+'\')"><i data-ic=pencil data-ics=16></i> 編集</button>'+
       (_archived(cust)
         ? ((window.PitArchive&&PitArchive.canRestore())
             ? '<button class="cd-ico cd-ico-restore" title="アーカイブから戻す" aria-label="アーカイブから戻す" onclick="custRestore(\''+cust.id+'\')"><i data-ic=undo data-ics=15></i></button>'
             : '<span class="cd-ico cd-ico-lock" title="戻せるのは管理者だけです" aria-label="戻せるのは管理者だけです"><i data-ic=lock data-ics=15></i></span>')
         : '<button class="cd-ico cd-ico-arch" title="この顧客をアーカイブする" aria-label="この顧客をアーカイブする" onclick="custArchive(\''+cust.id+'\')"><i data-ic=box data-ics=15></i></button>')+
       '</div></div>';
    // ヘッダー
    /* 🔴 v1.49.0 アーカイブ済みの顧客は、開いた時にひと目で分かるように帯を出す */
    if(_archived(cust)){
      h+='<div class="cd-archbar"><i data-ic=box data-ics=16></i> '+esc(window.PitArchive?PitArchive.noteOf(cust):'アーカイブ済み')+
         '<span class="cd-archsub">検索・顧客呼び出しには出ません。履歴と金額はそのまま残っています。</span></div>';
    }
    h+='<div class="cd-hero"><div class="cd-hmain">'+
       '<div class="cd-hname">'+esc(custDispName(cust)||'(無名)')+' <small>様</small></div>'+
       (cust.kana?'<div class="cd-hkana">'+esc(cust.kana)+'</div>':'')+
       '<div class="cd-hpills"><span class="cd-pill mut">最終入庫 '+(last?esc(last.replace(/-/g,'/')):'まだ来店なし')+'</span></div>'+
       '</div><div class="cd-stats"><div class="cd-statrow">'+
       '<div class="cd-stat"><b>'+visits+'</b><span>来店回数</span></div>'+
       '<div class="cd-stat"><b>'+vehicles.length+'</b><span>保有台数</span></div>'+
       '</div><div class="cd-total"><span>累計概算（合計金額）</span><b>'+yen(total)+'</b></div></div></div>';
    // 連絡先（電話＋LINE/Lステップを同じ枠で1つずつ表示）
    const lineRow=_lineContactRow(cust);
    h+='<div class="cd-sec"><div class="cd-sech"><div class="cd-sect"><i data-ic=phone data-ics=16></i> 連絡先 <span class="cd-cnt">'+(cust.contacts||[]).length+'件</span></div></div>';
    if((cust.contacts||[]).length || lineRow){
      h+='<div class="cd-contacts">';
      (cust.contacts||[]).forEach(function(ct){
        h+='<div class="cd-ct"><div class="cd-ctic">'+(ct.primary?'<i data-ic=smartphone data-ics=16></i>':'<i data-ic=phone data-ics=16></i>')+'</div><div class="cd-ctmain"><div class="cd-cttel">'+esc(ct.tel||'—')+'</div><div class="cd-ctlab">'+esc(ct.label||'')+'</div></div>'+(ct.primary?'<span class="cd-ctpri">優先</span>':'')+'</div>';
      });
      h+=lineRow;
      h+='</div>';
    } else { h+='<div class="cd-empty">連絡先は未登録です</div>'; }
    h+='</div>';
    // 車両
    /* 🔴 v1.52.0（ゆうた指定）車の追加はここから＝新設した「顧客・車両の登録」画面を開く。
       ⚠ 顧客がアーカイブ済みの時は出さない（片付けた人に車を足す操作は要らない）。 */
    h+='<div class="cd-sec"><div class="cd-sech"><div class="cd-sect"><i data-ic=car data-ics=16></i> 車両 <span class="cd-cnt">'+vehicles.length+'台</span></div>'+
       (_archived(cust)?'':'<button class="cd-btn cd-addveh" onclick="custAddVehicleFor(\''+cust.id+'\')"><i data-ic=plus data-ics=15></i> 車両を追加</button>')+
       '</div>';
    if(vehicles.length){
      h+='<div class="cd-vehs">';
      vehicles.forEach(function(v){
        const t=teamInfo(v||{});
        // ベースルール：輸入＝ピンク／国産＝緑／未設定＝グレー
        const isImp=(v.boardId==='import');
        const isDom=(v.boardId==='default');
        const teamCls=isImp?' import':(isDom?'':' unset');
        const teamPill=isImp?'<span class="cd-pill pink">輸入車</span>':(isDom?'<span class="cd-pill green">国産車</span>':'<span class="cd-pill mut">未設定</span>');
        /* 🔴 v1.49.0 車ごとのアーカイブ。
           ⚠ **顧客ごと片付いている車**（vSelf でない）は、車だけ戻しても意味が無いので操作を出さない。 */
        const vSelf = window.PitArchive ? PitArchive.vehSelfArchived(v) : !!v.archived;
        const vArc  = window.PitArchive ? PitArchive.vehArchived(cust,v) : (!!v.archived||_archived(cust));
        const canR  = !(window.PitArchive) || PitArchive.canRestore();
        /* 🔴 v1.49.1 車のアーカイブ／戻すも**カードの右上に小さいアイコンだけ**（ゆうた指定） */
        const vIco = vSelf
          ? (canR ? '<button class="cd-vico cd-vico-restore" title="アーカイブから戻す" aria-label="アーカイブから戻す" onclick="event.stopPropagation();custVehRestore(\''+cust.id+'\',\''+(v.id||'')+'\')"><i data-ic=undo data-ics=14></i></button>'
                  : '<span class="cd-vico cd-vico-lock" title="戻せるのは管理者だけです" aria-label="戻せるのは管理者だけです"><i data-ic=lock data-ics=14></i></span>')
          : (_archived(cust) ? ''
                  : '<button class="cd-vico cd-vico-arch" title="この車をアーカイブする" aria-label="この車をアーカイブする" onclick="event.stopPropagation();custVehArchive(\''+cust.id+'\',\''+(v.id||'')+'\')"><i data-ic=box data-ics=14></i></button>');
        /* 🔴 v1.52.0 都度車両変動の車は、ナンバーの代わりに印を出し、車種は「毎回入力」と伝える */
        const pv = isPerVisit(v);
        h+='<div class="cd-veh'+teamCls+(vArc?' cd-veh-arch':'')+(pv?' cd-veh-pv':'')+'">'+ vIco +
           (vSelf?'<div class="cd-varch"><i data-ic=box data-ics=14></i> '+esc(window.PitArchive?PitArchive.noteOf(v):'アーカイブ済み')+'</div>':'')+
           (pv?'<div class="cd-vplate cd-vplate-pv"><span class="cd-pvbadge"><i data-ic=swap data-ics=14></i> 都度車両変動</span></div>'
              :'<div class="cd-vplate">'+esc(v.plate||'—')+'</div>')+
           (pv?'<div class="cd-vcar cd-vcar-pv">'+(v.lastCar?('前回：'+esc(v.lastCar)):'車種は予約のたびに入力します')+'</div>'
              :'<div class="cd-vcar">'+esc(((v.maker?v.maker+' ':'')+(v.car||'')).trim()||'—')+'</div>')+
           '<div class="cd-vpills">'+teamPill+(t.course?'<span class="cd-pill" style="background:'+esc(t.courseColor)+'22;color:'+esc(t.courseColor)+';border-color:'+esc(t.courseColor)+'66">'+esc(t.course)+'</span>':'')+(frontName(v)?'<span class="cd-vstaff" title="担当">'+esc(frontName(v))+'</span>':'')+'</div>'+
           ((v.karteNo||'').trim()?'<div class="cd-vkarte" title="カルテNo">'+esc(v.karteNo.trim())+'</div>':'')+
           /* 🚗 v2.2.0 車体番号。クォーターチェックが伝票から入れたもの（手でも直せる） */
           /* 🚗 v2.11.0（ゆうた「車体番号の記載が小さい」）ラベルを付けて、読める大きさにした */
           ((v.vin||'').trim()?'<div class="cd-vvin"><i>車体番号</i>'+esc(v.vin.trim())+'</div>':'')+
           '<div class="cd-vacts"><span class="cd-vb" onclick="custHistory(\''+cust.id+'\',\''+(v.id||'')+'\')"><i data-ic=clock data-ics=16></i> 履歴</span>'+
           (vArc ? '' : '<span class="cd-vb go" onclick="custNewReserveFor(\''+cust.id+'\',\''+(v.id||'')+'\')">🆕 この車で新規予約</span>')+
           '</div>'+
           '</div>';
      });
      h+='</div>';
    } else { h+='<div class="cd-empty">車両は未登録です</div>'; }
    h+='</div>';
    // 来店履歴
    /* 🔴 v1.54.0 来店履歴＝実績になったものだけ。予約・作業中のものは件数だけ添える（ゆうた指定） */
    h+='<div class="cd-sec"><div class="cd-sech"><div class="cd-sect"><i data-ic=clock data-ics=16></i> 来店履歴 <span class="cd-cnt">'+
       (histN?('直近'+Math.min(histN,12)+'件'):'なし')+
       (openCards.length?('　／　予約・作業中 '+openCards.length+'件'):'')+'</span></div></div>';
    if(histN){
      h+='<div class="cd-hist">';
      cards.slice(0,12).forEach(function(c){
        /* 🔧 v2.9.7 作業タイプの拾い方は `pit-share.js` の `pitCardWorkTypes` 1本。
           ⚠ 昔は `c.workType`（基本）だけを見ていたので、B.P・1Y・3M・車販依頼だけの車が
              「—」になっていた（＝作業タイプが無い車に見えた）。併用は「車検＋B.P」と並べる。 */
        const _wts=(window.pitCardWorkTypes?pitCardWorkTypes(c):[]);
        const wt=_wts[0]||null;
        const wl=_wts.length?_wts.map(function(x){return x.label;}).join('＋'):'—';
        const wc=wt?wt.color:'#64748b';
        const amt=(c.amountFinal!=null&&c.amountFinal!=='')?Number(c.amountFinal):(c.estAmount!=null&&c.estAmount!==''?Number(c.estAmount):null);
        /* 🔴 v1.99.0（ゆうた確定）売上なしは **¥0 ではなく「売上なし」**と書く。
           0円と書くと「金額の入れ忘れ」と見分けがつかないため。 */
        const amtStr=_cardCancelled(c)?'<span class="cd-hnosale">キャンセル</span>'
                    :_cardNoSale(c)?'<span class="cd-hnosale">売上なし</span>'
                    :((amt!=null&&isFinite(amt))?yen(amt):'—');
        /* 🔴 v1.83.0 同上＝来店履歴にも借りていた期間を出す */
        let loa='';
        if(c.needLoaner){
          const l=(state.loaners||[]).find(x=>x.id===c.loanerId);
          const nm=(window.pitLoanerModel?pitLoanerModel(c.loanerId):'')||(l?(l.name||'代車'):'');
          const pr=(window.pitLoanerPeriodOf?pitLoanerPeriodOf(c).text:'');
          loa='<span class="cd-loa"><i data-ic=van data-ics=15></i>代車'+(nm?('（'+esc(nm)+'）'):'')+(pr?(' '+esc(pr)):'')+'</span>';
        }
        let menuTxt=c.menu?esc(String(c.menu).split('\n')[0]):'';
        /* 🔴 v1.101.0 キャンセルは**理由**を出す（次に来た時に経緯が分かるように） */
        if(_cardCancelled(c)) menuTxt='キャンセル'+(c.cancelReason?('：'+esc(c.cancelReason)):'')
                                     +(c.cancelledAt?('　'+esc(c.cancelledAt)):'')+(c.cancelledBy?('　'+esc(c.cancelledBy)):'');
        // ステータスバッジ：予約→予約カレンダー／返車済み→実績カレンダー（行クリックは予約詳細）
        /* 売上なしの車は実績カレンダーに載っていないので、バッジから飛ばさない（飛んでも無い） */
        /* ================================================================
           🕘 v2.11.2（ゆうた 2026-08-25）**2行に戻す。**
           ・行ぜんぶを押すと予約詳細（今までどおり）
           ・**日付の下に予約番号**
           ・**「返車済み」の札は出さない**（右のボタンで実績ボードへ行ける）
           ・右端に **履歴／実績ボード を上下に**（アイコンは抜く）
           ⚠ 保険・社内区分などの印は**1行目の後ろ**に置く＝2行のまま情報を落とさない。
           ================================================================ */
        let tags='';
        if(window.pitCardIntern&&pitCardIntern(c)) tags+='<span class="cd-htag">'+esc(pitInternLabel(c))+'</span>';
        (Array.isArray(c.workSpecials)?c.workSpecials:[]).forEach(function(id){
          const lb=window.pitSpecialLabel?pitSpecialLabel(id):''; if(lb) tags+='<span class="cd-htag">'+esc(lb)+'</span>';
        });
        if(c.earlyDiscount) tags+='<span class="cd-htag">早期割</span>';
        if(_cardNoSale(c)||_cardCancelled(c)) tags+='<span class="cd-htag st nosale">'+esc(_statusLbl(c))+'</span>';
        /* この行の車＝ナンバーで引く（履歴ボタンの飛び先） */
        const _hv=(cust.vehicles||[]).find(function(x){ return x&&isRealPlate(x.plate)&&norm(x.plate)===norm(c.plate||''); });
        h+='<div class="cd-hrow clickable" onclick="pitOpenCardDetail(\''+esc(c.id)+'\')" title="クリックで予約詳細">'+
           '<div class="cd-hdt">'+esc(_doneDate(c)||'日付未定')+
             (c.resNo?'<span class="cd-hres">'+esc(c.resNo)+'</span>':'')+'</div>'+
           '<div class="cd-hwt" style="background:'+wc+'">'+esc(wl)+'</div>'+
           '<div class="cd-hmid"><div class="cd-hl1"><b>'+esc(c.car||'—')+'</b>'+(c.frontStaff?'<span class="cd-hstaff">担当 '+esc(c.frontStaff)+'</span>':'')+loa+tags+'</div>'+
             (menuTxt?'<div class="cd-hsub">'+menuTxt+'</div>':'')+'</div>'+
           '<div class="cd-hamt">'+amtStr+'</div>'+
           '<div class="cd-hbtns">'+_histBtns(c, { hist:{ custId:cust.id, vehId:(_hv?(_hv.id||''):'') }, icons:false })+'</div>'+
           '</div>';
      });
      h+='</div>';
    } else {
      h+='<div class="cd-empty">来店履歴はまだありません。<br>'
        +'<b>返車まで終わって実績になった入庫だけが、ここに並びます</b>（金額もそこで確定します）。'
        +(openCards.length?('<br>いま <b>'+openCards.length+'件</b> の予約・作業中があります。返車まで終わるとここに載ります。'):'')
        +'<br>（整備ソフトに正式履歴があります）</div>';
    }
    h+='</div>';

    /* 🔴 v1.52.0（ゆうた指定）**来店履歴の下に「アーカイブ車両」欄**。
       ⚠ 来店履歴と同じテイストの小さい行（BOX）で、グレーアウトして並べる。
       ⚠ 1台も無い時は**欄ごと出さない**（ふだんは目に入らないように）。 */
    if(archived.length){
      h+='<div class="cd-sec"><div class="cd-sech"><div class="cd-sect"><i data-ic=box data-ics=16></i> アーカイブ車両 <span class="cd-cnt">'+archived.length+'台</span></div></div>';
      h+='<div class="cd-hist cd-archlist">';
      archived.forEach(function(v){
        const t=teamInfo(v||{});
        const canR = !(window.PitArchive) || PitArchive.canRestore();
        const nm=((v.maker?v.maker+' ':'')+(v.car||'')).trim();
        h+='<div class="cd-arow">'+
           '<div class="cd-aplate">'+(isPerVisit(v)?'都度変動':esc(v.plate||'—'))+'</div>'+
           '<div class="cd-amid"><b>'+esc(nm||'—')+'</b>'+
             ((v.karteNo||'').trim()?' ・ カルテ '+esc(v.karteNo.trim()):'')+
             (t.label?' ・ '+esc(t.label):'')+(t.course?' ・ '+esc(t.course):'')+
             (frontName(v)?' ・ 担当 '+esc(frontName(v)):'')+
             '<div class="cd-asub"><i data-ic=box data-ics=14></i> '+esc(window.PitArchive?PitArchive.noteOf(v):'アーカイブ済み')+'</div>'+
           '</div>'+
           '<div class="cd-aacts">'+
             '<button class="cd-ab" onclick="custHistory(\''+cust.id+'\',\''+(v.id||'')+'\')" title="この車の来店履歴を見る"><i data-ic=clock data-ics=15></i> 履歴</button>'+
             (canR ? '<button class="cd-ab cd-ab-restore" onclick="custVehRestore(\''+cust.id+'\',\''+(v.id||'')+'\')" title="アーカイブから戻す"><i data-ic=undo data-ics=15></i> 戻す</button>'
                   : '<span class="cd-ab cd-ab-lock" title="戻せるのは管理者だけです"><i data-ic=lock data-ics=15></i></span>')+
           '</div>'+
           '</div>';
      });
      h+='</div></div>';
    }

    openModal(h, 'cd-box');
  };
  /* この車で新規予約＝新規予約カードを作ってこの顧客＋車両で埋める */
  window.custNewReserveFor=function(custId, vehId){
    window._pitReturnToSearch=false;           // 新規予約へ進む＝検索には戻らない
    _detailFromSearch=false;
    custCloseModal();
    if(!window.openNewReserve) return;
    const prevId = window.pitOpenCardId ? pitOpenCardId() : null;   /* 開く前に見ていたカード */
    openNewReserve();
    /* 🔴 v1.52.0 直した不具合（ゆうた報告ではなく作業中に見つけたもの）
       ⚠ **書きかけの予約が残っていると**「続きから開きますか？」の確認が先に出るので、
          新規予約カードは**その返事のあとに**作られる。前はその返事を待たずにお客様を入れていたため、
          確認が出た時だけ **お客様・車が空のカード**が開いていた（顧客一覧・顧客詳細の「新規予約」）。
       ⚠ カードが開くのを待ってから入れる。**「続きから開く」を選んだ時は入れない**
          （別のお客様の書きかけに、いま選んだ人を上書きしてしまうため）。 */
    let tries=0;
    (function waitCard(){
      const id = window.pitOpenCardId ? pitOpenCardId() : null;
      const c = (id && id!==prevId) ? (state.cards||[]).find(x=>x&&x.id===id) : null;
      if(c){
        const fresh = !(c.customer||'').trim() && !(c.plate||'').trim() && !(c.car||'').trim();
        if(fresh && window.custPick) custPick(custId, vehId);
        return;
      }
      if(++tries>100) return;                  // 10秒待って開かなければあきらめる（画面は止めない）
      setTimeout(waitCard, 100);
    })();
  };

  /* ===== カード→顧客の橋渡し（検索結果の「顧客情報」「新規予約」用） ===== */
  // カードから顧客レコードを探す（customerId 優先・無ければナンバー一致）
  window.custFindForCard=function(c){
    if(!c) return null;
    if(c.customerId){ const byId=list().find(x=>x.id===c.customerId); if(byId) return byId; }
    if(isRealPlate(c.plate)){
      const p=norm(c.plate);
      const byP=list().find(x=>(x.vehicles||[]).some(v=>isRealPlate(v.plate)&&norm(v.plate)===p));
      if(byP) return byP;
    }
    return null;
  };
  // 顧客情報を開く＝そのカードのお客様の詳細（控えが無ければカードから作ってから開く）
  window.custOpenForCard=function(cardId){
    const c=(state.cards||[]).find(x=>x.id===cardId); if(!c) return;
    window._pitReturnToSearch=true;            // 戻れるように検索ワードは残す
    if(window.pitSearchHide) pitSearchHide();
    let cust=custFindForCard(c);
    if(!cust && window.upsertCustomerFromCard){ upsertCustomerFromCard(c); cust=custFindForCard(c); }
    if(cust) custOpen(cust.id);
  };
  // そのカードのお客様＋車両で新規予約を開始
  window.custNewReserveForCardId=function(cardId){
    const c=(state.cards||[]).find(x=>x.id===cardId); if(!c) return;
    window._pitReturnToSearch=false;           // 新規予約へ進む＝検索には戻らない
    if(window.pitSearchClose) pitSearchClose();
    let cust=custFindForCard(c);
    if(!cust && window.upsertCustomerFromCard){ upsertCustomerFromCard(c); cust=custFindForCard(c); }
    if(!cust){ if(window.openNewReserve) openNewReserve(); return; }
    const v=(isRealPlate(c.plate)?(cust.vehicles||[]).find(x=>isRealPlate(x.plate)&&norm(x.plate)===norm(c.plate)):null)||liveVehs(cust)[0]||(cust.vehicles||[])[0];
    custNewReserveFor(cust.id, v?v.id:'');
  };
})();

/* ========================================
   loaner.js  -  代車ビュー／PitFlow v0.11.0
   ----------------------------------------
   ・縦＝日付（下に無限スクロール）／横＝代車20台（横スクロール・日付列とヘッダ固定）。
   ・予約は「開始セルに客バッジ → 縦線が↓に伸びる → 返却予定日に<i data-ic=chevDown data-ics=15></i>矢印」。
   ・バッジを別の代車列へ**ドラッグで移動**できる（返せる/返せない/緊急対応の差し替え用）。
     移動先の期間が別予約とぶつかる場合は「◯日ぶつかる」警告を出して確認。
   ======================================== */
let _loStart = null, _loCount = 0, _loBound = false, _loDnd = false, _loDragAid = null, _loDragMode = 'move';
let _loFilters = { etc:false, navi:false, iso:false };
let _loCats = { kei:false, normal:false, import:false, commercial:false };   // 区分の絞り込み（OR）／v1.15.0 商用車を追加
let _loSortKey = null;   // 並べ替え（低い順）：'height'|'width'|'length'|'seats'|null
/* 🔎🔍 v2.41.0（ゆうた指定 2026-08-31）上のバー＝探す・畳む・縮尺 */
let _loQ = '';           // 探している言葉（小文字）
/* 🔍 縮尺は**段**（ゆうた指定 2026-08-31「吸着でいい」）。
   ⚠ 前は 0〜100 の連続にしていたが、28〜72px を100段に割ったせいで
      **1px 動かすと 0.4px しか変わらない**＝細かすぎて狙った大きさに合わせられなかった。
   🔴 **[1日の高さ, 列の幅]。真ん中（LO_ZOOM_DEF＝2）が直す前とまったく同じ 38px / 112px。**
   🔴 **端末に覚えない**（ゆうた指定「保存しないで、基本的には読み込みでデフォルトに戻る」）
      ＝ その場で見たいから広げる／詰めるだけのもの。次に開いた時はいつも同じ見え方から始まる。 */
const LO_STEPS = [[28,96],[34,104],[38,112],[46,126],[56,144],[72,166]];
const LO_ZOOM_DEF = 2;
let _loZoom = LO_ZOOM_DEF;   // 段の番号（0〜5）
let _loVehBound = false;
let _loPrepending = false;

const LO_CAT = { kei:'軽', normal:'普通車', import:'輸入車', commercial:'商用車' };   /* v1.15.0 商用車を追加 */

/* ===== 下書きモード（動かした瞬間に突入＝保存はしない。一括実行で確定／破棄／やり直し） ===== */
let _loDraftOrig = null;   // 下書き開始時のスナップショット {aid:{loanerId,fromDate,toDate}}
let _loApplySnap = null;   // 直前の一括実行のやり直し用スナップショット

/* 🔴 v1.80.0 下書きの控えを**端末にも残す**。
   -------------------------------------------------------------------
   ⚠ 下書き中の変更は state に直接書かれる（保存はしない）が、
      **別の画面へ移ってそこで保存が走ると、確定していない下書きがそのまま保存される。**
      さらにリロードすると `_loDraftOrig` は消えるので、**もう元に戻せなかった。**
   ✅ 控えを端末に残しておけば、リロードしても「破棄」で元に戻せる。
   ⚠ これは保険。**画面を離れる時には loGuardLeave() で聞く**のが本筋（下を参照）。 */
const LO_DRAFT_KEY = 'pitflow_loaner_draft_v1';
function _loDraftSave(){
  try {
    if (_loDraftOrig) localStorage.setItem(LO_DRAFT_KEY, JSON.stringify(_loDraftOrig));
    else localStorage.removeItem(LO_DRAFT_KEY);
  } catch (e) {}
}
function _loDraftRestore(){
  if (_loDraftOrig) return;
  try {
    const raw = localStorage.getItem(LO_DRAFT_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (o && typeof o === 'object' && Object.keys(o).length) _loDraftOrig = o;
  } catch (e) {}
}
function _loDraftClear(){ _loDraftOrig = null; try { localStorage.removeItem(LO_DRAFT_KEY); } catch (e) {} }

function _loStartDraft(){
  if (_loDraftOrig) return;
  _loDraftOrig = {};
  (state.loanerAssigns || []).forEach(function(a){ _loDraftOrig[a.id] = { loanerId:a.loanerId, fromDate:a.fromDate, toDate:a.toDate }; });
  _loDraftSave();
}
function _loAssignChanged(a){ const o = _loDraftOrig && _loDraftOrig[a.id]; return !!o && (o.loanerId!==a.loanerId || o.fromDate!==a.fromDate || o.toDate!==a.toDate); }
function _loChangedList(){ return _loDraftOrig ? (state.loanerAssigns||[]).filter(_loAssignChanged) : []; }
/* 重複（同じ代車で期間が重なる）割当idの集合。
   ※同じ予約（同じ cardId）の割当どうしは「同一予約」なので衝突に数えない。 */
function _loConflictSetFrom(list){
  const bad = new Set(), byLo = {};
  /* 🅿 v2.40.0 仮押さえ（hold）は札を出さないので、二重貸しの赤には数えない。
     ⚠ 「貸出の窓で警告する」ほうは今までどおり効く（pitLoanerConflicts は仮押さえも返す）。 */
  (list || []).forEach(function(a){ if (a && a.hold) return; (byLo[a.loanerId] = byLo[a.loanerId] || []).push(a); });
  Object.keys(byLo).forEach(function(lo){
    const arr = byLo[lo].slice().sort(function(x,y){ return x.fromDate < y.fromDate ? -1 : 1; });
    for (let i=0;i<arr.length;i++) for (let j=i+1;j<arr.length;j++){
      if (arr[i].cardId && arr[j].cardId && arr[i].cardId === arr[j].cardId) continue;   // 同一予約は除外
      /* 🔴 v1.80.0 ぶつかりの判定は loaner-free.js の pitLoanerOverlap 1本。
         当日かぶり（返却日＝次の貸出開始日）は重複に数えない（耳で表現）。
         ⚠ 以前はここと貸出フォーム（_loOverlaps）で決まりが逆だった。 */
      if (window.pitLoanerOverlap(arr[i].fromDate, arr[i].toDate, arr[j].fromDate, arr[j].toDate)){
        bad.add(arr[i].id); bad.add(arr[j].id);
      }
    }
  });
  return bad;
}
function _loConflictSet(){ return _loConflictSetFrom(state.loanerAssigns || []); }
/* 「今回の編集で新しく発生した重複」だけを返す（元から重なっていた既存の重複は無視＝日数調整を邪魔しない）。 */
function _loNewBad(){
  if (!_loDraftOrig) return new Set();
  const now = _loConflictSet();
  const origList = (state.loanerAssigns || []).map(function(a){
    const o = _loDraftOrig[a.id];
    return o ? { id:a.id, cardId:a.cardId, loanerId:o.loanerId, fromDate:o.fromDate, toDate:o.toDate }
             : { id:a.id, cardId:a.cardId, loanerId:a.loanerId, fromDate:a.fromDate, toDate:a.toDate };
  });
  const base = _loConflictSetFrom(origList);
  const out = new Set();
  now.forEach(function(id){ if (!base.has(id)) out.add(id); });
  return out;
}
/* 同じ予約(cardId)に対する代車割当が二重に残っていたら1件に掃除する（過去データ救済）。 */
function _loDedupeAssigns(){
  const seen = {}, out = []; let changed = false;
  (state.loanerAssigns || []).forEach(function(a){
    if (a && a.cardId){ if (seen[a.cardId]){ changed = true; return; } seen[a.cardId] = 1; }
    out.push(a);
  });
  if (changed){ state.loanerAssigns = out; if (window.PitDB) PitDB.save(); }
}
function _loAssignLabel(a){
  const card = a.cardId ? (state.cards||[]).find(function(c){return c.id===a.cardId;}) : null;
  return card ? ((window.pitCustSurname?pitCustSurname(card):(card.customer||''))||'予約') : (a.customer || '予約');
}
/* 代車の呼び名。🔴 v1.46.0 **車種名が主・番号は括弧**（「タント（5）」）＝現場の呼び方に合わせる。
   ⚠ 車種が未登録なら今までどおり元の名前（「代車5」）。 */
function _loName(id){
  const l=(state.loaners||[]).find(function(x){return x.id===id;});
  if(!l) return id;
  const model=String(l.model||'').trim();
  const num=(l.number!=null&&l.number!=='')?String(l.number):(String(l.name||'').replace('代車','')||'');
  return model ? (model + (num?'（'+num+'）':'')) : (l.name||id);
}
/* 🚗 v1.56.0（ゆうた指定）**予約詳細に出す代車の呼び名＝車種名だけ**（「代車5」ではなく「タント」）。
   🔴🔴 v1.111.0（2026-08-17）**`pitLoanerModel` の本家は `js/pit-share.js` に移した。**
        当日ビューの1行メモに代車名を出すことになり、**MHS も同じ呼び名を使う**ため。
        ここに書き戻さないこと（書くと写しが2枚になって、片方だけ古くなる）。
        ⚠ 中身は同じ。呼び方も `pitLoanerModel(id)` のまま変わっていない。
        ⚠ pit-share.js は state.js より前に読み込まれるので、このファイルより必ず先にいる。
   🔴 代車カレンダーの「タント（5）」は上の `_loName`（番号つき）。当日メモ・予約詳細は番号なし。
      **呼び名を各画面で組み立てず、必ずどちらかを通すこと。** */
function _loAbbr(s, n){ s = String(s == null ? '' : s); return s.length > n ? (s.slice(0, n) + '…') : s; }
/* 当日かぶり（後発）：この割当の開始日に、同じ代車で別予約の返却(toDate)が重なるか＝後発は初日が「耳」・実質翌日開始 */
function _loHandoffLater(a){
  /* 🅿 v2.40.0 仮押さえは札を出さない＝当日かぶりの耳も作らない */
  return (state.loanerAssigns || []).some(function(x){ return x.id !== a.id && !x.hold && x.loanerId === a.loanerId && x.toDate === a.fromDate; });
}
function _loEffStart(a){ return _loHandoffLater(a) ? ymd(addDays(_loPd(a.fromDate), 1)) : a.fromDate; }
function _loTeamColor(a){
  const card = a.cardId ? (state.cards||[]).find(function(c){ return c.id===a.cardId; }) : null;
  return card ? (card.boardId === 'import' ? '#ec4899' : '#1db97a') : (a.emergency ? '#ef4444' : (a.manual ? '#3b82f6' : '#1db97a'));
}
function _loMD(s){ const p=String(s).split('-'); return (+p[1])+'/'+(+p[2]); }

function _loPd(s){ const p = String(s).split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
/* ===== v1.11.0 共通の道具 =====================================================
   ・和暦：車検満了日は現場が和暦で見るので、表示だけ和暦にする（データは西暦のまま）。
   ・12ヶ月点検：**車検満了日の翌年の同月同日**が点検時期。データとして持たず、その都度計算する。
   ・代車の呼び名：「代車1」ではなく「1 タント」（通し番号＋車種）を正式な呼び名にする。
   ============================================================================= */
window.pitWareki = function (ymdStr, opt) {
  var m = String(ymdStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(ymdStr || '');
  var y = +m[1], mo = +m[2], d = +m[3];
  var t = y * 10000 + mo * 100 + d;
  var era, ey;
  if (t >= 20190501) { era = '令和'; ey = y - 2018; }
  else if (t >= 19890108) { era = '平成'; ey = y - 1988; }
  else if (t >= 19261225) { era = '昭和'; ey = y - 1925; }
  else return String(ymdStr || '');
  var yl = (ey === 1 ? '元' : ey);
  if (opt === 'ym') return era + yl + '年' + mo + '月';
  if (opt === 'short') return era.charAt(0) + yl + '.' + mo + '.' + d;
  return era + yl + '年' + mo + '月' + d + '日';
};
/* 西暦(YYYY-MM-DD) → 和暦のパーツ {era,y,m,d}。入力欄の初期値に使う。 */
window.pitYmdToWarekiParts = function (ymdStr) {
  var m = String(ymdStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { era: '令和', y: '', m: '', d: '' };
  var y = +m[1], mo = +m[2], d = +m[3], t = y * 10000 + mo * 100 + d;
  if (t >= 20190501) return { era: '令和', y: y - 2018, m: mo, d: d };
  if (t >= 19890108) return { era: '平成', y: y - 1988, m: mo, d: d };
  return { era: '昭和', y: y - 1925, m: mo, d: d };
};
/* 和暦 → 西暦(YYYY-MM-DD)。年月日が揃っていない時は空を返す。 */
window.pitWarekiToYmd = function (era, wy, mo, d) {
  wy = parseInt(wy, 10); mo = parseInt(mo, 10); d = parseInt(d, 10);
  if (!wy || !mo || !d) return '';
  var base = { '令和': 2018, '平成': 1988, '昭和': 1925 }[era];
  if (!base) return '';
  var y = base + wy;
  if (mo < 1 || mo > 12) return '';
  var last = new Date(y, mo, 0).getDate();
  if (d < 1 || d > last) return '';
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
};

/* 車検満了日 → 次の12ヶ月点検の時期。
   ◎考え方（v1.14.7）
     12ヶ月点検は「車検の1年後＝次の車検の1年前」にやるもの。
     なので**まず車検満了日の1年前**を見て、
       ・それがまだ先（今日より後）なら → その日。車検より手前に点検が来る。
       ・もう過ぎている（今日より前）なら → 車検満了日の1年後。車検の次の点検になる。
     ⚠ 2/29 の年は、その月の末日に寄せる。 */
function _pitAddYear(shakenYmd, diff) {
  var m = String(shakenYmd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  var y = +m[1] + diff, mo = +m[2], d = +m[3];
  var last = new Date(y, mo, 0).getDate();          // その月の末日（2/29 対策）
  if (d > last) d = last;
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
window.pitTenkenFromShaken = function (shakenYmd) {
  var before = _pitAddYear(shakenYmd, -1);
  if (!before) return '';
  var t = new Date(); t.setHours(0, 0, 0, 0);
  var today = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  if (before > today) return before;                // まだ先＝車検の手前に点検
  return _pitAddYear(shakenYmd, 1);                 // もう過ぎている＝車検の次の点検
};
/* 代車・自社車両の呼び名＝「1 タント」。番号が無ければ車種だけ、それも無ければ元の名前。
   v1.14.5：社用車も番号を持つようになったので、代車と同じ形に揃えた。 */
window.pitVehLabel = function (v, kind) {
  if (!v) return '';
  var num = (v.number != null && v.number !== '') ? v.number
          : ((kind === 'company') ? '' : (parseInt(String(v.name || '').replace(/[^0-9]/g, ''), 10) || ''));
  var model = v.model || '';
  return ((num !== '' ? String(num) : '') + (num !== '' && model ? ' ' : '') + model) || (v.name || '');
};

function _loEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]; }); }

/* 代車の装備/寸法が未設定のときの初期化。
   🔴 v1.80.0 **本番（クラウド保存）では、装備と寸法に勝手な数字を入れない。**
   -------------------------------------------------------------------
   ⚠ もともとサンプル画面に変化を付けるための仕組みだった（1台目は高さ150cm、2台目は153cm…）。
      ところが本番の代車でも、寸法を入力しないと**この架空の数字が書き込まれ**、
      その値のまま「高さ順に並べ替え」が効いていた＝**実車と違う順番で代車を選んでしまう。**
   ✅ 本番では未入力のまま（null）にして、並べ替えでは**最後に回す**（loaner.js の並べ替えは
      null を 99999 として扱う）。入力されていないことが**見て分かる**のが正しい。
   ⚠ 番号・区分・色は画面の組み立てに要るので、本番でも埋める（架空の数字ではないため）。 */
function _loEnsureOpts(){
  const demo = !window.PIT_CLOUD;   /* サンプル・練習用サイト＝見栄えのために埋める */
  (state.loaners || []).forEach(function(l, i){
    if (demo){
      if (l.etc === undefined)  l.etc  = (i % 2 === 0);
      if (l.navi === undefined) l.navi = (i % 3 !== 0);
      if (l.iso === undefined)  l.iso  = (i % 4 === 0);
      if (l.camera === undefined) l.camera = (i % 3 === 0);   /* v1.11.0 バックカメラ */
      if (l.height === undefined || l.height === null) l.height = 150 + (i % 6) * 3;    // 150〜165cm
      if (l.width  === undefined || l.width  === null) l.width  = 148 + (i % 5) * 4;    // 148〜164cm
      if (l.length === undefined || l.length === null) l.length = 340 + (i % 8) * 20;   // 340〜480cm
      if (l.seats === undefined || l.seats === null) l.seats = [4,4,5,5,5,7,8][i % 7];
    } else {
      /* 本番＝入っていないものは「未入力」のまま。false で埋めるのも嘘になるので触らない。 */
    }
    if (l.category === undefined) l.category = ['kei','normal','import','commercial'][i % 4];   /* v1.15.0 商用車 */
    if (l.number === undefined || l.number === null){ const n = parseInt(String(l.name||'').replace(/[^0-9]/g,''),10); l.number = isNaN(n)?(i+1):n; }
    if (l.color === undefined) l.color = '';
  });
}
/* 入替予定の確定：入替日を過ぎたら 旧車を「引退」にして新車を正式番号(「(仮)」を外す)に。
   ※旧車の予約・履歴は消さない（retiredでカレンダー表示から外すだけ）＝新車へ未来の予約を入れていける運用。 */
function _loProcessReplacements(){
  const today = ymd(new Date());
  let changed = false;
  (state.loaners || []).forEach(function(nv){
    if (nv.replaceOf && nv.replaceDate && nv.replaceDate <= today){
      const old = (state.loaners||[]).find(function(l){ return l.id === nv.replaceOf; });
      if (old){ old.retired = true; old.retiredAt = today; }   // 撤去せず引退（予約/履歴は保持）
      state.fleetEvents = (state.fleetEvents||[]).filter(function(e){ return e.id !== ('rep_'+nv.id); });
      nv.name = '代車' + nv.number; delete nv.replaceOf; delete nv.replaceDate;
      changed = true;
    }
  });
  if (changed && window.PitDB) PitDB.save();
}
/* 絞り込み（装備＋区分）＆並べ替え（低い順） */
function _loFiltered(){
  let ls = (state.loaners || []).slice().filter(function(l){ return !l.retired; });   // 引退した代車は出さない（予約/履歴は残る）
  if (_loFilters.etc)  ls = ls.filter(function(l){ return l.etc; });
  if (_loFilters.navi) ls = ls.filter(function(l){ return l.navi; });
  if (_loFilters.iso)  ls = ls.filter(function(l){ return l.iso; });
  if (_loFilters.camera) ls = ls.filter(function(l){ return l.camera; });
  const anyCat = Object.keys(_loCats).some(function(k){ return _loCats[k]; });   /* v1.15.0：区分が増えても効くように */
  if (anyCat) ls = ls.filter(function(l){ return _loCats[l.category]; });
  if (_loSortKey === 'camera') {
    /* カメラ付きを先に（同じなら番号順） */
    ls.sort(function(a, b){ return ((b.camera?1:0) - (a.camera?1:0)) || ((a.number||0) - (b.number||0)); });
  } else if (_loSortKey === 'shakenDate') {
    /* 車検満了が近い順（未入力は最後） */
    ls.sort(function(a, b){ return String(a.shakenDate || '9999').localeCompare(String(b.shakenDate || '9999')); });
  } else if (_loSortKey === 'seats') {
    /* v1.15.0：定員は自由入力（「5（2）人」等）になったので、**先頭の数字**で少ない順に並べる。
       数字が拾えないものは最後。 */
    const sn = function(x){ var n = window.pitSeatsNum ? pitSeatsNum(x) : null; return (n == null ? 99999 : n); };
    ls.sort(function(a, b){ return sn(a.seats) - sn(b.seats) || ((a.number||0) - (b.number||0)); });
  } else if (_loSortKey) {
    ls.sort(function(a, b){ return (a[_loSortKey] != null ? a[_loSortKey] : 99999) - (b[_loSortKey] != null ? b[_loSortKey] : 99999); });
  }
  /* 🔎 v2.41.0 探している言葉。
     🔴 **代車（車種・番号）に当たった時だけ列を絞る。**
        お客様名やメモに当たった時は**列を消さない**＝消すと前後の予定が見えなくなり、
        「空いているか」を見るというこの画面の役目が壊れる。そちらは札を縁で光らせるだけ（_loHitA）。 */
  if (_loQ){
    const byVeh = ls.filter(_loHitVeh);
    if (byVeh.length) ls = byVeh;
  }
  // 緊急車両は常に一番左
  const emg = ls.filter(function(l){ return l.emergency; });
  const norm = ls.filter(function(l){ return !l.emergency; });
  return emg.concat(norm);
}

/* ===== 🔎 探す（v2.41.0） ===== */
function _loNorm(s){ return String(s == null ? '' : s).toLowerCase(); }
/* 代車そのものに当たったか（車種・番号・名前） */
function _loHitVeh(l){
  if (!_loQ || !l) return false;
  return _loNorm(l.model + ' ' + (l.number == null ? '' : l.number) + ' ' + (l.name || '') + ' ' + (l.plate || '')).indexOf(_loQ) >= 0;
}
/* 貸出・仮押さえの札に当たったか（お客様名・車種・メモ） */
function _loHitA(a){
  if (!_loQ || !a) return false;
  const card = a.cardId ? (state.cards || []).find(function(c){ return c.id === a.cardId; }) : null;
  const nm = card ? ((window.pitCustName ? pitCustName(card) : card.customer) || '') : (a.customer || '');
  const kn = card ? (card.kana || '') : '';
  const car = card ? (card.car || '') : (a.car || '');
  const memo = card ? (card.loanerOther || '') : (a.memo || a.purpose || '');
  return _loNorm(nm + ' ' + kn + ' ' + car + ' ' + memo).indexOf(_loQ) >= 0;
}
window.loSearch = function(v){ _loQ = _loNorm(v).trim(); _loRefresh(); };
window.loSearchClear = function(){
  const el = document.getElementById('lo-q'); if (el) el.value = '';
  _loQ = ''; _loRefresh();
};

/* ===== 🔍 縮尺（v2.41.0・ゆうた指定「がっつり動く摘まめるもの」） =====
   🔴 **1日の高さ（--lo-dayh）だけが元。**列の幅も札の高さもここから割り出す（CSS 側の calc）。
   🔴 つまんでいる間は**描き直さない**＝CSS変数と列幅を書き換えるだけ。
      描き直すと20台×56日ぶんのHTMLを毎フレーム作ることになり、指について来なくなる。 */
function _loZoomStep(){ return LO_STEPS[Math.max(0, Math.min(LO_STEPS.length - 1, _loZoom))]; }
function _loDayH(){ return _loZoomStep()[0]; }
function _loColW(){ return _loZoomStep()[1]; }
function _loApplyZoom(){
  document.documentElement.style.setProperty('--lo-dayh', _loDayH() + 'px');
  const g = document.getElementById('loaner-grid');
  if (g && g.children.length){
    const cw = _loColW();
    g.style.gridTemplateColumns = '64px repeat(' + Math.max(1, _loFiltered().length) + ', minmax(' + cw + 'px, ' + cw + 'px))';
  }
  const el = document.getElementById('lo-zoom');
  if (el){
    if (el.value != _loZoom) el.value = _loZoom;
    el.style.setProperty('--lo-zfill', Math.round(_loZoom / (LO_STEPS.length - 1) * 100) + '%');
  }
}
window.loZoom = function(v){
  const n = Math.round(+v);
  _loZoom = Math.max(0, Math.min(LO_STEPS.length - 1, isFinite(n) ? n : LO_ZOOM_DEF));
  _loApplyZoom();   /* 🔴 覚えない。次に開いた時は必ず既定から */
};
/* 緊急車両：返車（割当の toDate を過ぎた）が済んだら列ごと消す（retired）。割当・車両データは履歴として残す。 */
function _loProcessEmergency(){
  const today = ymd(new Date());
  let changed = false;
  (state.loaners || []).forEach(function(l){
    if (l.emergency && !l.retired){
      const active = (state.loanerAssigns || []).some(function(a){ return a.loanerId === l.id && a.toDate >= today; });
      if (!active){ l.retired = true; l.retiredAt = today; changed = true; }
    }
  });
  if (changed && window.PitDB) PitDB.save();
}
window.loToggleFilter = function(k){
  _loFilters[k] = !_loFilters[k];
  const b = document.querySelector('.lo-filter[data-k="' + k + '"]'); if (b) b.classList.toggle('on', _loFilters[k]);
  _loHeadSync(); _loRefresh();
};
window.loToggleCat = function(cat){
  _loCats[cat] = !_loCats[cat];
  const b = document.querySelector('.lo-filter[data-cat="' + cat + '"]'); if (b) b.classList.toggle('on', _loCats[cat]);
  _loHeadSync(); _loRefresh();
};
/* 🔴 v2.41.0 並べ替えは**同時に2つ効かない**ので、押すたび入れ替わる形をやめて
   ラジオ（1つだけ選ぶ）にした。⚠ 同じものをもう一度選んでも解除しない＝「標準」を選ぶ。 */
window.loToggleSort = function(key){
  _loSortKey = key ? key : null;
  document.querySelectorAll('.lo-radio[data-sort]').forEach(function(b){ b.classList.toggle('on', (b.getAttribute('data-sort') || '') === (_loSortKey || '')); });
  _loHeadSync(); _loRefresh();
};

/* ===== 上のバーの小窓（v2.41.0） ===== */
const LO_SORTS = [
  { k:'',           lb:'標準（番号順）' },
  { k:'length',     lb:'長さ ↑' },
  { k:'width',      lb:'幅 ↑' },
  { k:'height',     lb:'高さ ↑' },
  { k:'seats',      lb:'定員 ↑' },
  { k:'camera',     lb:'Bカメ付きを先に' },
  { k:'shakenDate', lb:'車検満了が近い順' }
];
function _loHeadPopClose(){
  const p = document.getElementById('lo-hpop'); if (p) p.remove();
  document.removeEventListener('mousedown', _loHeadPopOut, true);
}
function _loHeadPopOut(e){
  const p = document.getElementById('lo-hpop');
  if (p && !p.contains(e.target)) _loHeadPopClose();
}
window.loHeadPopClose = _loHeadPopClose;
function _loHeadPop(btn, html){
  const same = !!document.getElementById('lo-hpop') && document.getElementById('lo-hpop').getAttribute('data-for') === (btn && btn.id);
  _loHeadPopClose();
  if (same) return;                    /* 同じボタンをもう一度＝閉じる */
  const p = document.createElement('div');
  p.id = 'lo-hpop'; p.className = 'lo-hpop'; p.setAttribute('data-for', (btn && btn.id) || '');
  p.innerHTML = html;
  document.body.appendChild(p);
  /* ⚠ 押したボタンが見つからない時でも落とさない（画面の作りを変えた時に ここ で止まると全部止まる） */
  const r = (btn && btn.getBoundingClientRect) ? btn.getBoundingClientRect()
          : { top: 60, bottom: 88, left: 0, right: document.documentElement.clientWidth - 16 };
  const w = p.offsetWidth, h = p.offsetHeight;
  const vw = document.documentElement.clientWidth;
  let left = r.right - w; if (left + w > vw - 8) left = vw - w - 8; if (left < 8) left = 8;
  let top = r.bottom + 6; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  p.style.left = left + 'px'; p.style.top = top + 'px';
  setTimeout(function(){ document.addEventListener('mousedown', _loHeadPopOut, true); }, 0);
}
window.loFilterMenu = function(ev){
  if (ev) ev.stopPropagation();
  const chip = function(attr, val, lb, on){
    return '<button class="lo-filter' + (on ? ' on' : '') + '" ' + attr + '="' + val + '" onclick="'
         + (attr === 'data-k' ? 'loToggleFilter' : 'loToggleCat') + '(\'' + val + '\')">' + lb + '</button>';
  };
  _loHeadPop(document.getElementById('lo-fbtn'),
    '<h4>装備</h4><div class="lo-hpop-chips">'
    + chip('data-k','etc','ETC',_loFilters.etc) + chip('data-k','navi','ナビ',_loFilters.navi)
    + chip('data-k','iso','ISO',_loFilters.iso) + chip('data-k','camera','Bカメ',_loFilters.camera)
    + '</div><h4>区分</h4><div class="lo-hpop-chips">'
    + chip('data-cat','kei','軽',_loCats.kei) + chip('data-cat','normal','普通',_loCats.normal)
    + chip('data-cat','import','輸入',_loCats.import) + chip('data-cat','commercial','商用',_loCats.commercial)
    + '</div><div class="lo-hpop-foot"><button class="vh-btn" onclick="loFilterClear()">クリア</button>'
    + '<button class="vh-btn" onclick="loHeadPopClose()">閉じる</button></div>');
};
window.loFilterClear = function(){
  Object.keys(_loFilters).forEach(function(k){ _loFilters[k] = false; });
  Object.keys(_loCats).forEach(function(k){ _loCats[k] = false; });
  document.querySelectorAll('#lo-hpop .lo-filter').forEach(function(b){ b.classList.remove('on'); });
  _loHeadSync(); _loRefresh();
};
window.loSortMenu = function(ev){
  if (ev) ev.stopPropagation();
  const rows = LO_SORTS.map(function(x){
    return '<label class="lo-radio' + (((_loSortKey || '') === x.k) ? ' on' : '') + '" data-sort="' + x.k
         + '" onclick="loToggleSort(\'' + x.k + '\')">' + x.lb + '</label>';
  }).join('');
  _loHeadPop(document.getElementById('lo-sbtn'), '<h4>並べ替え（低い・少ない順）</h4>' + rows);
};
/* ＋追加＝いまある入口をここに集めた。**新しい機能はここでは増やしていない。** */
window.loAddMenu = function(ev){
  if (ev) ev.stopPropagation();
  let btn = (ev && ev.currentTarget) ? ev.currentTarget : null;
  if (!btn && document.querySelector) btn = document.querySelector('.lo-addbtn');
  if (!btn) btn = document.getElementById('lo-abtn');
  if (btn && !btn.id) btn.id = 'lo-abtn';
  _loHeadPop(btn,
    '<button class="lo-hpop-b" onclick="loHeadPopClose();loAddManualBlock()">'
    + '<span class="lo-hpop-sw" style="background:#3b82f6"></span>予約以外で代車を貸出<small>車販の乗り換えなど</small></button>'
    + '<button class="lo-hpop-b" onclick="loHeadPopClose();loAddHold({})">'
    + '<span class="lo-hpop-sw" style="background:rgba(116,152,200,.65)"></span>🅿 仮押さえ<small>ひとことメモだけで枠を押さえる</small></button>'
    + '<button class="lo-hpop-b" onclick="loHeadPopClose();loAddEmergency()">'
    + '<span class="lo-hpop-sw" style="background:#ef4444"></span>緊急車両を追加<small>クレーム対応などで社用車を出す</small></button>');
};
/* ボタンの見た目を、いまの絞込・並べ替えに合わせる（閉じていても効いているか分かるように） */
function _loHeadSync(){
  const n = Object.keys(_loFilters).filter(function(k){ return _loFilters[k]; }).length
          + Object.keys(_loCats).filter(function(k){ return _loCats[k]; }).length;
  const c = document.getElementById('lo-fcnt');
  if (c){ c.textContent = n; c.style.display = n ? 'inline-block' : 'none'; }
  const fb = document.getElementById('lo-fbtn'); if (fb) fb.classList.toggle('lo-on', !!n);
  const sb = document.getElementById('lo-sbtn');
  if (sb){
    const cur = LO_SORTS.filter(function(x){ return x.k === (_loSortKey || ''); })[0];
    sb.innerHTML = '<i data-ic=sort data-ics=16></i> ' + ((cur && cur.k) ? cur.lb : '並べ替え') + ' ▾';
    sb.classList.toggle('lo-on', !!_loSortKey);
  }
}
window.loHeadSync = _loHeadSync;

/* カードの代車情報(needLoaner+loanerId+loanerFrom)を代車カレンダーの割当(loanerAssigns)へ同期する（v0.100.2）。
   ◎背景：従来は実予約・仮予約で代車を入れてもカードに値が入るだけで割当が作られず、代車カレンダーに載らなかった
     （割当はサンプル生成と手動貸出だけが作っていた）。これで通常予約も仮予約も代車カレンダーに反映される。
   ・cardIdで突き合わせ：無ければ作成／あれば日付・代車を更新／代車不要・カード消滅になったら削除。
   ・手動貸出(manual)・緊急(emergency)＝cardId無しは対象外（そのまま残す）。
   ・代車カレンダーで下書き編集中(_loDraftOrig)は既存割当を上書きしない（編集を壊さない）。 */
/* 🔴 v1.81.0 「車を返したら代車も返ってきた」を自動で反映する（ゆうた指定）。
   -------------------------------------------------------------------
   ◎やること
     ・その貸出を **返却済（灰色）** にする
     ・**返却日＝車をお客様に引き渡した日** に合わせる
       → 予定より早く返ってきていれば、そのぶん **代車の枠が空く**（次の人に貸せる）
       → 予定より遅かったら、そのぶん **枠を伸ばす**（空いていないのに空きに見えるのを防ぐ）
   ◎やらないこと（手で押した方が必ず勝つ）
     🔴 すでに「返却確定」が押してあれば **触らない**（イレギュラーの入力が正）
     🔴 「返却取消」を押した予約も **触らない**（`c.loanerReturned === false` が目印）
   ⚠ 返した日が分からない予約は触らない（当てずっぽうで日付を入れない）。 */
function _loCardBackDate(c){
  return String((c && (c.returnDateFinal || c.returnDate || c.completedAt)) || '');
}
function _loAutoReturnByCard(a, c){
  if (!a || !c) return false;
  if (a.returned) return false;                 /* 手で確定済み＝そちらが正 */
  if (c.loanerReturned === false) return false; /* 手で「返却取消」した＝自動で戻さない */
  if (c.status !== 'returned') return false;    /* まだ車が返っていない */
  let back = _loCardBackDate(c);
  if (!back) return false;                      /* 返した日が分からない＝触らない */
  if (back < a.fromDate) back = a.fromDate;     /* 貸出開始より前にはしない */
  a.returned = true;
  a.returnedAt = back;
  a.autoReturned = true;                        /* 自動で付けた印（人が押したものと見分ける） */
  if (a.toDate !== back){
    if (a.toDateBefore == null) a.toDateBefore = a.toDate;   /* 元の予定＝「返却取消」で戻すため */
    a.toDate = back;                            /* 枠を実際の返却日に合わせる */
  }
  c.loanerTo = a.toDate;
  c.loanerReturned = true;
  return true;
}

function pitSyncLoanerAssigns(){
  if (!state.cards) return;
  const assigns = state.loanerAssigns = (state.loanerAssigns || []);
  const drafting = !!_loDraftOrig;
  let changed = false;
  // 1) カード → 割当（作成・更新）
  state.cards.forEach(function(c){
    if (!(c.needLoaner && c.loanerId && c.loanerFrom)) return;
    const to = c.loanerTo || c.loanerFrom;
    let a = assigns.find(function(x){ return x.cardId === c.id; });
    if (!a){
      assigns.push({ id:'la' + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
        cardId:c.id, loanerId:c.loanerId, fromDate:c.loanerFrom, toDate:to });
      changed = true;
      a = assigns[assigns.length - 1];
    } else if (!drafting && !a.returned){
      if (a.loanerId !== c.loanerId || a.fromDate !== c.loanerFrom || a.toDate !== to){
        a.loanerId = c.loanerId; a.fromDate = c.loanerFrom; a.toDate = to; changed = true;
      }
    }
    /* 🔴 v1.81.0（ゆうた指定）**車を返したら、代車も返ってきたことにする。**
       🗣「ほとんどの場合、預かる時に貸し出して、返車するときに戻ってくる。
          代車カレンダー上の返却確定は、**まれなイレギュラー**（代車だけ先に返してもらう等）のために使う」
       ⚠ 以前は「返却確定」を押した時だけ灰色になったので、
          **車を引き渡して代車も戻っているのに、代車カレンダーはずっと貸出中に見えていた。** */
    /* 🔴 v1.148.0（ゆうた指定 2026-08-19）**自動返却は、下書き中でも必ず効かせる。**
       🗣「（自動返却は）車両を例えば当日ビューから返車済みにしたっていうアクションの事だよね？
       　　それであれば**自動返却は必ず反映するようにしてほしい**」

       ⚠ v1.147.0 まではここが `!drafting` で止まっていた。
          ＝ 代車カレンダーで札を動かしかけたまま（反映も破棄もしていない状態で）返車済みにすると、
             **代車がいつまでも「貸出中」のまま赤い超過で残っていた。**
          しかも下書きは端末に残るので、**次にカレンダーを開くとまた止まった状態に戻る**という質の悪さだった。

       ⚠ 下書き中の扱い（2つだけ気をつけている）
         ① **保存はしない。**ここで保存すると、まだ確定していない下書きごとクラウドに書いてしまう。
            画面にはすぐ出る／保存は「反映」「破棄」した時か、次に開いた時に自動で追いつく（何度でも数え直せる）。
         ② **下書きの控えにも返却日を入れる。**入れないと「破棄」で貸出の枠だけ元の長さに戻り、
            返却済みなのにバーが伸びたままになる。 */
    if (_loAutoReturnByCard(a, c)){
      if (drafting){
        if (_loDraftOrig && _loDraftOrig[a.id]) _loDraftOrig[a.id].toDate = a.toDate;
      } else {
        changed = true;
      }
    }
  });
  // 2) 不要になった割当を削除（カード由来なのに代車不要/カード消滅）。手動・緊急は残す。
  if (!drafting){
    const before = assigns.length;
    state.loanerAssigns = assigns.filter(function(a){
      if (!a.cardId) return true;   // 手動/緊急
      /* 🔴 v1.80.0 **返却済みの貸出は消さない。**
         ⚠ 以前は、返却まで済んだ貸出でも、あとからカードの「代車 不要」を押すと
            **貸した記録ごと消えていた**（更新の側は `!a.returned` で守っていたのに、削除だけ素通り）。
            実際に貸した事実は残す＝カレンダーの履歴・トラブル時の確認のため。 */
      if (a.returned) return true;
      const c = state.cards.find(function(x){ return x.id === a.cardId; });
      return !!(c && c.needLoaner && c.loanerId && c.loanerFrom);
    });
    if (state.loanerAssigns.length !== before) changed = true;
  }
  if (changed && window.PitDB) PitDB.save();
}
window.pitSyncLoanerAssigns = pitSyncLoanerAssigns;

function renderLoaner(){
  /* 🔴 v2.70.1 前の仕組み（v1.12）が作った車検・点検の予定を片付ける。
     ⚠ 前は「12ヶ月点検の位置を貼り直す」だった。**その仕組みごとやめた**ので、いまは片付けるだけ。 */
  try { if (window.pitCleanupAutoVehEvents) pitCleanupAutoVehEvents(); } catch (e) {}
  const grid = document.getElementById('loaner-grid');
  if (!grid) return;
  /* 🔴 v1.80.0 前回の下書きの控えを端末から拾い直す（リロードしても「破棄」で戻せるように）。
     ⚠ 同期（pitSyncLoanerAssigns）より**前**に。同期は下書き中は既存の割当に触らない作りなので、
        先に下書きだと分からせておかないと、下書きの変更が上書きされる。 */
  _loDraftRestore();
  pitSyncLoanerAssigns();   // カードの代車情報を割当に反映してから描画
  // 代車割当に id が無いとドラッグ移動(data-aid)が効かない＝旧データ/サンプル救済で必ず採番
  (state.loanerAssigns || []).forEach(function(a, i){
    if (a && !a.id) a.id = 'la' + Date.now().toString(36) + i.toString(36);
  });
  _loEnsureOpts();
  /* 新しく開いたか（下の _fresh と同じ物差し。縮尺を戻すのに先に要る） */
  const _w0 = document.getElementById('loaner-scroll');
  const _fresh0 = (window._pitPrevView !== 'loaner') || !_w0 || !_w0.querySelector('.lo-date');
  /* 🔍 v2.41.1 縮尺は**覚えない**＝画面を開き直したら必ず既定に戻す（ゆうた指定）。
     ⚠ 描いたあとに当てると一瞬前の大きさが見えるので、ここで先に当てる。 */
  if (_fresh0) _loZoom = LO_ZOOM_DEF;
  document.documentElement.style.setProperty('--lo-dayh', _loDayH() + 'px');
  _loDedupeAssigns();         // 同一予約の二重割当を掃除（日数調整が重複扱いされる不具合の元）
  _loProcessReplacements();   // 入替日を過ぎた予定を確定
  _loProcessEmergency();      // 返車済みの緊急車両は列を消す（履歴は残す）
  /* 🔴 v1.95.0（ゆうた報告 2026-08-15）**スクロールが一回ガクッと戻る。**
     ⚠ 正体＝**背後の描き直し**。誰かが予約を直す・クラウドから届く・MHSのカレンダーが来る…
        そのたびに `showView(state.currentView)` が呼ばれ、ここが**毎回いちばん上（今日）まで巻き戻して**いた。
        （`_loStart` を今日−14日に戻して描き直し → `loScrollToday()` で今日へアンカー）
     🔴 **新しく開いた時だけ今日へ寄せる。同じ画面の描き直しなら、見ていた場所に戻す。**
        描き直しでは**日付の範囲（_loStart / _loCount）も変えない**＝過去へ遡って見ていた分が消えない。 */
  const _wrap0 = document.getElementById('loaner-scroll');
  const _fresh = (window._pitPrevView !== 'loaner') || !_wrap0 || !_wrap0.querySelector('.lo-date');
  const _keep  = _fresh ? null
               : { top: _wrap0.scrollTop, left: _wrap0.scrollLeft, start: _loStart, count: _loCount };

  const today = new Date(); today.setHours(0,0,0,0);
  if (_fresh){
    _loStart = addDays(today, -14);   // 過去を多めに描画＝当日アンカー後に過去継ぎ足しが暴発しない＋前5日を確実に表示
    loRebuild(56);
  } else {
    _loStart = _keep.start;
    loRebuild(Math.max(56, _keep.count));   // 見ていた範囲をそのまま作り直す
  }

  const wrap = document.getElementById('loaner-scroll');
  if (wrap && !_loBound){
    _loBound = true;
    wrap.addEventListener('scroll', function(){
      if (wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - 400) loAppendDays(30);
      if (wrap.scrollTop < 150) loPrependDays(30);   // 上端付近で過去を継ぎ足し（アーカイブとして遡れる）
    });
  }
  if (!_loDnd){ _loDnd = true; loBindDnd(grid); }
  /* 🔎🔍 v2.41.0 上のバーを、いまの状態に合わせる（探している言葉・絞込の数・並べ替え・縮尺） */
  const _q = document.getElementById('lo-q'); if (_q && _q.value !== _loQ) _q.value = _loQ;
  _loHeadSync();
  _loApplyZoom();
  if (_fresh){
    requestAnimationFrame(function(){ loScrollToday(); setTimeout(loScrollToday, 60); });   // レイアウト確定後に確実にアンカー
  } else if (wrap && _keep){
    /* 描き直し＝見ていた場所へ黙って戻す。⚠ アニメーションさせない（また動いたように見える） */
    wrap.scrollTop = _keep.top; wrap.scrollLeft = _keep.left;
    requestAnimationFrame(function(){ wrap.scrollTop = _keep.top; wrap.scrollLeft = _keep.left; });
  }
}

/* 代車の詳細ホバーは「常時・どのビューでも」効くようグローバルに1回だけ紐付け。
   対象＝[data-loid] を持つ要素（代車カレンダーの列ヘッダ／空きカレンダー・新規予約の代車ガントのヘッダ）。 */
(function(){
  if (_loVehBound) return; _loVehBound = true;
  document.addEventListener('mouseover', function(e){
    const hd = e.target.closest && e.target.closest('[data-loid]');
    if (hd) loVehHover(hd);
  });
  document.addEventListener('mouseout', function(e){
    const hd = e.target.closest && e.target.closest('[data-loid]');
    if (hd){ const to = e.relatedTarget; if (!to || !(to.closest && to.closest('[data-loid]'))) loVehHide(); }
  });
  document.addEventListener('scroll', loVehHide, true);
})();

/* 代車ヘッダのホバー＝代車の詳細カード（車種・ETC/ナビ/ISO/高さ） */
function loVehHover(headEl){
  const id = headEl.dataset.loid;
  const l = (state.loaners || []).find(function(x){ return x.id === id; });
  if (!l) return;
  let el = document.getElementById('lo-veh-hover');
  if (!el){ el = document.createElement('div'); el.id = 'lo-veh-hover'; document.body.appendChild(el); }
  const opt = function(on, label){ return '<span class="lvh-opt ' + (on ? 'on' : 'off') + '">' + (on ? '✓' : '<i data-ic=close data-ics=16></i>') + ' ' + label + '</span>'; };
  const dim = function(label, v){ return '<span class="lvh-dim">' + label + '<b>' + (v != null ? _loEsc(v) : '—') + '</b></span>'; };
  const catLb = LO_CAT[l.category] || '';
  const _loSeatTxt = window.pitSeatsText ? pitSeatsText(l.seats) : '';   /* v1.15.0：定員は自由入力 */
  const num = (l.number != null ? l.number : (parseInt(String(l.name||'').replace(/[^0-9]/g,''),10) || ''));
  el.innerHTML =
      '<div class="lvh-head">'
        + (num !== '' ? '<span class="lvh-no">' + _loEsc(num) + '</span>' : '')
        + '<span class="lvh-name">' + _loEsc(l.model || '（車種未登録）') + '</span>'   // 車種名＝メイン
        + (l.color ? '<span class="lvh-color">' + _loEsc(l.color) + '</span>' : '')        // 色＝添え（落とす）
      + '</div>'
    + '<div class="lvh-badges">'
        + (l.plate ? '<span class="lvh-plate-badge">' + _loEsc(l.plate) + '</span>' : '')   // ナンバー＝バッジ
        + (catLb ? '<span class="lvh-cat ' + _loEsc(l.category) + '">' + catLb + '</span>' : '')
        + (_loSeatTxt ? '<span class="lvh-seats">定員' + _loEsc(_loSeatTxt) + '</span>' : '')
      + '</div>'
    + '<div class="lvh-opts">' + opt(l.etc, 'ETC') + opt(l.navi, 'ナビ') + opt(l.iso, 'ISO') + opt(l.camera, 'Bカメ') + '</div>'
    + '<div class="lvh-dims">' + dim('長さ ', l.length != null ? l.length + 'cm' : null) + dim('幅 ', l.width != null ? l.width + 'cm' : null) + dim('高さ ', l.height != null ? l.height + 'cm' : null) + '</div>'
    + (l.shakenDate ? '<div class="lvh-sub">車検 ' + _loEsc(window.pitWareki(l.shakenDate))
         + '　<span class="lvh-tenken">12ヶ月点検 ' + _loEsc(window.pitWareki(window.pitTenkenFromShaken(l.shakenDate), 'ym')) + '</span></div>' : '');
  el.classList.add('show');
  const r = headEl.getBoundingClientRect();
  const w = 220, vw = document.documentElement.clientWidth;
  let left = r.left; if (left + w > vw - 8) left = vw - w - 8;
  el.style.left = Math.max(8, left) + 'px';
  el.style.top = (r.bottom + 6) + 'px';
}
function loVehHide(){ const el = document.getElementById('lo-veh-hover'); if (el) el.classList.remove('show'); }

function loRebuild(days){
  const grid = document.getElementById('loaner-grid');
  if (!grid) return;
  _loEnsureOpts();
  const ls = _loFiltered();
  grid.innerHTML = '';
  /* 🔍 v2.41.0 列の幅は縮尺から。⚠ 既定（縮尺23）で 112px ＝直す前と同じ。 */
  const _cw = _loColW();
  grid.style.gridTemplateColumns = '64px repeat(' + Math.max(1, ls.length) + ', minmax(' + _cw + 'px, ' + _cw + 'px))';
  let h = '<div class="lo-cell lo-head lo-corner">日付</div>';
  ls.forEach(function(l){
    /* 🔴 v1.46.0 ゆうた指定＝**数字より車種名をメイン**。
       現場は「代車5」ではなく「タント」で呼ぶので、**車種名を大きく・番号は小さく下に**。
       ⚠ 車種が未登録の代車は車種欄が空になるので、その時だけ番号を主役に戻す（列が真っ白にならないように）。
       ⚠ 番号は鍵タグ・車両管理と突き合わせるのに要るので**消さない**。 */
    const num = (l.number != null && l.number !== '') ? String(l.number)
              : (String(l.name || '').replace('代車', '') || l.name);
    const model = String(l.model || '').trim();
    const emgCls = l.emergency ? ' lo-emg-head' : '';
    const emgTag = l.emergency ? '<div class="lo-emg-tag"><i data-ic=warn data-ics=16></i> 緊急</div>' : '';
    const body = model
      ? '<div class="lo-model">' + _loEsc(model) + '</div><div class="lo-no">' + _loEsc(num) + '</div>'
      : '<div class="lo-model lo-model-none">' + _loEsc(num) + '</div><div class="lo-no lo-no-sub">車種未登録</div>';
    h += '<div class="lo-cell lo-head' + emgCls + '" data-loid="' + l.id + '" title="' + _loEsc((model ? model + ' ' : '') + '（' + num + '）') + '">' + emgTag + body + '</div>';
  });
  grid.insertAdjacentHTML('beforeend', h);
  _loCount = 0;
  loAppendDays(days);
}

function loScrollToday(){
  const wrap = document.getElementById('loaner-scroll');
  if (!wrap) return;
  const head = wrap.querySelector('.lo-head');
  // 「今日の5日前の日付セル」を固定ヘッダの直下に持ってくる＝前5日を確実に見せる。
  // offsetTop基準ズレを避けるため getBoundingClientRect で実測してスクロール量を計算。
  const past = ymd(addDays(new Date(), -5));
  const target = wrap.querySelector('.lo-date[data-ld="' + past + '"]') || wrap.querySelector('.lo-date.lo-today');
  if (!target) return;
  const wrapTop = wrap.getBoundingClientRect().top;
  const hh = head ? head.getBoundingClientRect().height : 40;
  const cur = target.getBoundingClientRect().top;
  wrap.scrollTop = Math.max(0, wrap.scrollTop + (cur - wrapTop - hh - 2));
}

/* 指定開始日から n 日ぶんの行HTMLを作る（append/prepend 共通） */
function _loRenderDays(start, n){
  const ls = _loFiltered();
  const todayStr = ymd(new Date());
  const confSet = _loDraftOrig ? _loNewBad() : null;        // 下書き中だけ・今回新しく発生した重複のみ赤表示
  const changedList = _loChangedList();                          // 元位置ゴースト用
  let h = '';
  for (let i = 0; i < n; i++){
    const d = addDays(start, i);
    const dStr = ymd(d);
    const dow = d.getDay();
    const hol = (window.Holidays && Holidays.name(dStr)) || null;
    const isToday = dStr === todayStr;
    /* 🚫 v1.50.0 休みは MHS の定休日カレンダー（PitCal）が基準＝臨時休業・お盆もここに出る */
    const isClosed = (window.PitCal ? PitCal.isClosed(dStr) : false);
    const calNote  = (window.PitCal ? PitCal.label(dStr) : '');
    /* 🔴 v1.94.0（ゆうた指定 2026-08-15）代車カレンダーの休日表示。
       ・土曜＝青／日曜＝赤／祝日＝赤／**自社の休み＝斜線**（重なったら色＋斜線）
       ・**いちばん奥に敷く**＝この上に代車の札・茎・矢印が乗る。
       ⚠ 直す前は `.lo-bk.lo-closed{background:transparent!important}` で
          **貸出が入った日だけ休みの色が消えていた**（ゆうた報告）。
          セルの背景で塗っていたので、札を出すために消すしかなかった。
          → 専用の「敷き紙」（.lo-daybg）を1枚いちばん下に入れて、そこに塗る形にした。 */
    const dayMods = (isClosed ? ' lo-closed' : '') + (hol ? ' lo-holiday' : '')
                  + (dow === 0 ? ' sun' : (dow === 6 ? ' sat' : ''));
    /* 敷き紙。**セルのいちばん最初**に入れること＝あとから足す物（茎・札・矢印）が上に乗る。 */
    const dayBg = '<i class="lo-daybg"></i>';

    /* ⚠ 日付列は敷き紙の上に文字が来るよう、中身を .lo-dtxt で包む
       （包まないと、位置指定していない生の文字が敷き紙の下に潜る）。 */
    h += '<div class="lo-cell lo-date' + (isToday ? ' lo-today' : '') + dayMods + (isClosed ? ' closed' : '') + '" data-ld="' + dStr + '">'
       + dayBg
       + '<span class="lo-dtxt">'
       + (d.getDate() === 1 ? '<div class="lo-month">' + (d.getMonth()+1) + '月</div>' : '')
       + (d.getMonth()+1) + '/' + d.getDate() + ' <span>' + '日月火水木金土'[dow] + '</span>'
       + (hol ? '<div class="lo-hol">' + hol + '</div>' : '')
       + (calNote ? '<div class="lo-closed-tag' + (isClosed ? '' : ' cal-soft') + '">' + calNote + '</div>' : '')
       + '</span></div>';

    ls.forEach(function(l){
      let attrs = ' data-lo="' + l.id + '" data-ld="' + dStr + '"';
      /* 🧩 v2.42.0 その日に何が乗っているかは **loaner-free.js の部品1本**に聞く。
         この画面が本流（マスター）だが、**読み方まで自前で持つ必要は無い。**
         🔴 **保険の写し（部品が無い時の自前の読み方）は置かない。**置いた瞬間それが古くなる側になる。
         　 `loaner-free.js` は index.html で**必ずこのファイルより前**に読む（そういう決めごと）。
         ⚠ 種類（貸出／仮押さえ／代車自身の予定／これから足す整備の枠）を増やすのは部品の側。 */
      const day = pitLoanerDay(l.id, dStr);
      /* 🔧🔴 v2.70.0（ゆうた確定 2026-09-05）**代車カレンダーに整備予定を出す。**
         ◎前まで … このカレンダーは貸出・仮押さえ・代車自身の予定しか読んでいなかった。
           なのに「空いているか」の物差し（pitLoanerDay().busy）は**確定の整備をふさがりに数える**。
           ＝ **マスは空いて見えるのに、貸そうとすると警告だけ出る**（理由が画面に無い）。
         ◎いま … 太い縦バー＋作業名の札で出す（ゆうた指定「太い縦バーで外わくなし」）。
           🔴 縦バーは**期間ぜんぶの日**に引き、**最初と最後だけ丸める**（途中は地続き）。
           🔴 札は**最初の日に1枚だけ**。貸出の札が乗る日には出さない（重ねない）。
           ⚠ 候補は**代車をふさがない**＝今までどおり貸せる。見た目も薄い方にする。 */
      let mtLine = '', mtTag = '', mtTitle = '';
      if (day.maints.length){
        const mt = day.maints[0];
        /* ⚠ 札を押せなくしたぶん、**何が入っているかはマスの title**（カーソルを乗せた時）で言う。
           ⚠ 候補は代車をふさがない＝そこも一緒に書く（押さなくても分かるように）。 */
        mtTitle = mt.label + ' ' + mt.from + '〜' + mt.to
          + '（' + (mt.done ? '済' : (mt.stage === 'fixed' ? '確定・この期間は貸せません' : '予定・まだ貸せます')) + '）'
          + '／直すのは車両管理の作業予定ボードから';
        /* 🏁 v2.72.0 済んだもの＝グレー（ゆうた指定「グレーで終わった感じを出して」）。
           ⚠ 確定より先に見る＝済んだ確定は緑ではなくグレーになる。 */
        const mCls = mt.done ? 'done' : (mt.stage === 'fixed' ? 'fixed' : 'cand');
        mtLine = '<span class="lo-mtline ' + mCls + (mt.isStart ? ' st' : '') + (mt.isEnd ? ' en' : '') + '"></span>';
        if (mt.isStart){
          const _dot = (window.pitMaintWorkDot ? pitMaintWorkDot(mt.work) : 'wk-general');
          /* 🔴🔴 v2.72.1（ゆうた指定 2026-09-05）**ここは押せなくする。**
             🗣「代車カレンダー本体側からは修理系のイベントはさわれなくていい。
             　　あったとしても仮押さえみたいな通常のクリック挙動をするようにして」
             ◎前まで（v2.70.0）… 押すと作業予定の窓が開いていた。
               ＝ **貸出を入れようとして押した時に、整備の窓が開く**（この画面でやりたいことと違う）。
             ◎いま … 札も縦バーも**クリックを受けない**（CSS の pointer-events:none）。
               押した先はマスに素通しされて、**空きマス・仮押さえと同じ動き**になる。
             ⚠ 直す・取り消すのは**車両管理の作業予定ボード**の仕事。ここは「入っている」を見せるだけ。
             ⚠ 何の整備かは**マスの title**（カーソルを乗せた時）に回した。札には onclick を付けない。 */
          mtTag = '<span class="lo-mt ' + mCls + '">'
            + '<i class="fl-dot ' + _dot + '"></i>'
            + _loEsc((window.PIT_MAINT_WORK_SHORT && PIT_MAINT_WORK_SHORT[mt.work]) || mt.label)
            + ' ' + (mt.done ? '済' : (mt.stage === 'fixed' ? '整備中' : '予定')) + '</span>';
        }
      }
      if (mtTitle) attrs += ' title="' + _loEsc(mtTitle) + '"';
      // 車両イベント（車検・点検・修理等）の予定オーバーレイ＝日付枠で目立たせる（セル全体を色づけ＋ラベル）
      let ov = '', evCls = '';
      const evs = day.events;
      if (evs.length){
        const e0 = evs[0], c0 = e0.color || '#3b82f6';
        evCls = ' lo-evday';
        ov += '<span class="lo-evbg" style="background:' + c0 + '22;box-shadow:inset 4px 0 0 ' + c0 + ',inset -4px 0 0 ' + c0 + '"></span>';
        /* 🔴🔴 v2.72.1（ゆうた指定 2026-09-05）**ここも押せなくした。**
           ⚠ v2.70.1 で一度「押すと直す・消せる」にしたが、**取り消した。**
              🗣「代車カレンダー本体側からは修理系のイベントはさわれなくていい」
              ＝ 貸出を入れる画面なので、押した先は**マスの通常の動き**であってほしい。
           ⚠ 直す・消すのは**車両管理の月カレンダー**（そこでは今までどおり押せる）。 */
        if (e0.isStart) ov += '<span class="lo-evt-tag" style="background:' + c0 + '">'
          + '<i data-ic=wrench data-ics=16></i> ' + _loEsc(e0.label) + '</span>';
      }
      // 元位置ゴースト（下書きで動かした割当の、元の代車・日付）＝列の左端に点線で並べる
      let gh = '';
      if (changedList.length){
        const g = changedList.find(function(x){ const o=_loDraftOrig[x.id]; return o.loanerId===l.id && o.fromDate<=dStr && o.toDate>=dStr; });
        if (g){ const o=_loDraftOrig[g.id];
          gh = '<span class="lo-gh-line' + (o.fromDate===dStr?' st':'') + (o.toDate===dStr?' en':'') + '"></span>'
             + (o.fromDate===dStr ? '<span class="lo-gh-tag">元 ' + _loEsc(_loAssignLabel(g)) + '</span>' : '');
        }
      }
      /* 🅿 v2.40.0 仮押さえ＝色つきの網掛け。**札（.lo-badge）は出さない**＝ドラッグで動かすものではない。
         🔴 「空いているか」の物差し（loaner-free.js）では貸出と同じ「埋まり」に数えている。ここは見た目だけ。 */
      const hold = day.holds.length ? day.holds[0].assign : null;
      let hv = '', hCls = '';
      if (hold){
        hCls = ' lo-holdday' + (hold.fromDate === dStr ? ' lo-hold-start' : '') + (hold.toDate === dStr ? ' lo-hold-end' : '');
        hv += '<span class="lo-holdbg"></span>';
        if (hold.fromDate === dStr){
          /* 2日以上押さえている時は、下に余白があるのでメモを2行まで出す（1日だけなら1行） */
          const wide = (hold.toDate > hold.fromDate) ? ' lo-hold-w' : '';
          hv += '<span class="lo-hold-tag' + wide + (_loHitA(hold) ? ' lo-hit' : '') + '" title="' + _loEsc(hold.memo || '仮押さえ') + '" onclick="loHoldMenu(event,\'' + hold.id + '\')">'
              + '<span class="lo-hold-k">仮</span><span class="lo-hold-memo">' + _loEsc(hold.memo || '仮押さえ') + '</span></span>';
        }
      }
      // この代車・この日を覆う割当（当日かぶり対応）／🅿 仮押さえは札にしないので外す（部品が kind で分けている）
      const covering = day.lends.map(function(x){ return x.assign; });
      // バーの主役＝実効開始(effStart)がこの日以前で覆う割当（後発の同日かぶりは初日を除外＝翌日からバー）
      const a = covering.find(function(x){ return _loEffStart(x) <= dStr; }) || null;
      if (a){
        const hand = _loHandoffLater(a);   // この予約＝当日かぶりの後発（共有日に上へ伸ばし矢印型くり抜き）
        const sFrom = _loEffStart(a);
        const isStart = (sFrom === dStr);
        const isEnd = (a.toDate === dStr);
        const single = isStart && isEnd;
        const days = Math.round((_loPd(a.toDate) - _loPd(sFrom)) / 86400000) + 1;
        const compact = days <= 2 && !hand;   // 後発の当日かぶりはフル札（くり抜きを綺麗に出す）
        const card = a.cardId ? state.cards.find(function(c){ return c.id === a.cardId; }) : null;
        const isEmg = !!a.emergency;
        const isKari = !!(card && card.tentative);   // 仮予約の代車＝バッジに「仮」 v0.100.0
        /* 🔵 v1.74.0 承認待ちの代車＝バッジに「承」（枠は本予約と同じに埋まる＝ゆうた指定） */
        const _apr = (window.pitApprovalBadge && card) ? pitApprovalBadge(card, 'lo') : '';
        const fixed = !!(card && card.loanerFixed);
        const returned = !!a.returned;
        const teamColor = _loTeamColor(a);
        const _nm = card ? ((window.pitCustSurname ? pitCustSurname(card) : (card.customer || '')) || '予約') : (a.customer || (isEmg ? '緊急' : '貸出'));
        const fullName = card ? ((window.pitCustName?pitCustName(card):card.customer) || _nm) : (a.customer || _nm);
        const carTxt = card ? (card.car || '') : (a.car || '');
        const memoTxt = card ? (card.loanerOther || '') : (a.purpose || '');
        let labelHtml = '';
        if (isStart){
          if (compact){
            // 省スペース：客名＝苗字/法人略記(㈱)（長い時だけ…）＋車種（長い時だけ…）＋固（黄）。詳細はホバーでフルサイズ札。
            labelHtml = (isKari ? '<span class="kari-lo" title="仮予約">仮</span>' : _apr) + '<span class="lo-lbl mini"><span class="lo-mininm">' + _loEsc(_nm) + '</span>' + (carTxt ? '<span class="lo-minicar">' + _loEsc(carTxt) + '</span>' : '') + (fixed ? '<span class="lo-fix">固</span>' : '') + '</span>';
          } else {
            labelHtml = (isKari ? '<span class="kari-lo" title="仮予約">仮</span>' : _apr)
              + '<span class="lo-lbl full">'
              + '<span class="lo-nm">' + _loEsc(_nm) + ' 様</span>'   /* 🔴 v1.80.0 エスケープ漏れを修正（省スペース版だけ通っていた） */
              + '<span class="lo-car2"><span class="lo-cartxt">' + (carTxt ? _loEsc(carTxt) : '') + '</span>' + (fixed ? '<span class="lo-fix">固定</span>' : '') + '</span>'
              + (memoTxt ? '<span class="lo-memo">' + _loEsc(memoTxt) + '</span>' : '')
              + '</span>';
          }
        }
        /* 🔴 v1.80.0 **その日を覆っている貸出が2件以上ある＝二重貸し。**
           以前は主役の1枚しか描かず、二重になっていても**画面では気づけなかった**。
           ⚠ 当日かぶり（返却日＝次の開始日）は二重ではないので数えない
              ＝実効開始（_loEffStart）がこの日以前のものだけを数える。 */
        const dupN = covering.filter(function(x){ return _loEffStart(x) <= dStr; }).length;
        const isDup = dupN > 1;
        const isBad = (confSet && confSet.has(a.id)) || isDup;
        const isChg = _loAssignChanged(a);
        const hoverAttr = compact ? (' onmouseenter="loInfoHover(this,\'' + (a.id || '') + '\')" onmouseleave="loInfoHide()"') : '';
        h += '<div class="lo-cell lo-bk' + (isStart ? ' bk-start' : '') + (isEnd ? ' bk-end' : '') + (single ? ' bk-single' : '') + (compact ? ' bk-compact' : ' bk-full') + (fixed ? ' lo-fixed' : '') + (returned ? ' lo-returned' : '') + (isToday ? ' lo-today' : '') + (isBad?' lo-bad':(isChg?' lo-chg':'')) + (isDup?' lo-dup':'') + evCls + hCls + dayMods + '"' + attrs
           + ' style="--lo-team:' + teamColor + '">' + dayBg + '<i class="lo-fill"></i>' + gh;
        /* 🔴 二重貸しの日は「2」の印を出す（押すと何と重なっているかを出す） */
        if (isDup){
          h += '<span class="lo-dupmark" title="この日は貸出が ' + dupN + ' 件重なっています"'
             + ' onclick="event.stopPropagation();loShowDup(\'' + l.id + '\',\'' + dStr + '\')">' + dupN + '</span>';
        }
        if (isStart){
          h += '<span class="lo-badge ' + (compact ? 'mini' : 'full') + (hand ? ' lo-handoff' : '') + (isChg?' chg':'') + (isKari ? ' lo-kari' : '') + (_loHitA(a) ? ' lo-hit' : '') + '"' + (returned ? '' : ' draggable="true"') + ' data-aid="' + (a.id || '') + '"' + (card ? ' data-card-id="' + card.id + '"' : '') + ' onclick="loBadgeMenu(event,\'' + (a.id || '') + '\')"' + hoverAttr + '>' + labelHtml + '</span>';
        }
        if (isEnd && !single){
          /* 🔴 v1.94.0 終端の▼は CSS の三角（.lo-end::after）で描く＝茎と地続きにするため。
             ⚠ 中にアイコンを入れない。入れると線のV字が戻って、また先が浮いて見える。 */
          h += '<span class="lo-end"' + (returned ? '' : ' draggable="true"') + ' data-aid="' + (a.id || '') + '" title="下へドラッグで返却日を伸ばせます"></span>';
        }
        /* 🔧 整備の縦バーは貸出の日にも引く（＝重なっていることが目で分かる）。
           ⚠ 札は貸出の札が出る日には出さない（重ねない）。 */
        h += ov + hv + mtLine + (isStart ? '' : mtTag) + '</div>';
      } else {
        /* 🅿 v2.40.0 仮押さえの日は `.lo-free` を付けない
           ＝ドラッグの範囲選択に入らない（押したら「解除」の窓が開く）。 */
        h += '<div class="lo-cell ' + (hold ? 'lo-hold' : 'lo-free') + (isToday ? ' lo-today' : '') + evCls + hCls + dayMods + '"' + attrs
           + (hold ? ' onclick="loHoldMenu(event,\'' + hold.id + '\')"' : '') + '>' + dayBg + gh + ov + hv + mtLine + mtTag + '</div>';
      }
    });
  }
  return h;
}
/* 未来側（下）に継ぎ足し */
function loAppendDays(n){
  const grid = document.getElementById('loaner-grid');
  if (!grid || !_loStart) return;
  grid.insertAdjacentHTML('beforeend', _loRenderDays(addDays(_loStart, _loCount), n));
  _loCount += n;
}
/* 過去側（上）に継ぎ足し＝アーカイブとして遡れる。スクロール位置は維持。 */
function loPrependDays(n){
  const grid = document.getElementById('loaner-grid');
  const wrap = document.getElementById('loaner-scroll');
  if (!grid || !wrap || _loPrepending) return;
  _loPrepending = true;
  const oldH = wrap.scrollHeight;
  const newStart = addDays(_loStart, -n);
  const h = _loRenderDays(newStart, n);
  const firstDate = grid.querySelector('.lo-date');
  if (firstDate) firstDate.insertAdjacentHTML('beforebegin', h); else grid.insertAdjacentHTML('beforeend', h);
  _loStart = newStart; _loCount += n;
  wrap.scrollTop += (wrap.scrollHeight - oldH);   // 見た目の位置を保つ
  _loPrepending = false;
}

/* ===== 代車間ドラッグ移動 ===== */
function loBindDnd(grid){
  grid.addEventListener('dragstart', function(e){
    const b = e.target.closest('.lo-badge[data-aid], .lo-end[data-aid]');
    if (!b || !b.dataset.aid){ return; }
    _loDragAid = b.dataset.aid;
    _loDragMode = b.classList.contains('lo-end') ? 'resize' : 'move';
    _loPrevKey = null;
    if (e.dataTransfer){ e.dataTransfer.effectAllowed = 'move'; try{ e.dataTransfer.setData('text/plain', _loDragAid); }catch(_){} }
  });
  grid.addEventListener('dragover', function(e){
    if (!_loDragAid) return;
    const c = e.target.closest('[data-lo]');
    if (c){
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      // ゴーストプレビュー：落としたらどうなるかを透けて表示（競合は赤）
      const key = c.getAttribute('data-lo') + '|' + c.getAttribute('data-ld');
      if (key !== _loPrevKey){
        _loPrevKey = key;
        loPreview(c.getAttribute('data-lo'), c.getAttribute('data-ld'));
      }
    }
  });
  grid.addEventListener('drop', function(e){
    const c = e.target.closest('[data-lo]');
    loClearPreview();
    if (!c || !_loDragAid) return;
    e.preventDefault();
    if (_loDragMode === 'resize') loResizeAssign(_loDragAid, c.getAttribute('data-ld'));
    else loMoveAssignTo(_loDragAid, c.getAttribute('data-lo'), c.getAttribute('data-ld'));
    _loDragAid = null;
  });
  grid.addEventListener('dragend', function(){ _loDragAid = null; loClearPreview(); });

  // v0.98.1 空きセルをドラッグで範囲選択 → 「予約以外で貸出」ポップアップ（代車・期間プリフィル）
  grid.addEventListener('mousedown', function(e){
    const c = e.target.closest('.lo-free[data-lo][data-ld]');
    if (!c) return;
    e.preventDefault();   // テキスト選択を防ぐ
    _loSel = { lo: c.getAttribute('data-lo'), a: c.getAttribute('data-ld'), b: c.getAttribute('data-ld') };
    _loPaintSel();
  });
  grid.addEventListener('mousemove', function(e){
    if (!_loSel) return;
    const c = e.target.closest('[data-lo][data-ld]');
    if (!c || c.getAttribute('data-lo') !== _loSel.lo) return;   // 同じ代車列の範囲だけ
    _loSel.b = c.getAttribute('data-ld');
    _loPaintSel();
  });
  document.addEventListener('mouseup', function(e){
    if (!_loSel) return;
    const sel = _loSel; _loSel = null; _loClearSel();
    const from = sel.a <= sel.b ? sel.a : sel.b;
    const to   = sel.a <= sel.b ? sel.b : sel.a;
    /* 🅿 v2.40.0（ゆうた指定 2026-08-31）**いきなり貸出の窓を開かない。**
       その手前に「仮押さえ」「予約以外で代車を貸出」の2択を1回だけ出す。
       ⚠ 貸出の側は中身も見た目も今までのまま（loAddManualBlock を素通しで呼ぶ）。 */
    if (e && e.clientX != null) _loPopXY = { x: e.clientX, y: e.clientY };
    if (window.loPickFree) loPickFree(sel.lo, from, to);
    else if (window.loAddManualBlock) loAddManualBlock({ loId: sel.lo, from: from, to: to });
  });

  // v0.99.17 左の日付＝ドラッグで範囲／1日クリックで1日選択（同じ1日を再クリックで解除）
  grid.addEventListener('mousedown', function(e){
    const d = e.target.closest('.lo-date[data-ld]');
    if (!d) return;
    e.preventDefault();
    _loDatePrev = _loDateRange;   // この操作前の確定範囲を控える
    _loDateSel = { a: d.getAttribute('data-ld'), b: d.getAttribute('data-ld') };
    _loPaintRange(_loDateSel.a, _loDateSel.a);
  });
  grid.addEventListener('mousemove', function(e){
    if (!_loDateSel) return;
    const d = e.target.closest('.lo-date[data-ld]');
    if (!d) return;
    _loDateSel.b = d.getAttribute('data-ld');
    const lo = _loDateSel.a <= _loDateSel.b ? _loDateSel.a : _loDateSel.b;
    const hi = _loDateSel.a <= _loDateSel.b ? _loDateSel.b : _loDateSel.a;
    _loPaintRange(lo, hi);
  });
  document.addEventListener('mouseup', function(){
    if (!_loDateSel) return;
    const lo = _loDateSel.a <= _loDateSel.b ? _loDateSel.a : _loDateSel.b;
    const hi = _loDateSel.a <= _loDateSel.b ? _loDateSel.b : _loDateSel.a;
    _loDateSel = null;
    const single = lo === hi;
    if (single && _loDatePrev && _loDatePrev.lo === lo && _loDatePrev.hi === hi){
      _loDateRange = null; _loClearDateSel();   // 同じ1日を再クリック＝解除
    } else {
      _loDateRange = { lo: lo, hi: hi }; _loPaintRange(lo, hi);   // 範囲 or 1日 を選択
    }
  });
}
let _loDateSel = null, _loDateRange = null, _loDatePrev = null;
function _loPaintRange(lo, hi){
  _loClearDateSel();
  document.querySelectorAll('#loaner-grid [data-ld]').forEach(function(el){
    const ld = el.getAttribute('data-ld');
    if (ld >= lo && ld <= hi) el.classList.add('lo-row-hl');
  });
}
function _loClearDateSel(){ document.querySelectorAll('#loaner-grid .lo-row-hl').forEach(function(el){ el.classList.remove('lo-row-hl'); }); }
let _loSel = null;
function _loPaintSel(){
  _loClearSel();
  if (!_loSel) return;
  const from = _loSel.a <= _loSel.b ? _loSel.a : _loSel.b;
  const to   = _loSel.a <= _loSel.b ? _loSel.b : _loSel.a;
  document.querySelectorAll('.lo-free[data-lo="' + _loSel.lo + '"]').forEach(function(el){
    const d = el.getAttribute('data-ld');
    if (d >= from && d <= to) el.classList.add('lo-selecting');
  });
}
function _loClearSel(){ document.querySelectorAll('.lo-selecting').forEach(function(el){ el.classList.remove('lo-selecting'); }); }

/* ===== ドラッグ中のゴーストプレビュー ===== */
let _loPrevKey = null;

function loPreview(lo, date){
  loClearPreview();
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === _loDragAid; });
  if (!a || !date) return;
  let targetLo, from, to;
  if (_loDragMode === 'resize'){
    targetLo = a.loanerId;
    from = a.fromDate;
    to = (date < a.fromDate) ? a.fromDate : date;
  } else {
    targetLo = lo;
    from = date;
    const dur = Math.round((_loPd(a.toDate) - _loPd(a.fromDate)) / 86400000);
    to = ymd(addDays(_loPd(date), dur));
  }
  let d = _loPd(from);
  while (ymd(d) <= to){
    const ds = ymd(d);
    const el = document.querySelector('[data-lo="' + targetLo + '"][data-ld="' + ds + '"]');
    if (el){
      /* 🧩 v2.42.0 ここも部品ごしに。**答えは前と同じ**
         （noEvents＝代車自身の予定では赤くしない。前からそうだった）。
         ⏭ 車検入庫の上にも赤を出すかは別の話。変えるなら見張りを足してから。 */
      const conflict = pitLoanerDay(targetLo, ds, { ignoreAssignId:_loDragAid, noEvents:true }).busy;
      el.classList.add(conflict ? 'lo-prev-bad' : 'lo-prev');
    }
    d = addDays(d, 1);
  }
}

function loClearPreview(){
  document.querySelectorAll('.lo-prev, .lo-prev-bad').forEach(function(el){
    el.classList.remove('lo-prev'); el.classList.remove('lo-prev-bad');
  });
}

// 期間中、移動先の別予約とぶつかる日数
function loConflictDays(loanerId, from, to, exceptAid){
  let n = 0, d = _loPd(from);
  while (ymd(d) <= to){
    const ds = ymd(d);
    /* 🧩 v2.42.0 部品ごしに（答えは前と同じ） */
    if (pitLoanerDay(loanerId, ds, { ignoreAssignId:exceptAid, noEvents:true }).busy) n++;
    d = addDays(d, 1);
  }
  return n;
}

function _loRefresh(){
  const wrap = document.getElementById('loaner-scroll');
  const st = wrap ? wrap.scrollTop : 0, sl = wrap ? wrap.scrollLeft : 0;
  loRebuild(Math.max(42, _loCount));
  if (wrap){ wrap.scrollTop = st; wrap.scrollLeft = sl; }
  _loRenderDraftBar();
}

/* バッジのドラッグ＝期間まるごと移動。動かした瞬間に下書きへ（保存しない・重複は赤で警告） */
function loMoveAssignTo(aid, destLo, destDate){
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === aid; });
  if (!a || !destLo || !destDate) return;
  const dur = Math.round((_loPd(a.toDate) - _loPd(a.fromDate)) / 86400000);
  const newFrom = destDate;
  const newTo = ymd(addDays(_loPd(destDate), dur));
  if (a.loanerId === destLo && a.fromDate === newFrom) return;
  _loStartDraft();
  a.loanerId = destLo; a.fromDate = newFrom; a.toDate = newTo;   // 下書きに反映のみ（確定は一括実行）
  _loRefresh();
}

/* ▼のドラッグ＝返却日の伸縮。これも下書きへ。 */
function loResizeAssign(aid, destDate){
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === aid; });
  if (!a || !destDate) return;
  let newTo = destDate;
  if (newTo < a.fromDate) newTo = a.fromDate;
  if (newTo === a.toDate) return;
  _loStartDraft();
  a.toDate = newTo;
  _loRefresh();
}

/* 🔴 v1.143.0 直前の「代車キャンセル」の控え（画面の中だけ・持ち越さない）。下のバーと loCancelLoaner が使う */
let _loCancelSnap = null;

/* ===== 下書きバー（変更件数＋変更チップ＋破棄/やり直し/一括実行） ===== */
function _loRenderDraftBar(){
  const host = document.getElementById('lo-draft-bar');
  if (!host) return;
  const changed = _loChangedList();
  if (!_loDraftOrig || !changed.length){
    /* 下書きなし＝バー非表示（やり直しボタンだけ applySnap があれば残す）
       🔴 v1.143.0 直前の「代車キャンセル」も同じ場所に「↩ 元に戻す」を出す。
       ⚠ **入口を作ったら出口も作る**＝消しっぱなしにしない。1回だけ・画面を離れたら消える。 */
    let bar = '';
    if (_loApplySnap) bar += '<div class="lod-inner"><span class="lod-lbl">直前の一括実行：</span><button class="lod-btn warn" onclick="loDraftUndoApply()">↩ やり直す</button></div>';
    if (_loCancelSnap) bar += '<div class="lod-inner"><span class="lod-lbl">直前の代車キャンセル：</span><button class="lod-btn warn" onclick="loCancelUndo()">↩ 元に戻す</button></div>';
    host.innerHTML = bar;
    host.style.display = bar ? 'block' : 'none';
    return;
  }
  const bad = _loNewBad();
  const chips = changed.map(function(a){
    const o = _loDraftOrig[a.id], ib = bad.has(a.id);
    return '<span class="lod-chip' + (ib?' bad':'') + '"><b>' + _loEsc(_loAssignLabel(a)) + '</b> '
      + _loName(o.loanerId) + ' ' + _loMD(o.fromDate) + '→' + _loName(a.loanerId) + ' ' + _loMD(a.fromDate) + '〜' + _loMD(a.toDate)
      + '<i onclick="loDraftUndoOne(\'' + a.id + '\')"><i data-ic=close data-ics=16></i></i></span>';
  }).join('');
  const hasBad = bad.size > 0;
  host.style.display = 'block';
  host.innerHTML = '<div class="lod-inner">'
    + '<span class="lod-lbl"><i data-ic=pencil data-ics=16></i> 下書き <b>' + changed.length + '件</b>' + (hasBad ? '<span class="lod-warn"> <i data-ic=warn data-ics=16></i> 重複あり</span>' : '') + '</span>'
    + '<div class="lod-chips">' + chips + '</div>'
    + '<button class="lod-btn" onclick="loDraftDiscard()">破棄</button>'
    + '<button class="lod-btn primary" ' + (hasBad ? 'disabled' : '') + ' onclick="loDraftApply()">' + (hasBad ? '<i data-ic=warn data-ics=16></i> 重複を直して' : '✓ 一括実行（' + changed.length + '）') + '</button>'
    + '</div>';
}
window.loDraftUndoOne = function(id){
  if (!_loDraftOrig) return;
  const o = _loDraftOrig[id], a = (state.loanerAssigns||[]).find(function(x){return x.id===id;});
  if (o && a){ a.loanerId=o.loanerId; a.fromDate=o.fromDate; a.toDate=o.toDate; }
  if (!_loChangedList().length) _loDraftClear(); else _loDraftSave();   // 全部戻ったら下書き解除
  _loRefresh();
};
/* 🔴 v1.80.0 未確定の下書きを持ったまま画面を離れる時に、1回だけ聞く。
   -------------------------------------------------------------------
   ⚠ 下書きは state に直接書かれている。よその画面の保存に巻き込まれると
      「動かしただけのつもり」が本当に変わる。だから**離れる前に決めてもらう**。
   ・反映する … そのまま一括実行（重複があると実行できないので、その時は残る）
   ・破棄する … 元に戻して離れる
   ・ここに残る … 何もしない
   戻り値 true ＝ 呼び出し側（showView）は**いったん止まる**（答えが返ってからやり直す）。 */
window.pitLoanerAskLeave = function(nextView){
  if (!_loDraftOrig) return false;
  const changed = _loChangedList();
  if (!changed.length) { _loDraftClear(); return false; }
  pitAsk('代車の下書きが ' + changed.length + ' 件あります', {
    detail: 'まだ反映していない変更が残っています。\n'
          + 'このまま他の画面へ移ると、あとで**気づかないうちに反映されてしまう**ことがあります。\n\n'
          + '・反映する … いまの下書きをそのまま確定します\n'
          + '・破棄する … 動かす前の状態に戻します',
    ok: '反映する', cancel: '破棄する'
  }).then(function(yes){
    if (yes) {
      /* 反映は既存の道（重複チェック・確認つき）をそのまま通す＝写しを作らない */
      const before = _loChangedList().length;
      window.loDraftApply();
      /* 重複で止まった時は下書きが残る＝そのまま代車カレンダーに居てもらう */
      setTimeout(function(){
        if (!_loDraftOrig || !_loChangedList().length) showView(nextView);
      }, 50);
      if (before) return;
    } else {
      (state.loanerAssigns||[]).forEach(function(a){
        const o = _loDraftOrig && _loDraftOrig[a.id];
        if (o){ a.loanerId=o.loanerId; a.fromDate=o.fromDate; a.toDate=o.toDate; }
      });
      _loDraftClear();
      if (window.PitDB) PitDB.save();
      showView(nextView);
    }
  });
  return true;   /* いったん止める */
};

window.loDraftDiscard = function(){
  if (!_loDraftOrig || !_loChangedList().length) return;
  /* 🔵 v1.75.0 聞くのはアプリ内ダイアログ（pitAsk）＝答えは後から返る。 */
  pitAsk('下書き中の代車変更を全部破棄します。よろしいですか？', { danger:true, ok:'破棄する' }).then(function(yes){
    if (!yes) return;
    (state.loanerAssigns||[]).forEach(function(a){ const o=_loDraftOrig[a.id]; if(o){ a.loanerId=o.loanerId; a.fromDate=o.fromDate; a.toDate=o.toDate; } });
    _loDraftClear();
    if (window.PitDB) PitDB.save();   /* 🔴 戻した状態をちゃんと保存する（下書きが保存済みだった場合の巻き戻し） */
    _loRefresh();
  });
};
window.loDraftApply = function(){
  if (!_loDraftOrig) return;
  const changed = _loChangedList(); if (!changed.length) return;
  // ★今回の編集で「新しく」重複が発生した予約がある時だけ警告（元から重なっていた既存重複・無関係な重複ではブロックしない）。
  const bad = _loNewBad();
  const changedBad = changed.some(function(a){ return bad.has(a.id); });
  /* 🔵 v1.75.0 聞き方は2通りあるが、**続きは _go 1本**（写しを作らない）。 */
  const ask = changedBad
    ? pitAsk('それでもこのまま反映しますか？', { code:'PF-3020', title:'期間が重複します', danger:true, ok:'反映する',
              detail:'動かした代車の期間が、別の貸出と重複します。' })
    : pitAsk(changed.length + ' 件の代車変更をまとめて反映します。よろしいですか？', { ok:'反映する' });
  ask.then(function(yes){ if (yes) _go(); });

  function _go(){
  _loApplySnap = _loDraftOrig;   // 実行前の状態＝やり直し用
  // 紐づくカードの代車情報を同期
  changed.forEach(function(a){
    const card = a.cardId ? (state.cards||[]).find(function(c){return c.id===a.cardId;}) : null;
    if (card){ card.loanerId=a.loanerId; card.loanerFrom=a.fromDate; card.loanerTo=a.toDate; }
  });
  _loDraftClear();
  if (window.PitDB) PitDB.save();
  _loRefresh();
  pitAlert('反映しました（' + changed.length + '件）。直後なら「↩ やり直す」で実行前に戻せます。');
  }
};
window.loDraftUndoApply = function(){
  if (!_loApplySnap) return;
  pitAsk('直前の一括実行を取り消して、実行前の状態に戻します。よろしいですか？', { ok:'元に戻す' }).then(function(yes){
    if (!yes) return;
  (state.loanerAssigns||[]).forEach(function(a){ const o=_loApplySnap[a.id]; if(o){ a.loanerId=o.loanerId; a.fromDate=o.fromDate; a.toDate=o.toDate; const card=a.cardId?(state.cards||[]).find(function(c){return c.id===a.cardId;}):null; if(card){card.loanerId=a.loanerId;card.loanerFrom=a.fromDate;card.loanerTo=a.toDate;} } });
  _loApplySnap = null;
  if (window.PitDB) PitDB.save();
  _loRefresh();
  });
};

/* ===== v0.99.0 代車バッジ クリック＝操作メニュー（当日ビュー式：詳細/返却確定/代車キャンセル） ===== */
function _loBadgePopClose(){ const p = document.getElementById('lo-bpop'); if (p) p.remove(); document.removeEventListener('mousedown', _loBadgePopOutside, true); }
function _loBadgePopOutside(e){ const p = document.getElementById('lo-bpop'); if (p && !p.contains(e.target)) _loBadgePopClose(); }
let _loPopXY = null;   // 直近クリック座標（ポップアップをそこに出す）
function _loBadgePopOpen(html){
  _loBadgePopClose();
  const p = document.createElement('div'); p.id = 'lo-bpop'; p.className = 'lo-bpop'; p.innerHTML = html;
  document.body.appendChild(p);
  const w = 224, vw = document.documentElement.clientWidth;
  const xy = _loPopXY || { x: vw/2, y: 120 };
  let left = xy.x; if (left + w > vw - 8) left = vw - w - 8;
  const ph = p.offsetHeight || 180;
  let top = xy.y + 10; if (top + ph > window.innerHeight - 8) top = Math.max(8, xy.y - ph - 10);
  p.style.left = Math.max(8, left) + 'px'; p.style.top = top + 'px';
  setTimeout(function(){ document.addEventListener('mousedown', _loBadgePopOutside, true); }, 0);
}
/* 🔴 v1.80.0 二重貸しの「2」を押した時＝何と何が重なっているかを出す。
   ⚠ ここは知らせるだけ。**勝手に直さない**（どちらを動かすかは人が決める）。 */
window.loShowDup = function(loanerId, ds){
  const lo = (state.loaners || []).find(function(l){ return l.id === loanerId; });
  /* 🧩 v2.42.0 部品ごしに。仮押さえは kind で分かれるので、ここで !x.hold を書かなくてよくなった */
  const list = pitLoanerDay(loanerId, ds).lends.map(function(x){ return x.assign; })
               .filter(function(x){ return _loEffStart(x) <= ds; });
  const name = lo ? (window.pitVehLabel ? pitVehLabel(lo) : (lo.name || '代車')) : '代車';
  pitAlert(_loMD(ds) + ' は貸出が ' + list.length + ' 件重なっています', {
    detail: name + '\n\n' + _loConflictMsg(list)
          + '\n\nどちらかの期間をずらすか、別の代車に替えてください。'
          + '\n（札をドラッグ → 下の「一括実行」で反映します）',
    ok: '分かりました'
  });
};

window.loBadgeMenu = function(ev, aid){
  if (ev){ ev.stopPropagation(); ev.preventDefault(); if (ev.clientX != null) _loPopXY = { x: ev.clientX, y: ev.clientY }; }
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === aid; });
  if (!a) return;
  loInfoHide();
  const card = a.cardId ? (state.cards || []).find(function(c){ return c.id === a.cardId; }) : null;
  const nm = card ? ((window.pitCustSurname ? pitCustSurname(card) : (card.customer || '')) || '予約') : (a.customer || '貸出');
  const carTxt = card ? (card.car || '') : (a.car || '');
  const ret = !!a.returned;
  let h = '<div class="lo-bpop-h">' + _loEsc(nm) + ' 様' + (carTxt ? ' <small>' + _loEsc(carTxt) + '</small>' : '') + (ret ? ' <small>（返却済）</small>' : '') + '</div>';
  if (card) h += '<button class="lo-bpop-b" onclick="loBadgeDetail(\'' + aid + '\')"><i data-ic=clipboard data-ics=16></i> 予約詳細を見る</button>';
  if (!ret) h += '<button class="lo-bpop-b" onclick="loReturnStart(\'' + aid + '\')"><i data-ic=check data-ics=16></i> 返却を確定する</button>';
  else h += '<button class="lo-bpop-b" onclick="loUnreturn(\'' + aid + '\')">↩ 返却を取り消す</button>';
  /* 🔴 v1.143.0（ゆうた指定 2026-08-19）**返却済み（グレー）の貸出には出さない。**
     🗣「アーカイブと同じで、返却済みの代車は何がなんでも不可侵的に残すイメージ」
     ⚠ v1.142.0 まではここが `ret` の分岐の**外**にあり、返却済みの札からも押せた。
        押すと**いつ誰にどの代車を貸したかの記録が丸ごと消えていた。**
     ⚠ ボタンを消すだけにしない＝`loCancelLoaner` の中でも同じ条件で止めている。 */
  if (!ret) h += '<button class="lo-bpop-b danger" onclick="loCancelLoaner(\'' + aid + '\')"><i data-ic=ban data-ics=16></i> この予約の代車をキャンセル</button>';
  _loBadgePopOpen(h);
};
/* 省スペース表示のホバー＝代車カレンダーのフルサイズ札（3行カード）をそのまま上に重ねて表示 */
window.loInfoHover = function(el, aid){
  if (!el || !el.classList.contains('mini')) return;   // 省スペース(1〜2日)だけ
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === aid; }); if (!a) return;
  const card = a.cardId ? (state.cards || []).find(function(c){ return c.id === a.cardId; }) : null;
  const nm = card ? ((window.pitCustSurname ? pitCustSurname(card) : (card.customer || '')) || '予約') : (a.customer || '貸出');
  const car = card ? (card.car || '') : (a.car || '');
  const memo = card ? (card.loanerOther || '') : (a.purpose || '');
  const fixed = !!(card && card.loanerFixed);
  const isKari = !!(card && card.tentative);   // 仮予約 v0.100.4
  const _apr = (window.pitApprovalBadge && card) ? pitApprovalBadge(card, 'lo') : '';   // 🔵 v1.74.0 承認待ち
  const teamColor = _loTeamColor(a);
  let p = document.getElementById('lo-info'); if (!p){ p = document.createElement('div'); p.id = 'lo-info'; document.body.appendChild(p); }
  p.className = 'lo-info lo-badge full' + (isKari ? ' lo-kari' : '');   // フルサイズ札と同じ見た目
  p.style.setProperty('--lo-team', teamColor);
  p.style.background = teamColor;
  /* 🔴 v1.83.0（ゆうた指定）**終わった貸出は「〇/〇〜〇/〇」も出す。**
     ⚠ 札は狭くて読み取りづらいので、ホバーで期間をはっきり見せる。
     ⚠ 期間の書き方は loaner-free.js の物差しを借りる（ここで組み立てない）。 */
  const perTxt = (a.fromDate && a.toDate)
    ? (window.pitLoanerMD ? (a.toDate !== a.fromDate ? (pitLoanerMD(a.fromDate) + '〜' + pitLoanerMD(a.toDate)) : pitLoanerMD(a.fromDate)) : '')
    : '';
  const retTxt = a.returned ? ('返却済' + (perTxt ? '　' + perTxt : '')) : perTxt;
  p.innerHTML = (isKari ? '<span class="kari-lo" title="仮予約">仮</span>' : _apr)
    + '<span class="lo-lbl full"><span class="lo-nm">' + _loEsc(nm) + ' 様</span>'
    + '<span class="lo-car2"><span class="lo-cartxt">' + _loEsc(car) + '</span>' + (fixed ? '<span class="lo-fix">固定</span>' : '') + '</span>'
    + (retTxt ? '<span class="lo-memo">' + _loEsc(retTxt) + '</span>' : '')
    + (memo ? '<span class="lo-memo">' + _loEsc(memo) + '</span>' : '') + '</span>';
  // ミニ札のあるセルにぴったり重ねる（フルサイズ札の位置＝left/right 4px）
  const cell = el.closest('.lo-cell') || el;
  const r = cell.getBoundingClientRect(); const vw = document.documentElement.clientWidth;
  let left = r.left + 4; const w = r.width - 8;
  if (left + w > vw - 8) left = vw - w - 8;
  p.style.left = Math.max(8, left) + 'px'; p.style.top = (r.top + 2) + 'px'; p.style.width = w + 'px';
};
window.loInfoHide = function(){ const p = document.getElementById('lo-info'); if (p) p.remove(); };
window.loUnreturn = function(aid){
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === aid; });
  if (!a) { _loBadgePopClose(); return; }
  a.returned = false; delete a.returnedAt;
  /* 🔴 v1.81.0 自動で付けた返却を取り消す時は、**縮めた（伸ばした）期間も元に戻す**。
     ⚠ 戻さないと「取り消したのに枠が短いまま」になり、貸せるはずの日が消える。 */
  if (a.autoReturned && a.toDateBefore){ a.toDate = a.toDateBefore; }
  delete a.autoReturned; delete a.toDateBefore;
  const card = a.cardId ? (state.cards || []).find(function(c){ return c.id === a.cardId; }) : null;
  if (card){ card.loanerReturned = false; card.loanerTo = a.toDate; }
  if (window.PitDB) PitDB.save();
  _loBadgePopClose(); renderLoaner();
};
window.loBadgeDetail = function(aid){
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === aid; });
  _loBadgePopClose();
  if (a && a.cardId && window.openDetail) openDetail(a.cardId);
};
window.loReturnStart = function(aid){
  const today = ymd(new Date());
  const h = '<div class="lo-bpop-h">返却日を確定</div>'
    + '<label class="lo-bpop-f">返却日<input type="date" id="lo-ret-date" value="' + today + '"></label>'
    + '<div class="lo-bpop-note">返却した代車はアーカイブ（薄い色）になり、動かせなくなります（あとで取り消し可）。</div>'
    + '<div class="lo-bpop-foot"><button class="lo-bpop-b" onclick="loBadgeMenu(null,\'' + aid + '\')">← 戻る</button><button class="lo-bpop-b primary" onclick="loReturnConfirm(\'' + aid + '\')">確定する</button></div>';
  _loBadgePopOpen(h);
};
window.loReturnConfirm = function(aid){
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === aid; });
  if (!a) { _loBadgePopClose(); return; }
  const el = document.getElementById('lo-ret-date');
  const rd = el && el.value ? el.value : ymd(new Date());
  pitAsk('返却日 ' + rd + ' で確定します。よろしいですか？', { ok:'確定する' }).then(function(yes){
    if (!yes) return;
    a.returned = true; a.returnedAt = rd;
    delete a.autoReturned;              /* 🔴 v1.81.0 人が押したもの＝自動の印は外す（こちらが正） */
    if (rd < a.toDate) a.toDate = rd;   // 早く返ってきたらバーを実際の返却日まで縮める
    const card = a.cardId ? (state.cards || []).find(function(c){ return c.id === a.cardId; }) : null;
    if (card){ card.loanerTo = a.toDate; card.loanerReturned = true; }
    if (window.PitDB) PitDB.save();
    _loBadgePopClose(); renderLoaner();
  });
};
/* 🔴 v1.143.0（ゆうた指定 2026-08-19）代車のキャンセルを作り直した。

   🗣「アーカイブと同じで、**返却済みの代車（グレーになってる奴）は何がなんでも不可侵的に残す**イメージ。
   　　だからキャンセルは、**その予約に関する代車の貸し出しスケジュールだけを無くす**イメージでいい」
   🗣（「代車 必要」のチェックは？）「**チェックも外す**」

   ◎やること … ①カレンダーの予定を消す ②予約カードの代車の設定を空にする（必要のチェックも外す）
   ◎やらないこと … **返却済みの貸出には触らない。**そもそもメニューに出さない（`loBadgeMenu`）。

   ⚠ v1.142.0 までの問題（3つとも直した）
     1. 窓の説明が **「カレンダーから外します。」** だけ＝**カードの代車設定も消える**ことを言っていなかった
     2. **返却済みでも押せた**＝貸した記録が消えた（v1.80.0 の「返却済みは消さない」は自動の掃除にしか効いていなかった）
     3. **戻す道が無かった**（下書きの「1件戻す」はここを通らない）
   🔴 **入口を作ったら出口も作る**（カードの一生で決めた R3）＝直後1回だけ「↩ 元に戻す」で戻せるようにした。 */
window.loCancelLoaner = function(aid){
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === aid; });
  if (!a) { _loBadgePopClose(); return; }
  /* 🔴 返却済みは不可侵。ボタンを消すだけにせず、ここでも止める（外から呼ばれても通らない） */
  if (a.returned){
    _loBadgePopClose();
    pitAlert('返却済みの貸出は消せません。実際に貸した記録として残します。\n直したい時は「↩ 返却を取り消す」で戻してから操作してください。');
    return;
  }
  const card = a.cardId ? (state.cards || []).find(function(c){ return c.id === a.cardId; }) : null;
  const nm = card ? ((window.pitCustSurname ? pitCustSurname(card) : (card.customer || '')) || 'この予約') : (a.customer || 'この貸出');
  /* ⚠ 何が消えるかを**全部書く**。「外します」で済ませない。 */
  const detail = card
    ? 'カレンダーの予定と、予約カードの代車の設定（代車 必要のチェック・使用代車・貸出日・返却日）が消えます。\n直後なら「↩ 元に戻す」で戻せます。'
    : 'カレンダーからこの貸出を消します。\n直後なら「↩ 元に戻す」で戻せます。';
  pitAsk(nm + ' の代車をキャンセルしますか？', { danger:true, ok:'キャンセルする', detail:detail }).then(function(yes){
    if (!yes) return;
    /* 控えを取る（貸出1枚とカードの代車まわりだけ） */
    _loCancelSnap = {
      assign: JSON.parse(JSON.stringify(a)),
      cardId: card ? card.id : null,
      card: card ? { needLoaner: card.needLoaner, loanerId: card.loanerId, loanerFrom: card.loanerFrom,
                     loanerTo: card.loanerTo, loanerFixed: card.loanerFixed } : null
    };
    state.loanerAssigns = (state.loanerAssigns || []).filter(function(x){ return x.id !== aid; });
    if (card){ card.needLoaner = false; card.loanerId = ''; card.loanerFrom = ''; card.loanerTo = ''; card.loanerFixed = false; }
    if (window.PitDB) PitDB.save();
    _loBadgePopClose(); renderLoaner();
    _loRenderDraftBar();   /* ⚠ renderLoaner だけでは下のバーが描き直されない＝「↩ 元に戻す」が出ない */
    if (window.pitToast) pitToast(nm + ' の代車をキャンセルしました。直後なら「↩ 元に戻す」で戻せます');
  });
};

/* 直前のキャンセルを取り消す。⚠ 1回だけ・画面を離れたら消える（下書きの「やり直す」と同じ考え方）。 */
window.loCancelUndo = function(){
  if (!_loCancelSnap) return;
  const sn = _loCancelSnap;
  pitAsk('直前のキャンセルを取り消して、代車を元に戻します。よろしいですか？', { ok:'元に戻す' }).then(function(yes){
    if (!yes) return;
    if (!Array.isArray(state.loanerAssigns)) state.loanerAssigns = [];
    if (!state.loanerAssigns.some(function(x){ return x && x.id === sn.assign.id; })) state.loanerAssigns.push(sn.assign);
    if (sn.cardId && sn.card){
      const c = (state.cards || []).find(function(x){ return x.id === sn.cardId; });
      if (c){ c.needLoaner = sn.card.needLoaner; c.loanerId = sn.card.loanerId; c.loanerFrom = sn.card.loanerFrom;
              c.loanerTo = sn.card.loanerTo; c.loanerFixed = sn.card.loanerFixed; }
    }
    _loCancelSnap = null;
    if (window.PitDB) PitDB.save();
    renderLoaner();
    _loRenderDraftBar();
    if (window.pitToast) pitToast('代車を元に戻しました');
  });
};
window.loCancelCanUndo = function(){ return !!_loCancelSnap; };

/* 🔴🔴 v1.154.0（ゆうた報告 2026-08-20）
   　「**予約をキャンセルした場合に代車の予定が同時にキャンセルにならない**」
   ------------------------------------------------------------------
   ◎なにが起きていたか
     予約をキャンセルしても（人が押した／来店なし／入庫日を過ぎて自動／カードを消去）、
     **代車カレンダーの予定だけが残り続けていた。**
     ＝ 来ない車のために代車が押さえられたまま＝**空いている代車が「貸せない」ように見える。**
     しかも予約カードはもう箱から消えているので、**誰も気づけないし、外す道もほぼ無い**
     （代車カレンダーの「この予約の代車をキャンセル」は、その札を見つけられた人しか押せない）。

   ◎🔴 ここが唯一の入口。どの道からも必ずここを通す
     ・予約キャンセル（人が押した）… `card-view.js` `cvCancelResv`
     ・キャンセル（来店なし）      … `today.js` `pitTodayCancel`
     ・入庫日を過ぎた自動の未入庫  … `overdue-pit.js` `pitAutoOverdue`
     ・カードの消去                … `card-view.js` `cvDeleteCard`
     🔴 **写しを作らない。** 新しくキャンセルの道を足す時も、ここを呼ぶこと。

   🔴 返却済みの貸出は不可侵（2026-08-19 の決めごと L1）
     すでに貸して返ってきた記録は**何があっても消さない**。
     ＝返却済みしか無いカードには **1文字も触らない**（カードの代車の設定も残す）。

   ⚠ 保存（`PitDB.save`）と画面の描き直しは**呼んだ側**でやる
      （キャンセルの処理の途中で二重に保存しないため）。

   戻り値 … { n: 外した件数, names: ['タント（5）（8/20〜8/22）', …], text: '画面に出す1行' } */
function _loActiveAssignsOf(cardId){
  if (!cardId) return [];
  return (state.loanerAssigns || []).filter(function(a){ return a && a.cardId === cardId && !a.returned; });
}
/* 見るだけ（窓に「何が消えるか」を書くため）。**ここでは何も変えない。** */
window.pitLoanerPlanOf = function(cardId){
  var list = _loActiveAssignsOf(cardId);
  var md = window.pitLoanerMD;
  var names = list.map(function(a){
    var nm = _loName(a.loanerId);
    var span = md ? ((a.toDate && a.toDate !== a.fromDate) ? (md(a.fromDate) + '〜' + md(a.toDate)) : md(a.fromDate)) : '';
    return nm + (span ? '（' + span + '）' : '');
  });
  return { n: list.length, names: names, text: names.join('／') };
};
/* 実際に外す。why＝理由の1行（フローと操作ログに残す） */
/* 🔴 v2.22.0 第3引数 opt.auto＝**アプリが勝手にやった時**は記録に人の名前を押さない
   （自動処理は「画面を開いた端末」で走るので、たまたま居た人の名前が残る＝濡れ衣） */
window.pitLoanerReleaseForCard = function(cardId, why, opt){
  var plan = pitLoanerPlanOf(cardId);
  if (!plan.n) return plan;                       /* 返却済みしか無い／もともと無い＝触らない */
  state.loanerAssigns = (state.loanerAssigns || []).filter(function(a){
    return !(a && a.cardId === cardId && !a.returned);
  });
  var card = (state.cards || []).find(function(c){ return c.id === cardId; });
  if (card){
    /* 🔴 カード側の設定も空にする＝`loCancelLoaner`（手で押す代車キャンセル）と**同じ答え**にする。
       ⚠ 片方だけ残すと「代車 必要なのにカレンダーに居ない」という食い違いができる。 */
    card.needLoaner = false; card.loanerId = ''; card.loanerFrom = ''; card.loanerTo = ''; card.loanerFixed = false;
    var _auto = !!(opt && opt.auto);
    var _txt = '代車の予定も一緒にキャンセル（' + plan.text + '）' + (why ? '＝' + why : '');
    if (_auto && window.logFlowAuto) logFlowAuto(card, _txt);
    else if (window.logFlow) logFlow(card, _txt);
  }
  if (window.pitLog) pitLog('代車の予定をキャンセル（予約のキャンセルに合わせて）',
    { cardId: cardId, kind: 'delete', auto: !!(opt && opt.auto),
      label: plan.text + (why ? ' / ' + why : '') });
  return plan;
};

/* ===== v0.98.0 予約以外の貸出ブロック／緊急車両追加（軽量モーダル） ===== */
function _loModalOpen(html){
  _loModalClose();
  const ov = document.createElement('div'); ov.id = 'lo-modal'; ov.className = 'lo-modal-ov';
  ov.innerHTML = '<div class="lo-modal-box">' + html + '</div>';
  ov.addEventListener('click', function(e){ if (e.target === ov) _loModalClose(); });
  document.body.appendChild(ov);
}
function _loModalClose(){ const m = document.getElementById('lo-modal'); if (m) m.remove(); }
window.loCloseModal = _loModalClose;

/* 期間重なり判定＋衝突する割当の一覧（貸出ポップアップの衝突警報用）
   🔴 v1.80.0 判定は loaner-free.js の1本に寄せた。
   ⚠ 以前ここだけ **当日かぶり（返却日＝次の貸出開始日）をぶつかり扱い**していて、
      同じことをしてもカレンダーのドラッグでは通り、この窓では怒られる、という食い違いがあった。 */
function _loConflictAssigns(loanerId, from, to, excludeAid){
  return window.pitLoanerConflicts(loanerId, from, to, { ignoreAssignId: excludeAid });
}
/* 期間にかかる「代車自身の予定」（車検入庫・点検など）＝貸出とは別に知らせる */
function _loConflictEvents(loanerId, from, to){
  return window.pitLoanerEventsIn(loanerId, from, to);
}
/* 代車自身の予定（車検入庫など）の並び＝窓に出す文字 */
function _loEventMsg(list){
  const lines = (list || []).slice(0, 3).map(function(e){
    const t = (typeof FL_EVT_TYPES !== 'undefined' ? FL_EVT_TYPES[e.type] : null) || { label:'予定' };
    return '・' + _loMD(e.fromDate) + '〜' + _loMD(e.toDate) + '　' + (e.label || t.label);
  });
  return lines.join('\n') + (list.length > 3 ? ('\n…他 ' + (list.length - 3) + ' 件') : '');
}
function _loConflictMsg(list){
  const lines = list.slice(0, 3).map(function(a){
    /* 🅿 v2.40.0 仮押さえは「誰に貸したか」が無いので、メモをそのまま出す */
    if (a.hold) return '・' + _loMD(a.fromDate) + '〜' + _loMD(a.toDate) + '　仮押さえ' + (a.memo ? '（' + a.memo + '）' : '');
    const card = a.cardId ? (state.cards || []).find(function(c){ return c.id === a.cardId; }) : null;
    const nm = card ? ((window.pitCustSurname ? pitCustSurname(card) : (card.customer || '')) || '予約') : (a.customer || '貸出');
    return '・' + _loMD(a.fromDate) + '〜' + _loMD(a.toDate) + '　' + nm + (a.purpose ? '（' + a.purpose + '）' : (card ? ' 様' : ''));
  });
  return lines.join('\n') + (list.length > 3 ? ('\n…他 ' + (list.length - 3) + ' 件') : '');
}

/* 🚗 予約以外で代車を貸出（車販の乗り換え等）＝整備予約に出さず代車カレンダーだけ埋める */
window.loAddManualBlock = function(prefill){
  prefill = prefill || {};
  const today = ymd(new Date());
  const from0 = prefill.from || today, to0 = prefill.to || today;
  const opts = _loFiltered().filter(function(l){ return !l.emergency; })
    .map(function(l){ const sel = (prefill.loId && l.id === prefill.loId) ? ' selected' : ''; return '<option value="' + l.id + '"' + sel + '>' + _loEsc((String(l.name||'').replace('代車','')) + ' ' + (l.model||'')) + '</option>'; }).join('');
  _loModalOpen(
    '<h3 class="lo-modal-h"><i data-ic=car data-ics=16></i> 予約以外で代車を貸出</h3>'
    + '<label class="lo-modal-f">代車<select id="lmb-lo">' + opts + '</select></label>'
    + '<label class="lo-modal-f">用途<select id="lmb-pp"><option>車販・乗り換え</option><option>代車（整備外）</option><option>その他</option></select></label>'
    + '<label class="lo-modal-f">お客様名<input id="lmb-cust" placeholder="例：小林"></label>'
    /* 🔴 v1.80.0 車種の入力欄を足した。
       ⚠ 札を出す側は前から車種を出そうとしていたのに、入れる場所が無く**必ず空**だった。 */
    + '<label class="lo-modal-f">お客様の車（任意）<input id="lmb-car" placeholder="例：アクア"></label>'
    + '<div class="lo-modal-row"><label class="lo-modal-f">から<input type="date" id="lmb-from" value="' + from0 + '"></label><label class="lo-modal-f">まで<input type="date" id="lmb-to" value="' + to0 + '"></label></div>'
    + '<div class="lo-modal-foot"><button onclick="loCloseModal()">キャンセル</button><button class="primary" onclick="loSaveManualBlock()">登録</button></div>'
  );
};
window.loSaveManualBlock = function(){
  const g = function(id){ const e = document.getElementById(id); return e ? e.value : ''; };
  const lo = g('lmb-lo'), pp = g('lmb-pp'), cust = g('lmb-cust').trim(), car = g('lmb-car').trim(), from = g('lmb-from'), to = g('lmb-to');
  if (!lo || !from || !to){ pitAlert('代車と期間を入れてください', { code:'PF-3001' }); return; }
  if (to < from){ pitAlert('「まで」は「から」以降にしてください', { code:'PF-3002' }); return; }
  const conf = _loConflictAssigns(lo, from, to);
  /* 🔴 v1.80.0 **代車自身の予定（車検入庫・点検）とぶつかっていないかも見る。**
     ⚠ 以前は貸出しか見ておらず、車検に出す予定の代車をそのまま貸せてしまった。 */
  const evs = _loConflictEvents(lo, from, to);
  /* 🔵 v1.75.0 重複した時だけ聞く。**続きは _go 1本**（聞く道と聞かない道で写しを作らない）。 */
  if (conf.length || evs.length){
    const parts = [];
    if (conf.length) parts.push('すでに他の貸出・予約と重複します：\n' + _loConflictMsg(conf));
    if (evs.length)  parts.push('この代車自身の予定と重なります：\n' + _loEventMsg(evs));
    pitAsk('それでも登録しますか？', { code:'PF-3003', title:'期間が重複します', danger:true, ok:'登録する',
            detail:'この代車は選んだ期間、\n\n' + parts.join('\n\n') })
      .then(function(yes){ if (yes) _go(); });
    return;
  }
  _go();
  function _go(){
  state.loanerAssigns = state.loanerAssigns || [];
  state.loanerAssigns.push({ id:'la'+Date.now().toString(36), loanerId:lo, cardId:null, customer:(cust||'(貸出)'), car:car, purpose:pp, fromDate:from, toDate:to, manual:true });
  if (window.PitDB) PitDB.save();
  _loModalClose(); renderLoaner();
  }
};



/* ===== ❔ 簡易マニュアル（v2.41.0・ゆうた指定 2026-08-31） =====
   🗣「ここ操作が結構複雑だから簡易的マニュアルポップみたいなものをつくりたい。〇？があってクリックすると展開」
   🔴 **いちばん厚く書くのは「下書きと一括実行」**＝押しても他の人に見えない、が一番聞かれる所。
   ⚠ ここに新しい決めごとを書かない。**いま動いているとおりのことだけ**書く
      （書いた通りに動いていない、が起きると、マニュアルの方が嘘になって誰も見なくなる）。 */
window.loHelp = function(){
  loHelpClose();
  const sw = function(css){ return '<span class="lo-help-sw" style="' + css + '"></span>'; };
  const hatch = function(rgb){ return 'background:repeating-linear-gradient(135deg,rgba(' + rgb + ',.5) 0 5px,rgba(' + rgb + ',.12) 5px 10px)'; };
  const ov = document.createElement('div');
  ov.id = 'lo-help'; ov.className = 'lo-help-ov';
  ov.innerHTML = '<div class="lo-help-box">'
    + '<button class="lo-help-x" onclick="loHelpClose()">×</button>'
    + '<h3>代車カレンダーの使い方</h3>'
    + '<p style="font-size:11px;color:var(--text3);margin:0">上の「？」からいつでも開けます</p>'
    + '<h5>色の見方</h5><div class="lo-help-lg">'
    /* ⚠ 国産の緑・輸入のピンクは**書き写さない**（pit-share.js の pitTeamColor が唯一の正）。
       ここに直書きすると「同じ車なのに画面ごとに色が違う」が始まる。 */
    + '<div>' + sw('background:' + (window.pitTeamColor ? pitTeamColor('default') : 'var(--brand)')) + '予約の貸出（国産）</div>'
    + '<div>' + sw('background:' + (window.pitTeamColor ? pitTeamColor('import') : 'var(--brand)')) + '予約の貸出（輸入）</div>'
    + '<div>' + sw('background:#3b82f6') + '予約以外の貸出</div>'
    + '<div>' + sw(hatch('116,152,200')) + '🅿 仮押さえ</div>'
    + '<div>' + sw('background:#5b6675') + '返却済み</div>'
    + '<div>' + sw('background:#ef4444') + '緊急車両</div>'
    /* 🔧 v2.70.0 この代車自身の整備予定。**縦バーだけは色の意味が別**（貸出ではない）ので、必ずここに書く。 */
    + '<div>' + sw('background:var(--pit-maint,#d6a846);width:8px') + '🔧 整備（確定）＝この期間は押さえています</div>'
    + '<div>' + sw('background:color-mix(in srgb,var(--pit-maint,#d6a846) 45%,transparent);width:8px') + '🔧 整備（予定）＝<b>まだ貸せます</b></div>'
    + '<div>' + sw('background:rgba(148,163,184,.45);width:8px') + '🔧 整備（済）＝終わったもの</div>'
    + '</div>'
    + '<h5>さわり方</h5><div class="lo-help-kv">'
    + '<b>空きを押す／なぞる</b><span>「仮押さえ」か「予約以外で貸出」を選ぶ</span>'
    + '<b>札を押す</b><span>予約詳細・返却の確定・この予約の代車をキャンセル</span>'
    + '<b>札をつかんで動かす</b><span>別の代車・別の日へ移す（<b>下書き</b>。まだ誰にも見えません）</span>'
    + '<b>札の下の ▼ を下へ引く</b><span>返す日を伸ばす（これも下書き）</span>'
    + '<b>画面の下のバー</b><span>動かした分をまとめて「反映」か「破棄」。<b>反映するまでクラウドに上がりません</b></span>'
    + '<b>網掛けを押す</b><span>仮押さえのメモを読む／解除する</span>'
    + '<b>左の日付をなぞる</b><span>その期間の行を目立たせる（見比べ用）</span>'
    + '<b>上の検索</b><span>代車の車種・番号なら<b>列を絞る</b>／お客様名・メモなら<b>札を緑で囲う</b></span>'
    + '<b>上のスライダー</b><span>カレンダーの縮尺。<b>端末に覚えます</b></span>'
    + '</div>'
    + '<h5>覚えておくと早い</h5><ul>'
    + '<li>返す日と、次の人が借りる日が<b>同じ日</b>なのは、ぶつかり扱いになりません（その日のうちに受け渡す前提）</li>'
    + '<li>赤い「2」＝<b>二重貸し</b>。押すと何と重なっているか出ます。どちらかをずらしてください</li>'
    + '<li>灰色＝返却済み。<b>消せません</b>（貸した記録として残す決まり）</li>'
    + '<li>緊急車両はいちばん左の列。返車が済むと列ごと消えます（記録は残ります）</li>'
    + '<li>引退した代車は列に出ません。過去の貸出・履歴は残っています</li>'
    + '<li>🔧 左の<b>太い縦バー</b>＝この代車自身の整備。<b>確定は貸せません／予定はまだ貸せます</b>。'
    + 'カーソルを乗せると中身が出ます（<b>前は何も出ていないのに警告だけ出て</b>いた所です）</li>'
    + '<li>🔧 整備の札や車検入庫の札は<b>この画面では押せません</b>。押した先はマスに通るので、'
    + '<b>空きマス・仮押さえと同じ動き</b>になります。直すのは<b>車両管理の作業予定ボード</b>から</li>'
    + '</ul></div>';
  ov.addEventListener('click', function(e){ if (e.target === ov) loHelpClose(); });
  document.body.appendChild(ov);
};
window.loHelpClose = function(){ const el = document.getElementById('lo-help'); if (el) el.remove(); };

/* ===========================================================
   🅿 仮押さえ（v2.40.0・ゆうた指定 2026-08-31）
   -----------------------------------------------------------
   🗣「予定が入っていないところをクリックorドラッグすると、予約以外での貸し出しが入れられる。
   　　これを一段階層下げて、その手前にポップアップの選択肢を追加。
   　　『仮押さえ』『予約以外で代車を貸出』でメニュー化。貸出の方は既存のまま、仮押さえの方が新設。
   　　簡単な一言メモをそえて埋めるだけ。カレンダー自体を色付きの網掛けにして、
   　　新規予約などからその部分は埋まっているのと同義で扱ってほしい。
   　　一言メモがカレンダーから直接見れて、クリック→解除→でなくなる」

   🔴🔴 置き場所＝**貸出（loanerAssigns）と同じ箱に `hold:true` で入れる。新しい箱は作らない。**
      箱を増やすと「空いているか」の物差し（loaner-free.js）と読み込み（db-pit.js の7つ）を
      両方いじることになり、宿題の「開くたびに全件を2回読む」をさらに重くする。
      同じ箱なら **pitLoanerBusyOn / pitLoanerConflicts が何も直さなくても仮押さえを「埋まり」に数える**
      ＝新規予約・最短入庫日・空きカレンダーから、そのまま埋まって見える（ゆうた指定のとおり）。

   🔴 そのかわり「**貸出として数えてはいけない所**」だけを名指しで外してある：
      ・カレンダーの札（.lo-badge）／二重貸しの赤／当日かぶりの耳（このファイル）
      ・車両管理の貸出回数・貸出履歴（fleet.js）
      ・データチェックの「代車のダブり」（inspect-rules.js の L02）
      ⚠ ここを増やす時は**この一覧も増やすこと。**忘れると「仮押さえが貸出1件として数えられる」形で出る。

   ⚠ 仮押さえは**ドラッグで動かせない**（札を出していないので掴む所が無い）。直すのは窓から。
   =========================================================== */

/* 空きをクリック／ドラッグし終えた所で出す2択 */
window.loPickFree = function(loId, from, to){
  const per = (from === to) ? _loMD(from) : (_loMD(from) + '〜' + _loMD(to));
  _loBadgePopOpen(
    '<div class="lo-bpop-h">' + _loEsc(_loName(loId)) + ' <small>' + per + '</small></div>'
    + '<button class="lo-bpop-b" onclick="loHoldFromPick(\'' + loId + '\',\'' + from + '\',\'' + to + '\')"><span class="lo-hold-k">仮</span> 仮押さえ</button>'
    + '<button class="lo-bpop-b" onclick="loLendFromPick(\'' + loId + '\',\'' + from + '\',\'' + to + '\')"><i data-ic=car data-ics=16></i> 予約以外で代車を貸出</button>'
    + '<div class="lo-bpop-note">仮押さえ＝お客様の登録はせず、ひとことメモだけで枠を押さえます。</div>'
  );
};
window.loHoldFromPick = function(loId, from, to){ _loBadgePopClose(); loAddHold({ loId:loId, from:from, to:to }); };
window.loLendFromPick = function(loId, from, to){ _loBadgePopClose(); loAddManualBlock({ loId:loId, from:from, to:to }); };

/* 仮押さえの窓（新規／直し 兼用）。prefill.id があれば直し */
window.loAddHold = function(prefill){
  prefill = prefill || {};
  const cur = prefill.id ? (state.loanerAssigns || []).find(function(x){ return x.id === prefill.id && x.hold; }) : null;
  const today = ymd(new Date());
  const from0 = (cur && cur.fromDate) || prefill.from || today;
  const to0   = (cur && cur.toDate)   || prefill.to   || today;
  const loId  = (cur && cur.loanerId) || prefill.loId || '';
  const memo0 = (cur && cur.memo) || '';
  const opts = _loFiltered().filter(function(l){ return !l.emergency; })
    .map(function(l){ const sel = (loId && l.id === loId) ? ' selected' : ''; return '<option value="' + l.id + '"' + sel + '>' + _loEsc((String(l.name||'').replace('代車','')) + ' ' + (l.model||'')) + '</option>'; }).join('');
  _loModalOpen(
    '<h3 class="lo-modal-h"><span class="lo-hold-k">仮</span> ' + (cur ? '仮押さえを直す' : '仮押さえ') + '</h3>'
    + '<label class="lo-modal-f">代車<select id="lhd-lo">' + opts + '</select></label>'
    + '<label class="lo-modal-f">ひとことメモ<input id="lhd-memo" maxlength="40" placeholder="例：田中様の車検で押さえ" value="' + _loEsc(memo0) + '"></label>'
    + '<div class="lo-modal-row"><label class="lo-modal-f">から<input type="date" id="lhd-from" value="' + from0 + '"></label><label class="lo-modal-f">まで<input type="date" id="lhd-to" value="' + to0 + '"></label></div>'
    + '<div class="lo-modal-note">この期間は、新規予約や最短入庫日からも<b>埋まっている</b>ものとして扱われます。お客様・車の登録はしません。</div>'
    + '<div class="lo-modal-foot"><button onclick="loCloseModal()">キャンセル</button><button class="primary" onclick="loSaveHold(\'' + (cur ? cur.id : '') + '\')">' + (cur ? '直す' : '押さえる') + '</button></div>'
  );
  setTimeout(function(){ const el = document.getElementById('lhd-memo'); if (el) el.focus(); }, 30);
};

window.loSaveHold = function(id){
  const g = function(k){ const el = document.getElementById(k); return el ? el.value : ''; };
  const lo = g('lhd-lo'), memo = String(g('lhd-memo') || '').trim(), from = g('lhd-from'), to = g('lhd-to');
  if (!lo || !from || !to){ pitAlert('代車と期間を入れてください', { code:'PF-3040' }); return; }
  if (to < from){ pitAlert('「まで」は「から」以降にしてください', { code:'PF-3041' }); return; }
  /* 🔴 メモは必須。あとで見た人が「なぜ押さえたか」分からない仮押さえは、誰も解除できずに残る。 */
  if (!memo){ pitAlert('ひとことメモを入れてください', { code:'PF-3042',
      detail:'あとで見た人が「なぜ押さえたか」分かるように、ひとことだけ入れてください。' }); return; }
  const conf = _loConflictAssigns(lo, from, to, id || undefined);
  const evs  = _loConflictEvents(lo, from, to);
  if (conf.length || evs.length){
    const parts = [];
    if (conf.length) parts.push('すでに他の貸出・仮押さえと重複します：\n' + _loConflictMsg(conf));
    if (evs.length)  parts.push('この代車自身の予定と重なります：\n' + _loEventMsg(evs));
    pitAsk('それでも押さえますか？', { code:'PF-3043', title:'期間が重複します', danger:true, ok:'押さえる',
            detail:'この代車は選んだ期間、\n\n' + parts.join('\n\n') })
      .then(function(yes){ if (yes) _go(); });
    return;
  }
  _go();
  function _go(){
    state.loanerAssigns = state.loanerAssigns || [];
    const a = id ? state.loanerAssigns.find(function(x){ return x.id === id && x.hold; }) : null;
    if (a){ a.loanerId = lo; a.memo = memo; a.purpose = memo; a.fromDate = from; a.toDate = to; }
    else {
      state.loanerAssigns.push({ id:'lh' + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
        loanerId:lo, cardId:null, hold:true, memo:memo,
        /* customer / purpose ＝古い画面（貸出として並べる所）でも空欄にならないための保険 */
        customer:'仮押さえ', purpose:memo,
        fromDate:from, toDate:to, manual:true, createdAt:new Date().toISOString() });
    }
    if (window.PitDB) PitDB.save();
    try { if (window.pitLog) pitLog(a ? '仮押さえを直した' : '仮押さえ', { kind:'loaner',
      label: _loName(lo) + ' ' + _loMD(from) + '〜' + _loMD(to) + '（' + memo + '）' }); } catch (e) {}
    _loModalClose(); renderLoaner();
  }
};

/* カレンダーの網掛け（またはメモの札）を押した時の窓 */
window.loHoldMenu = function(ev, id){
  if (ev){ ev.stopPropagation(); ev.preventDefault(); if (ev.clientX != null) _loPopXY = { x: ev.clientX, y: ev.clientY }; }
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === id && x.hold; });
  if (!a) return;
  loInfoHide();
  _loBadgePopOpen(
    '<div class="lo-bpop-h"><span class="lo-hold-k">仮</span> 仮押さえ <small>' + _loEsc(_loName(a.loanerId)) + '　' + _loMD(a.fromDate) + '〜' + _loMD(a.toDate) + '</small></div>'
    + '<div class="lo-bpop-note">' + _loEsc(a.memo || '（メモなし）') + '</div>'
    + '<button class="lo-bpop-b" onclick="loHoldEdit(\'' + id + '\')"><i data-ic=clipboard data-ics=16></i> メモ・期間を直す</button>'
    + '<button class="lo-bpop-b danger" onclick="loReleaseHold(\'' + id + '\')"><i data-ic=ban data-ics=16></i> 仮押さえを解除する</button>'
  );
};
window.loHoldEdit = function(id){ _loBadgePopClose(); loAddHold({ id:id }); };

/* 解除＝消すだけ。**確認は挟まない**（ゆうた指定「クリック→解除→でなくなる」）。
   ⚠ 貸出（loCancelLoaner）と違って、仮押さえは記録として残す値打ちが無いので消し切る。
      誰がいつ解除したかは操作ログ（pitLog）に残る。 */
window.loReleaseHold = function(id){
  const a = (state.loanerAssigns || []).find(function(x){ return x.id === id && x.hold; });
  if (!a) return;
  _loBadgePopClose();
  state.loanerAssigns = (state.loanerAssigns || []).filter(function(x){ return x.id !== id; });
  if (window.PitDB) PitDB.save();
  try { if (window.pitLog) pitLog('仮押さえを解除', { kind:'loaner',
    label: _loName(a.loanerId) + ' ' + _loMD(a.fromDate) + '〜' + _loMD(a.toDate) + '（' + (a.memo || '') + '）' }); } catch (e) {}
  renderLoaner();
};

/* 🚨 緊急車両を追加（社用車から選ぶ or 手入力）＝一番左に列・返車で消える（履歴は残す） */
window.loAddEmergency = function(){
  const today = ymd(new Date());
  const cc = (state.companyCars || []).map(function(c){ return '<option value="' + c.id + '">' + _loEsc((c.model||c.name||'社用車') + (c.plate?(' '+c.plate):'')) + '</option>'; }).join('');
  _loModalOpen(
    '<h3 class="lo-modal-h"><i data-ic=warn data-ics=16></i> 緊急車両を追加</h3>'
    + '<label class="lo-modal-f">車両<select id="lem-src" onchange="loEmgSrc()"><option value="">― 社用車から選ぶ ―</option>' + cc + '<option value="__manual__">＋ 手入力する</option></select></label>'
    + '<div id="lem-manual" style="display:none"><div class="lo-modal-row"><label class="lo-modal-f">車名<input id="lem-model" placeholder="例：ハイエース"></label><label class="lo-modal-f">ナンバー<input id="lem-plate" placeholder="例：野田 300 あ 12-34"></label></div></div>'
    + '<label class="lo-modal-f">お客様名<input id="lem-cust" placeholder="例：佐藤"></label>'
    + '<label class="lo-modal-f">理由<input id="lem-pp" value="緊急（クレーム対応）"></label>'
    + '<div class="lo-modal-row"><label class="lo-modal-f">から<input type="date" id="lem-from" value="' + today + '"></label><label class="lo-modal-f">まで<input type="date" id="lem-to" value="' + today + '"></label></div>'
    + '<div class="lo-modal-foot"><button onclick="loCloseModal()">キャンセル</button><button class="primary" onclick="loSaveEmergency()">追加</button></div>'
  );
};
window.loEmgSrc = function(){ const v = document.getElementById('lem-src').value; document.getElementById('lem-manual').style.display = (v === '__manual__') ? 'block' : 'none'; };
window.loSaveEmergency = function(){
  const g = function(id){ const e = document.getElementById(id); return e ? e.value : ''; };
  const src = g('lem-src'); let model = '', plate = '';
  if (src === '__manual__'){ model = g('lem-model').trim(); plate = g('lem-plate').trim(); if (!model){ pitAlert('車名を入れてください', { code:'PF-3010' }); return; } }
  else if (src){ const c = (state.companyCars || []).find(function(x){ return x.id === src; }); if (c){ model = c.model || c.name || '社用車'; plate = c.plate || ''; } }
  else { pitAlert('社用車を選ぶか「手入力する」を選んでください', { code:'PF-3011' }); return; }
  const cust = g('lem-cust').trim(), pp = (g('lem-pp').trim() || '緊急'), from = g('lem-from'), to = g('lem-to');
  if (!from || !to){ pitAlert('期間を入れてください', { code:'PF-3012' }); return; }
  if (to < from){ pitAlert('「まで」は「から」以降にしてください', { code:'PF-3013' }); return; }
  const srcId = (src && src !== '__manual__') ? src : '';
  // 同じ社用車(srcId) or 同じナンバーの車が、その期間すでに緊急で出ていないか衝突チェック
  const dupLo = (state.loaners || []).filter(function(l){ return l.emergency && ((srcId && l.srcId === srcId) || (plate && l.plate && l.plate === plate)); });
  let conf = [];
  dupLo.forEach(function(l){ conf = conf.concat(_loConflictAssigns(l.id, from, to)); });
  if (conf.length){
    pitAsk('それでも追加しますか？', { code:'PF-3014', title:'すでに緊急で出ています', danger:true, ok:'追加する',
            detail:'この車両（'+ _loEsc(model) + (plate ? ' / '+ _loEsc(plate) : '') + '）は選んだ期間、すでに緊急で出ています：\n\n' + _loConflictMsg(conf) })
      .then(function(yes){ if (yes) _go(); });
    return;
  }
  _go();
  function _go(){
  const lid = 'emg' + Date.now().toString(36);
  state.loaners = state.loaners || [];
  state.loaners.push({ id:lid, name:'緊急', model:model, plate:plate, srcId:srcId, emergency:true, category:'normal', etc:false, navi:false, iso:false });
  state.loanerAssigns = state.loanerAssigns || [];
  state.loanerAssigns.push({ id:'la'+Date.now().toString(36), loanerId:lid, cardId:null, customer:(cust||'(緊急)'), purpose:pp, fromDate:from, toDate:to, manual:true, emergency:true });
  if (window.PitDB) PitDB.save();
  _loModalClose(); renderLoaner();
  }
};

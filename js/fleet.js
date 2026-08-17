/* ========================================
   fleet.js  -  代車・自社車両管理／PitFlow v1.14.7
   ----------------------------------------
   ・月次カレンダー：1列1ヶ月。右へスクロールすると**未来永劫**列が増える。
   ・**月ヘッダをクリック → その月の日別（1〜31日）表示**に切替（← 月表示で戻る）。
   ・車検<i data-ic=dot data-ics=12 style=color:#ef4444></i>・12点<i data-ic=dot data-ics=12 style=color:#f97316></i>に加えて**自由イベント**（車検入庫・リースアップ/切替・その他）を登録できる。
     → 代車利用カレンダー（代車ビュー）にも重ねて表示される。
   ・セルをクリック＝その車両・その日付でイベント追加。イベントチップをクリック＝編集。
   ======================================== */
let _fleetEditId = null;
let _flMode = 'month';      // 'month' | 'day'
let _flMonths = 24;         // 月モードの列数（右スクロールで増殖）
let _flDay = null;          // 日モードの対象月（Date）

const FL_EVT_TYPES = {
  shakenIn: { label: '車検入庫',        color: '#ef4444' },
  tenken:   { label: '12ヶ月点検',      color: '#f59e0b' },
  lease:    { label: 'リースアップ/切替', color: '#a855f7' },
  other:    { label: 'その他',          color: '#3b82f6' }
};

function _fleetEsc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _flPd(s){ const p = String(s).split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function _flAllVehicles(){ return (state.loaners || []).concat(state.companyCars || []); }
/* v1.14.6：カレンダーの行を「代車」「社用車」に分けて、間に細い区切りを入れる */
function _flVehSections(){
  const out = [];
  if ((state.loaners || []).length)     out.push({ label: '代車',   arr: state.loaners });
  if ((state.companyCars || []).length) out.push({ label: '社用車', arr: state.companyCars });
  if (!out.length) out.push({ label: '代車', arr: [] });
  return out;
}
function _flSecRow(label){
  return '<div class="fl-cal-sec"><span>' + _fleetEsc(label) + '</span></div>';
}
function _flEvents(){ if (!Array.isArray(state.fleetEvents)) state.fleetEvents = []; return state.fleetEvents; }
function _flVehName(v){
  const f = _fleetFind(v && v.id);
  return (window.pitVehLabel ? pitVehLabel(v, f ? f.kind : 'loaner') : (v && v.name)) || (v && v.name) || '';
}
function _fleetFind(id){
  let v = (state.loaners || []).find(function(x){ return x.id === id; });
  if (v) return { v: v, kind: 'loaner' };
  v = (state.companyCars || []).find(function(x){ return x.id === id; });
  if (v) return { v: v, kind: 'company' };
  return null;
}

function renderFleet(){
  const wrap = document.getElementById('view-fleet-body');
  if (!wrap) return;
  if (!Array.isArray(state.companyCars)) state.companyCars = [];
  if (typeof _loEnsureOpts === 'function') _loEnsureOpts();   // 代車の装備オプション初期化（未設定分）
  _flEvents();
  try { pitRefreshAutoTenken(); } catch (e) { console.warn('[fleet] 点検の自動計算でエラー', e); }

  let h = '';

  /* ===== ① カレンダー（最上部） ===== */
  h += '<div class="fl-card">';
  if (_flMode === 'month'){
    h += '<div class="fl-h"><i data-ic=calendar data-ics=16></i> 車両カレンダー（月をクリック＝日別表示／右へ無限）<span class="fl-note"><i data-ic=dot data-ics=12 style=color:#ef4444></i>車検 <i data-ic=dot data-ics=12 style=color:#f97316></i>12点 ＋ イベント（セルをクリックで追加）</span></div>';
    h += flMonthCalHtml();
  } else {
    const y = _flDay.getFullYear(), m = _flDay.getMonth();
    h += '<div class="fl-h"><span><button class="vh-btn" onclick="flBackMonth()">← 月表示</button>　<i data-ic=calendar data-ics=16></i> ' + y + '年' + (m+1) + '月（日別）</span><span class="fl-note">セルをクリック＝イベント追加／チップ＝編集</span></div>';
    h += flDayCalHtml(y, m);
  }
  h += '</div>';

  /* ===== ② 車両リスト ===== */
  const groups = [
    { name: '<i data-ic=van data-ics=16></i> 代車', arr: state.loaners || [] },
    { name: '<i data-ic=van data-ics=16></i> 社用車', arr: state.companyCars || [] }
  ];
  groups.forEach(function(g, gi){
    h += '<div class="fl-card"><div class="fl-h">' + g.name + '（' + g.arr.length + '台）'
       + '</div>';   /* v1.14.3：「＋ 車両を追加」は画面上部にあるので、枠の中からは外した（ダブり） */
    if (!g.arr.length){ h += '<div class="fl-empty">登録なし</div>'; }
    h += '<div class="fl-rows">';
    g.arr.forEach(function(v){
      const _isLo = (gi === 0);
      const _ttl = _isLo ? (window.pitVehLabel ? pitVehLabel(v) : v.name) : v.name;
          const _no = (v.number != null && v.number !== '') ? String(v.number)
                : (_isLo ? String(v.name || '').replace(/[^0-9]/g, '') : '');
      const _cat = { kei: '軽自動車', normal: '普通車', import: '輸入車', commercial: '商用車' }[v.category] || '';
      const _seat = window.pitSeatsText ? pitSeatsText(v.seats) : '';
      const _tk = v.shakenDate && window.pitTenkenFromShaken ? pitTenkenFromShaken(v.shakenDate) : '';
      const _dims = [
        v.length != null ? '長 ' + _fleetEsc(v.length) : '',
        v.width  != null ? '幅 ' + _fleetEsc(v.width)  : '',
        v.height != null ? '高 ' + _fleetEsc(v.height) : ''
      ].filter(Boolean).join(' / ');
      h += '<div class="fl-row fl-row-click" onclick="fleetOpenDetail(\'' + v.id + '\')" title="クリックで詳細">'
         + '<div class="fl-card-top">'
           + (_no ? '<span class="fl-no">' + _fleetEsc(_no) + '</span>' : '')
           + '<span class="fl-ttl">' + _fleetEsc(v.model || v.name || '（車種未登録）') + '</span>'
           + (v.retired ? '<span class="fl-retired">引退</span>' : '')
           + (v.replaceDate ? '<span class="fl-retired plan">入替 ' + _fleetEsc(v.replaceDate) + '</span>' : '')
           + '<span class="fl-more"><i data-ic=right data-ics=16></i></span>'
         + '</div>'
         + (v.plate ? '<div class="fl-card-plate">' + _fleetEsc(v.plate) + '</div>' : '')
         /* v1.14.5：社用車も代車と同じ中身を出す（入力できるものは全部見えるように） */
         + ((_cat || v.color || _seat)
             ? '<div class="fl-card-line">'
                 + (_cat ? '<span class="fl-kv"><i>区分</i>' + _cat + '</span>' : '')
                 + (v.color ? '<span class="fl-kv"><i>カラー</i>' + _fleetEsc(v.color) + '</span>' : '')
                 + (_seat ? '<span class="fl-kv"><i>定員</i>' + _fleetEsc(_seat) + '</span>' : '')
               + '</div>' : '')
         + ((v.etc || v.navi || v.iso || v.camera)
             ? '<div class="fl-card-tags">'
                 + (v.etc ? '<span class="fl-opttag">ETC</span>' : '')
                 + (v.navi ? '<span class="fl-opttag">ナビ</span>' : '')
                 + (v.iso ? '<span class="fl-opttag">ISO</span>' : '')
                 + (v.camera ? '<span class="fl-opttag">Bカメ</span>' : '')
               + '</div>' : '')
         + (_dims ? '<div class="fl-card-dims">' + _dims + ' cm</div>' : '')
         + (v.shakenDate ? '<div class="fl-card-foot">'
             + '<span class="fl-fk shaken">車検</span><b>' + _fleetEsc(window.pitWareki ? pitWareki(v.shakenDate) : v.shakenDate) + '</b>'
             + (_tk ? '<span class="fl-fk tenken">点検</span><b>' + _fleetEsc(window.pitWareki ? pitWareki(_tk, 'ym') : _tk) + '</b>' : '')
           + '</div>' : '<div class="fl-card-foot none">車検満了日 未入力</div>')
         + '</div>';
    });
    h += '</div></div>';
  });

  wrap.innerHTML = h;

  // 月モード：右端付近までスクロールしたら列を増やす（未来永劫）
  const cw = document.getElementById('fl-cal-scroll');
  if (cw && _flMode === 'month'){
    cw.addEventListener('scroll', function(){
      if (cw.scrollLeft + cw.clientWidth > cw.scrollWidth - 300){
        const keep = cw.scrollLeft;
        _flMonths += 12;
        renderFleet();
        const cw2 = document.getElementById('fl-cal-scroll');
        if (cw2) cw2.scrollLeft = keep;
      }
    });
  }
}

/* 月モードのカレンダー */
function flMonthCalHtml(){
  const months = [];
  const base = new Date(); base.setDate(1); base.setHours(0,0,0,0);
  for (let i = 0; i < _flMonths; i++){ months.push(new Date(base.getFullYear(), base.getMonth() + i, 1)); }
  const vehicles = _flAllVehicles();
  let h = '<div class="fl-cal-wrap" id="fl-cal-scroll"><div class="fl-cal" style="grid-template-columns:120px repeat(' + months.length + ', minmax(86px,1fr))">';
  h += '<div class="fl-cal-h fl-cal-corner">車両</div>';
  months.forEach(function(m){
    h += '<div class="fl-cal-h fl-cal-m" onclick="flZoom(' + m.getFullYear() + ',' + m.getMonth() + ')" title="クリックで日別表示">'
       + (m.getMonth()+1) + '月' + (m.getMonth() === 0 || m.getTime() === months[0].getTime() ? '<span>' + m.getFullYear() + '</span>' : '') + '</div>';
  });
  _flVehSections().forEach(function(sec){
   h += _flSecRow(sec.label);
   sec.arr.forEach(function(v){
    h += '<div class="fl-cal-name" title="' + _fleetEsc(v.model || '') + '">' + _fleetEsc(_flVehName(v)) + '</div>';
    months.forEach(function(m){
      const y = m.getFullYear(), mo = m.getMonth();
      const ym = y + '-' + String(mo+1).padStart(2, '0');
      const first = ym + '-01';
      const last = ym + '-' + String(new Date(y, mo+1, 0).getDate()).padStart(2, '0');
      const sh = v.shakenDate && v.shakenDate.indexOf(ym) === 0;
      const tkDate = window.pitTenkenFromShaken ? pitTenkenFromShaken(v.shakenDate) : '';
      const tk = tkDate && tkDate.indexOf(ym) === 0;
      /* v1.13.2：車検・点検は下の赤/橙バッジで出しているので、自動で作った同じ予定は重ねて出さない
         （＝「車検」と「車検入庫」が二重に見えていた）。手で足した予定はそのまま出す。 */
      const evs = _flEvents().filter(function(e){ return !e.auto && e.vehicleId === v.id && e.fromDate <= last && e.toDate >= first; });
      h += '<div class="fl-cal-cell" onclick="flOpenEventModal(\'' + v.id + '\',\'' + first + '\')">';
      if (sh) h += '<span class="fl-bdg shaken" title="車検満了 ' + _fleetEsc(v.shakenDate) + '">車検</span>';
      if (tk) h += '<span class="fl-bdg tenken" title="12ヶ月点検（車検満了の翌年）' + _fleetEsc(window.pitWareki ? pitWareki(tkDate) : tkDate) + '">12ヶ月</span>';
      evs.forEach(function(e){
        const t = FL_EVT_TYPES[e.type] || FL_EVT_TYPES.other;
        h += '<span class="fl-evt" style="background:' + t.color + '" title="' + _fleetEsc(e.fromDate + '〜' + e.toDate) + '" onclick="event.stopPropagation();flOpenEventModal(null,null,\'' + e.id + '\')">' + _fleetEsc(e.label || t.label) + '</span>';
      });
      h += '</div>';
    });
   });
  });
  h += '</div></div>';
  return h;
}

/* 日モードのカレンダー（1列＝1日・代車の利用状況を透かし表示） */
function flDayCalHtml(y, mo){
  const last = new Date(y, mo+1, 0).getDate();
  const vehicles = _flAllVehicles();
  const metas = [];
  for (let d = 1; d <= last; d++){
    const dt = new Date(y, mo, d);
    const dow = dt.getDay();
    const ds = y + '-' + String(mo+1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    /* 🚫 v1.50.0 休みは MHS の定休日カレンダー（PitCal）が基準 */
    metas.push({ d: d, ds: ds, dow: dow, hol: (window.Holidays && Holidays.name(ds)) || null,
                 closed: (window.PitCal ? PitCal.isClosed(ds) : false),
                 note: (window.PitCal ? PitCal.label(ds) : '') });
  }
  let h = '<div class="fl-cal-wrap" id="fl-cal-scroll"><div class="fl-cal" style="grid-template-columns:120px repeat(' + last + ', minmax(56px,1fr))">';
  h += '<div class="fl-cal-h fl-cal-corner">車両</div>';
  metas.forEach(function(m){
    h += '<div class="fl-cal-h' + (m.dow === 0 ? ' sun' : (m.dow === 6 ? ' sat' : '')) + (m.hol ? ' fl-holh' : '') + (m.closed ? ' fl-closedh' : '') + '"' + (m.hol ? ' title="' + _fleetEsc(m.hol) + '"' : '') + '>' + m.d + '<span>' + '日月火水木金土'[m.dow] + (m.closed ? '・休' : '') + (m.hol ? '・祝' : '') + '</span></div>';
  });
  _flVehSections().forEach(function(sec){
   h += _flSecRow(sec.label);
   sec.arr.forEach(function(v){
    const isLoanerVeh = (state.loaners || []).some(function(l){ return l.id === v.id; });
    h += '<div class="fl-cal-name" title="' + _fleetEsc(v.model || '') + '">' + _fleetEsc(_flVehName(v)) + '</div>';
    metas.forEach(function(m){
      const ds = m.ds;
      const sh = v.shakenDate === ds;
      const tk = (window.pitTenkenFromShaken ? pitTenkenFromShaken(v.shakenDate) : '') === ds;
      const evs = _flEvents().filter(function(e){ return !e.auto && e.vehicleId === v.id && e.fromDate <= ds && e.toDate >= ds; });
      // 代車の貸出状況（利用カレンダー）を透かして重ねる
      let useCls = '', useTag = '';
      if (isLoanerVeh){
        const a = (state.loanerAssigns || []).find(function(x){ return x.loanerId === v.id && x.fromDate <= ds && x.toDate >= ds; });
        if (a){ useCls = ' fl-use'; if (a.fromDate === ds) useTag = '<span class="fl-use-tag">' + _fleetEsc(a.customer || '貸出') + '</span>'; }
      }
      h += '<div class="fl-cal-cell fl-day' + useCls + (m.closed ? ' fl-closedc' : '') + (m.hol ? ' fl-holc' : '') + '" onclick="flOpenEventModal(\'' + v.id + '\',\'' + ds + '\')">';
      h += useTag;
      if (sh) h += '<span class="fl-bdg shaken">車検</span>';
      if (tk) h += '<span class="fl-bdg tenken">12ヶ月</span>';
      evs.forEach(function(e){
        const t = FL_EVT_TYPES[e.type] || FL_EVT_TYPES.other;
        h += '<span class="fl-evt" style="background:' + t.color + '" onclick="event.stopPropagation();flOpenEventModal(null,null,\'' + e.id + '\')">' + _fleetEsc((e.label || t.label).slice(0, 4)) + '</span>';
      });
      h += '</div>';
    });
   });
  });
  h += '</div></div>';
  return h;
}

function flZoom(y, m){ _flMode = 'day'; _flDay = new Date(y, m, 1); renderFleet(); }
function flBackMonth(){ _flMode = 'month'; renderFleet(); }

/* ===== イベント 追加・編集ポップアップ ===== */
let _flEvtEditId = null;
function flOpenEventModal(vehicleId, dateStr, eventId){
  _flEvtEditId = eventId || null;
  const ev = eventId ? _flEvents().find(function(e){ return e.id === eventId; }) : null;
  const sel = document.getElementById('flev-vehicle');
  sel.innerHTML = _flAllVehicles().map(function(v){
    return '<option value="' + v.id + '"' + ((ev ? ev.vehicleId : vehicleId) === v.id ? ' selected' : '') + '>' + _fleetEsc(_flVehName(v)) + '</option>';
  }).join('');
  document.getElementById('flev-type').value  = ev ? ev.type : 'shakenIn';
  document.getElementById('flev-label').value = ev ? (ev.label || '') : '';
  document.getElementById('flev-from').value  = ev ? ev.fromDate : (dateStr || '');
  document.getElementById('flev-to').value    = ev ? ev.toDate : (dateStr || '');
  document.getElementById('flev-title').textContent = ev ? 'イベントを編集': '＋ イベントを追加';
  document.getElementById('flev-del').style.display = ev ? '' : 'none';
  document.getElementById('fleet-event-modal').classList.add('show');
}
function flEventClose(){ _flEvtEditId = null; document.getElementById('fleet-event-modal').classList.remove('show'); }
function flEventSubmit(){
  const vehicleId = document.getElementById('flev-vehicle').value;
  const type  = document.getElementById('flev-type').value || 'other';
  const label = (document.getElementById('flev-label').value || '').trim();
  let from = document.getElementById('flev-from').value;
  let to   = document.getElementById('flev-to').value;
  if (!vehicleId || !from){ pitAlert('車両と開始日を入れてください'); return; }
  if (!to || to < from) to = from;
  if (_flEvtEditId){
    const ev = _flEvents().find(function(e){ return e.id === _flEvtEditId; });
    if (ev){ ev.vehicleId = vehicleId; ev.type = type; ev.label = label; ev.fromDate = from; ev.toDate = to; }
  } else {
    _flEvents().push({ id: 'ev' + Date.now().toString(36), vehicleId: vehicleId, type: type, label: label, fromDate: from, toDate: to });
  }
  if (window.PitDB) PitDB.save();
  flEventClose();
  renderFleet();
}
function flEventDelete(){
  if (!_flEvtEditId) return;
  pitAsk('このイベントを削除しますか？', { danger:true, ok:'削除する' }).then(function(yes){
    if (!yes) return;
    state.fleetEvents = _flEvents().filter(function(e){ return e.id !== _flEvtEditId; });
    if (window.PitDB) PitDB.save();
    flEventClose();
    renderFleet();
  });
}

/* ===== 車両 登録・編集ポップアップ ===== */
function _flLoanerNum(l){ if (l.number != null) return l.number; const n = parseInt(String(l.name||'').replace(/[^0-9]/g,''),10); return isNaN(n)?0:n; }
/* v1.14.0：番号は代車と社用車で別々に数える（代車1,2,3…／社用車1,2,3…） */
function _flNextNum(kind){
  const arr = (kind === 'company') ? (state.companyCars || []) : (state.loaners || []);
  let mx = 0; arr.forEach(function(v){ mx = Math.max(mx, _flLoanerNum(v)); });
  return mx + 1;
}
/* 種別を切り替えたら、その種別の次の番号に入れ替える（新規のときだけ） */
window.flKindChange = function(){
  if (_fleetEditId) return;
  const k = (document.getElementById('fl-kind')||{}).value || 'loaner';
  const n = document.getElementById('fl-number'); if (n) n.value = _flNextNum(k);
  if (window.flNumberCheck) flNumberCheck();
};
function _flPlateParts(p){ const a=String(p||'').trim().split(/\s+/); return { region:a[0]||'', cls:a[1]||'', kana:a[2]||'', num:a[3]||'' }; }
function _flPlateJoin(){ const v=function(id){return (document.getElementById(id).value||'').trim();}; return [v('fl-pl-region'),v('fl-pl-cls'),v('fl-pl-kana'),v('fl-pl-num')].filter(Boolean).join(' '); }
function _flZ2H(s){ return String(s==null?'':s).replace(/[０-９]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-0xFEE0);}); }

/* ===== v1.15.0：数字だけの枠（上下矢印なし・半角数字のみ） =====
   もともと type="number" だった枠（番号／車検満了日の年月日／寸法）を type="text" にして、
   ここで「全角→半角」「数字以外は捨てる」「桁数で止める」をやる。
   ⚠ type="number" のままだと、全角を貼り付けられた時に中身が空っぽ扱いになって黙って消える。 */
window.flDigits = function(el, max){
  if (!el) return;
  var pos = null;
  try { pos = el.selectionStart; } catch (e) {}
  var v = _flZ2H(el.value).replace(/[^0-9]/g, '');
  if (max) v = v.slice(0, max);
  if (el.value !== v){
    el.value = v;
    if (pos != null){ try { el.setSelectionRange(pos, pos); } catch (e) {} }
  }
};

/* ===== v1.15.0：定員は自由入力（「5（2）人」等）=====
   pitSeatsText … 画面に出す文字（末尾に「人」が無ければ足す。空なら空文字）
   pitSeatsNum  … 並べ替え用の数字（先頭の数字だけ拾う。取れなければ null）
   ⚠ 昔のデータは数値（5）で入っている。どちらでも同じように扱えるようにしてある。 */
window.pitSeatsText = function(s){
  var t = String(s == null ? '' : s).trim();
  if (!t) return '';
  return /人\s*$/.test(t) ? t : (t + '人');
};
window.pitSeatsNum = function(s){
  var m = _flZ2H(String(s == null ? '' : s)).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

/* ナンバー＝1BOX＋クリックでガイド（新規予約と同じcf-plate構造）。入力ブレ防止：全角→半角・分類3桁・一連4桁 */
window.flPlateToggle = function(){
  const box=document.getElementById('fl-plate'); if(!box) return;
  box.classList.toggle('open');
  if(box.classList.contains('open')){ const r=document.getElementById('fl-pl-region'); if(r) setTimeout(function(){ r.focus(); },0); }
};
window.flPlateSync = function(){
  const cls=document.getElementById('fl-pl-cls'); if(cls) cls.value=_flZ2H(cls.value).replace(/[^0-9]/g,'').slice(0,3);
  const num=document.getElementById('fl-pl-num'); if(num) num.value=_flZ2H(num.value).replace(/[^0-9]/g,'').slice(0,4);
  const main=document.getElementById('fl-pl-main'); if(main) main.value=_flPlateJoin();
};
document.addEventListener('mousedown', function(e){
  const box=document.getElementById('fl-plate');
  if(box && box.classList.contains('open') && !box.contains(e.target)) box.classList.remove('open');
});
/* 車検満了/12点 → カレンダーに自動でイベント（車両×種別で1件・上書き更新）。代車カレンダーにも出る。 */
function _flSyncVehEvent(vehicleId, type, date){
  const eid = 'auto_' + vehicleId + '_' + type;
  const evs = _flEvents();
  const i = evs.findIndex(function(e){ return e.id === eid; });
  if (!date){ if (i>=0) evs.splice(i,1); return; }
  const rec = { id:eid, vehicleId:vehicleId, type:type, label:(FL_EVT_TYPES[type]?FL_EVT_TYPES[type].label:''), fromDate:date, toDate:date, auto:true };
  if (i>=0) evs[i]=rec; else evs.push(rec);
}

/* ===== v1.12.0 車両の詳細（閲覧のみ）=====
   カードをクリック → ここで中身を見る → 「編集」で入力画面へ（削除はその入力画面の中）。
   一覧に編集・削除ボタンを並べない＝押し間違いを防ぐ。 */
window.fleetOpenDetail = function (id) {
  const f = _fleetFind(id);
  if (!f) return;
  const v = f.v, isLo = (f.kind === 'loaner');
  const e = _fleetEsc;
  const ttl = window.pitVehLabel ? pitVehLabel(v, f.kind) : v.name;
  const opt = function (on, label) { return '<span class="fd-opt ' + (on ? 'on' : 'off') + '">' + (on ? '✓ ' : '× ') + label + '</span>'; };
  const row = function (k, val) { return val ? '<tr><td>' + k + '</td><td>' + val + '</td></tr>' : ''; };
  const cat = { kei: '軽', normal: '普通車', import: '輸入車', commercial: '商用車' }[v.category] || '';
  const seatTxt = window.pitSeatsText ? pitSeatsText(v.seats) : '';
  const tk = v.shakenDate && window.pitTenkenFromShaken ? pitTenkenFromShaken(v.shakenDate) : '';
  let h = '<div class="fd-head"><div class="fd-title">' + e(ttl) + '</div>'
        + (v.retired ? '<span class="fl-retired">引退</span>' : '')
        + (v.replaceDate ? '<span class="fl-retired plan">入替予定 ' + e(v.replaceDate) + '</span>' : '')
        + '<span class="fd-kind">' + (isLo ? '代車' : '社用車') + '</span></div>'
        + '<table class="fd-tbl">'
        + row('車種', e(v.model || ''))
        + row('色', e(v.color || ''))
        + row('ナンバー', e(v.plate || ''))
        /* v1.14.5：代車／社用車のどちらでも同じ項目を出す */
        + row('区分', e(cat))
        + (seatTxt ? row('定員', e(seatTxt)) : '')
        + row('寸法', [v.length != null ? '長 ' + e(v.length) : '', v.width != null ? '幅 ' + e(v.width) : '', v.height != null ? '高 ' + e(v.height) : ''].filter(Boolean).join(' / ') + (v.height != null || v.width != null || v.length != null ? ' cm' : ''))
        + row('車検満了', v.shakenDate ? e(window.pitWareki ? pitWareki(v.shakenDate) : v.shakenDate) : '')
        + row('12ヶ月点検', tk ? (e(window.pitWareki ? pitWareki(tk, 'ym') : tk) + '<span class="fd-auto">（車検の1年前／1年後・自動）</span>') : '')
        + '</table>'
        + '<div class="fd-opts">' + opt(v.etc, 'ETC') + opt(v.navi, 'ナビ') + opt(v.iso, 'ISO') + opt(v.camera, 'Bカメ') + '</div>'
        + '<div class="fd-btns"><button class="vh-btn" onclick="fleetCloseDetail()">閉じる</button>'
        + '<button class="vh-btn primary" onclick="fleetCloseDetail();fleetOpenModal(\'' + v.id + '\')"><i data-ic=pencil data-ics=16></i> 編集</button></div>';
  let ov = document.getElementById('fleet-detail');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'fleet-detail';
    ov.className = 'modal-backdrop show';
    pitModalOutside(ov, function(){ fleetCloseDetail(); });
    document.body.appendChild(ov);
  }
  ov.innerHTML = '<div class="modal-box fd-box">' + h + '</div>';
  ov.classList.add('show');
  if (window.icoBoot) icoBoot(ov);
};
window.fleetCloseDetail = function () {
  const ov = document.getElementById('fleet-detail');
  if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
};

/* ===== v1.13.0 車検満了日を和暦で入力する ===== */
window.flWarekiFill = function (ymdStr) {
  var p = window.pitYmdToWarekiParts ? pitYmdToWarekiParts(ymdStr) : { era: '令和', y: '', m: '', d: '' };
  var e = document.getElementById('fl-sh-era'); if (e) e.value = p.era;
  var y = document.getElementById('fl-sh-y'); if (y) y.value = p.y || '';
  var m = document.getElementById('fl-sh-m'); if (m) m.value = p.m || '';
  var d = document.getElementById('fl-sh-d'); if (d) d.value = p.d || '';
  flWarekiSync();
};
window.flWarekiSync = function () {
  var era = (document.getElementById('fl-sh-era') || {}).value || '令和';
  var y = (document.getElementById('fl-sh-y') || {}).value;
  var m = (document.getElementById('fl-sh-m') || {}).value;
  var d = (document.getElementById('fl-sh-d') || {}).value;
  var ymdStr = window.pitWarekiToYmd ? pitWarekiToYmd(era, y, m, d) : '';
  var hid = document.getElementById('fl-shaken'); if (hid) hid.value = ymdStr;
  var hint = document.getElementById('fl-sh-hint');
  if (hint) {
    hint.textContent = ymdStr
      ? ('西暦 ' + ymdStr + '　／　12ヶ月点検の目安 ' + (window.pitWareki ? pitWareki(pitTenkenFromShaken(ymdStr), 'ym') : ''))
      : ((y || m || d) ? '年・月・日をすべて入れてください' : '');
    hint.classList.toggle('ng', !!((y || m || d) && !ymdStr));
  }
  var tp = document.getElementById('fl-tenken-preview');
  if (tp) tp.textContent = '';
};

/* v1.14.7：12ヶ月点検は「今日」から見て前後どちらに来るかが変わるので、
   画面を開くたびに自動イベントを貼り直す。変わったときだけ保存する（無駄な通信をしない）。 */
window.pitRefreshAutoTenken = function () {
  if (typeof state === 'undefined' || !state) return false;
  const evs = _flEvents();
  let changed = false;
  _flAllVehicles().forEach(function (v) {
    const eid = 'auto_' + v.id + '_tenken';
    const want = (v.shakenDate && window.pitTenkenFromShaken) ? pitTenkenFromShaken(v.shakenDate) : '';
    const i = evs.findIndex(function (e) { return e.id === eid; });
    if (!want) { if (i >= 0) { evs.splice(i, 1); changed = true; } return; }
    if (i < 0) {
      evs.push({ id: eid, vehicleId: v.id, type: 'tenken', label: FL_EVT_TYPES.tenken.label,
                 fromDate: want, toDate: want, auto: true });
      changed = true;
    } else if (evs[i].fromDate !== want || evs[i].toDate !== want) {
      evs[i].fromDate = want; evs[i].toDate = want; changed = true;
    }
  });
  if (changed && window.PitDB && PitDB.save) { try { PitDB.save(); } catch (e) { console.warn('[fleet] 点検の貼り直しで保存できず', e); } }
  return changed;
};

function fleetOpenModal(id){
  _fleetEditId = id || null;
  const f = id ? _fleetFind(id) : null;
  const v = f ? f.v : {};
  document.getElementById('fl-modal-title').textContent = f ? '車両を編集': '＋ 車両を追加';
  var _db = document.getElementById('fl-del-btn');
  if (_db) { _db.style.display = f ? '' : 'none'; _db.onclick = function(){ fleetDelete(id); }; }
  document.getElementById('fl-kind').value  = f ? f.kind : 'loaner';
  document.getElementById('fl-number').value = f ? _flLoanerNum(v) : _flNextNum((document.getElementById('fl-kind')||{}).value || 'loaner');   // 自動末番
  document.getElementById('fl-model').value = v.model || '';                          // 車種名
  document.getElementById('fl-color').value = v.color || '';                          // 色
  const pp = _flPlateParts(v.plate);
  document.getElementById('fl-pl-region').value = pp.region;
  document.getElementById('fl-pl-cls').value    = pp.cls;
  document.getElementById('fl-pl-kana').value   = pp.kana;
  document.getElementById('fl-pl-num').value    = pp.num;
  document.getElementById('fl-pl-main').value   = v.plate || '';
  const _pg = document.getElementById('fl-pl-guide'); if (_pg) _pg.style.display = 'none';
  document.getElementById('fl-shaken').value = v.shakenDate || '';
  flWarekiFill(v.shakenDate || '');   /* v1.13.0：入力も和暦で */
  /* v1.11.0：12ヶ月点検は車検満了日から自動計算（入力欄なし）。目安をその場に出す。 */
  var _tp = document.getElementById('fl-tenken-preview');
  if (_tp) _tp.textContent = v.shakenDate ? ('12ヶ月点検の目安：' + (window.pitWareki ? pitWareki(pitTenkenFromShaken(v.shakenDate), 'ym') : '')) : '';
  document.getElementById('fl-height').value = (v.height != null ? v.height : '');
  document.getElementById('fl-width').value  = (v.width  != null ? v.width  : '');
  document.getElementById('fl-length').value = (v.length != null ? v.length : '');
  document.getElementById('fl-cat').value    = v.category || 'kei';
  document.getElementById('fl-seats').value  = (v.seats != null ? v.seats : '');
  document.getElementById('fl-etc').checked  = !!v.etc;
  var _fc = document.getElementById('fl-camera'); if (_fc) _fc.checked = !!v.camera;   /* v1.11.0 バックカメラ */
  document.getElementById('fl-navi').checked = !!v.navi;
  document.getElementById('fl-iso').checked  = !!v.iso;
  document.getElementById('fl-repdate').value = v.replaceDate || '';
  flNumberCheck();
  document.getElementById('fleet-modal').classList.add('show');
  const n = document.getElementById('fl-model'); if (n) n.focus();
}
/* 番号入力時：その番号が**同じ種別の中で**使用中なら「入替予定」欄を出す。
   ⚠ v1.14.1：代車と社用車は別々に数えるので、社用車の1番を代車の1番と競合させない。
      入替の仕組みは代車だけの話なので、社用車では出さない。 */
function flNumberCheck(){
  const num = Number(document.getElementById('fl-number').value);
  const row = document.getElementById('fl-rep-row');
  if (!row) return;
  const kind = (document.getElementById('fl-kind') || {}).value || 'loaner';
  if (kind !== 'loaner'){ row.style.display = 'none'; return; }
  const dup = num && (state.loaners||[]).some(function(l){ return _flLoanerNum(l)===num && l.id!==_fleetEditId; });
  row.style.display = dup ? 'block' : 'none';
}
window.flNumberCheck = flNumberCheck;
function fleetCloseModal(){
  _fleetEditId = null;
  document.getElementById('fleet-modal').classList.remove('show');
}
function fleetSubmit(){
  /* v1.14.2：保存そのものと「閉じる・描き直し」を分ける。
     ⚠ これまでは描き直しでコケると『保存できませんでした』と出て、しかも閉じないので
       押すたびに新しい車両が増えていた。保存が通ったら必ず閉じる。 */
  var okId;
  try {
    okId = _fleetSubmitInner();
  } catch (err) {
    console.error('[fleet] 保存でエラー', err);
    pitAlert('保存できませんでした。\n' + (err && err.message ? err.message : err));
    return;
  }
  if (okId === false) return;   /* 入力もれ＝入れ直してもらうので、開いたまま */
  try { fleetCloseModal(); } catch (e) { console.error('[fleet] 閉じるでエラー', e); }
  try { renderFleet(); }
  catch (e) {
    console.error('[fleet] 画面の描き直しでエラー', e);
    if (window.showToast) showToast('保存しました（画面の更新でつまずいたので、開き直してください）');
  }
}
function _fleetSubmitInner(){
  const kind   = document.getElementById('fl-kind').value || 'loaner';
  const number = Number(document.getElementById('fl-number').value) || _flNextNum(kind);
  const model  = (document.getElementById('fl-model').value || '').trim();
  const color  = (document.getElementById('fl-color').value || '').trim();
  const plate  = _flPlateJoin();
  const shaken = document.getElementById('fl-shaken').value || '';
  const tenken = window.pitTenkenFromShaken ? pitTenkenFromShaken(document.getElementById('fl-shaken').value || '') : '';
  const _num = function(id){ const x = document.getElementById(id).value; return (x === '' || x == null) ? null : Number(x); };
  const height=_num('fl-height'), width=_num('fl-width'), length=_num('fl-length');
  const category = document.getElementById('fl-cat').value || 'kei';
  /* v1.15.0：定員は自由入力（「5（2）人」のような書き方があるため）。空なら null。 */
  const seats = ((document.getElementById('fl-seats') || {}).value || '').trim() || null;
  const etc=!!document.getElementById('fl-etc').checked, navi=!!document.getElementById('fl-navi').checked, iso=!!document.getElementById('fl-iso').checked;
  const camera=!!(document.getElementById('fl-camera')||{}).checked;
  if (!model){ pitAlert('車種名を入れてください（例：タント）'); return false; }   /* false＝保存していない（閉じない） */
  if (!Array.isArray(state.companyCars)) state.companyCars = [];

  // 入替判定（新規で、その番号が既存の代車に使われている）
  const dupLoaner = (kind==='loaner') ? (state.loaners||[]).find(function(l){ return _flLoanerNum(l)===number && l.id!==_fleetEditId; }) : null;
  const repDate = (dupLoaner && !_fleetEditId) ? (document.getElementById('fl-repdate').value || '') : '';

  const labelName = (kind === 'loaner') ? ('代車' + number + (repDate ? '(仮)' : '')) : (model || '社用車');
  if (_fleetEditId){
    const f = _fleetFind(_fleetEditId);
    if (f){
      if (f.kind !== kind){ const fromArr=f.kind==='loaner'?state.loaners:state.companyCars, toArr=kind==='loaner'?state.loaners:state.companyCars; fromArr.splice(fromArr.indexOf(f.v),1); toArr.push(f.v); }
      f.v.name = (kind==='loaner'?'代車'+number:(model||f.v.name)); f.v.number = number; f.v.model = model; f.v.color = color; f.v.plate = plate;
      f.v.shakenDate = shaken; delete f.v.tenkenDate;   /* 12ヶ月点検は持たない（自動計算） */
      f.v.height=height; f.v.width=width; f.v.length=length; f.v.category=category; f.v.seats=seats; f.v.etc=etc; f.v.navi=navi; f.v.iso=iso; f.v.camera=camera;
      _flSyncVehEvent(f.v.id, 'shakenIn', shaken);
      _flSyncVehEvent(f.v.id, 'tenken', tenken);
    }
  } else {
    const id = (kind === 'loaner' ? 'L' : 'C') + Date.now().toString(36);
    const rec = { id:id, name:labelName, number:number, model:model, color:color, plate:plate, shakenDate:shaken,
      height:height, width:width, length:length, category:category, seats:seats, etc:etc, navi:navi, iso:iso, camera:camera };
    if (dupLoaner && repDate){ rec.replaceOf = dupLoaner.id; rec.replaceDate = repDate; }
    (kind === 'loaner' ? state.loaners : state.companyCars).push(rec);
    _fleetEditId = id;   /* v1.14.2：万一もう一度押されても、増やさずに同じ車両を直す */
    _flSyncVehEvent(id, 'shakenIn', shaken);
    _flSyncVehEvent(id, 'tenken', tenken);
    // 入替予定＝旧車のカレンダーに「代車入替」イベント（〜入替日）＋新車にも開始予定
    if (dupLoaner && repDate){
      _flEvents().push({ id:'rep_'+id, vehicleId:dupLoaner.id, type:'lease', label:'代車'+number+'入替→新車へ', fromDate:ymd(new Date()), toDate:repDate });
    }
  }
  if (window.PitDB) PitDB.save();
  return _fleetEditId;   /* 閉じる・描き直しは呼び出し元（fleetSubmit）でやる */
}
function fleetDelete(id){
  const f = _fleetFind(id);
  if (!f) return;
  const isLoaner = (f.kind === 'loaner');
  const cnt = isLoaner ? (state.loanerAssigns || []).filter(function(a){ return a.loanerId === id; }).length : 0;
  pitAsk('「' + f.v.name + '」を削除しますか？',
         { danger:true, ok:'削除する', detail:(cnt ? 'この代車の予約 ' + cnt + ' 件も一緒に消えます。' : '') }).then(function(yes){
    if (!yes) return;
    const arr = isLoaner ? state.loaners : state.companyCars;
    arr.splice(arr.indexOf(f.v), 1);
    if (isLoaner) state.loanerAssigns = (state.loanerAssigns || []).filter(function(a){ return a.loanerId !== id; });
    state.fleetEvents = _flEvents().filter(function(e){ return e.vehicleId !== id; });
    if (_fleetEditId === id) _fleetEditId = null;
    if (window.PitDB) PitDB.save();
    renderFleet();
  });
}

/* ===================================================================
   v1.15.0  Enter で次の枠へ（車両の追加・編集ポップアップだけ）
   -------------------------------------------------------------------
   ゆうた依頼「フォームをEnterで次の枠に飛びたい」。まずこの画面だけで試す。

   🔴 気をつけている点（次に他の画面へ広げる時も同じ）
    1. 日本語変換の確定 Enter では飛ばない（e.isComposing / keyCode 229 を見る）。
       これを見ないと「タント」と変換確定した瞬間に次の枠へ飛んでしまう。
    2. 最後の枠まで来たら「保存」ボタンに枠が移るだけ。**押さない**。
       Enter 連打で車両が登録されると事故るため。
    3. 隠れている枠は飛ばす（入替日は番号が重なった時だけ出る）。
    4. ナンバーは 1BOX ＋ ガイド4枠。ガイドを開いて 地名→分類→かな→ナンバー と
       順に回り、抜けたらガイドを閉じる。
   =================================================================== */
(function(){
  /* 回る順番。ここに書いた順にしか飛ばない＝あとから枠が増えても勝手に混ざらない。 */
  var FL_ORDER = [
    'fl-kind', 'fl-number', 'fl-repdate', 'fl-model', 'fl-color',
    'fl-pl-main', 'fl-pl-region', 'fl-pl-cls', 'fl-pl-kana', 'fl-pl-num',
    'fl-sh-era', 'fl-sh-y', 'fl-sh-m', 'fl-sh-d',
    'fl-cat', 'fl-length', 'fl-width', 'fl-height', 'fl-seats',
    'fl-etc', 'fl-navi', 'fl-iso', 'fl-camera'
  ];
  var PLATE_IDS = { 'fl-pl-main':1, 'fl-pl-region':1, 'fl-pl-cls':1, 'fl-pl-kana':1, 'fl-pl-num':1 };

  function _visible(el){
    if (!el || el.disabled) return false;
    /* offsetParent が無い＝親ごと display:none（入替日の行・閉じているナンバーガイド） */
    return !!(el.offsetParent || el.getClientRects().length);
  }
  function _plateOpen(){
    var b = document.getElementById('fl-plate');
    return !!(b && b.classList.contains('open'));
  }
  /* 次に止まるべき枠を返す（見えないものは飛ばす） */
  function _next(fromId){
    var i = FL_ORDER.indexOf(fromId);
    if (i < 0) return null;
    for (var k = i + 1; k < FL_ORDER.length; k++){
      var id = FL_ORDER[k];
      /* ナンバーのガイド4枠は、ガイドが開いている時だけ回る */
      if (id !== 'fl-pl-main' && PLATE_IDS[id] && !_plateOpen()) continue;
      var el = document.getElementById(id);
      if (el && _visible(el)) return el;
    }
    return null;   /* 最後まで来た */
  }
  function _focus(el){
    if (!el) return;
    try { el.focus(); } catch (e) {}
    /* テキスト系なら中身を選んでおく＝そのまま打ち直せる */
    if (el.tagName === 'INPUT' && /^(text|search|tel|url|email)$/.test(el.type || 'text')){
      try { el.select(); } catch (e) {}
    }
  }

  document.addEventListener('keydown', function(e){
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.isComposing || e.keyCode === 229) return;         /* ⚠ 変換中の Enter は素通り */
    var box = document.getElementById('fleet-modal');
    if (!box || !box.classList.contains('show')) return;
    var t = e.target;
    if (!t || !box.contains(t)) return;
    if (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON') return;   /* 保存ボタン上の Enter は本来の動き */
    var id = t.id;
    if (FL_ORDER.indexOf(id) < 0) return;

    e.preventDefault();     /* ここで止めないと、環境によっては勝手に保存が走る */

    /* ナンバーの1BOXで Enter → ガイドを開いて「地名」から */
    if (id === 'fl-pl-main'){
      if (!_plateOpen() && window.flPlateToggle) flPlateToggle();
      var r = document.getElementById('fl-pl-region');
      setTimeout(function(){ _focus(r); }, 0);
      return;
    }
    var nx = _next(id);
    /* ナンバーのガイドから外に出るなら、ガイドを閉じる */
    if (PLATE_IDS[id] && (!nx || !PLATE_IDS[nx.id])){
      var pb = document.getElementById('fl-plate');
      if (pb) pb.classList.remove('open');
    }
    if (nx){ _focus(nx); return; }
    /* 最後の枠＝保存ボタンに枠を移すだけ（押さない） */
    var save = box.querySelector('.vh-btn.primary');
    if (save) { try { save.focus(); } catch (err) {} }
  }, true);
})();

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
/* 「2026-10-20」→「10/20」。カレンダーの狭いマスに入れる短い書き方。 */
function _flMd(s){ const p = String(s||'').split('-'); return p.length===3 ? (+p[1])+'/'+(+p[2]) : String(s||''); }
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
  try { pitCleanupAutoVehEvents(); } catch (e) { console.warn('[fleet] 古い予定の片付けでエラー', e); }

  let h = '';

  /* ===== ① カレンダー（最上部） ===== */
  h += '<div class="fl-card">';
  if (_flMode === 'month'){
    h += '<div class="fl-h"><i data-ic=calendar data-ics=16></i> 車両カレンダー（月をクリック＝日別表示／右へ無限）<span class="fl-note">🔧 やること・内容だけ。日と貸出は日別で見る</span></div>';
  } else {
    const y = _flDay.getFullYear(), m = _flDay.getMonth();
    /* 🔴 v2.52.0（ゆうた 2026-09-01）**日ビューから月をまたげるようにした。**
       🗣「候補を置くをクリックして日に入るんだけど、**単月しか見れなくて詰んでる**。
       　　車検とかだと月をまたいで入力したい。月表示に戻るボタンと月の間に先月と来月ボタンがほしい」
       ◎前まで … 日ビューに入ると、入った月から動けなかった。
         月をまたぐ整備（車検で月末〜翌月頭など）は、**置く場所が画面に出てこない**＝詰む。
       ⚠ 「月表示」に戻って別の月を押し直す道はあったが、**候補を置く途中では戻れない**（やり直しになる）。
       ⚠ 車の行の強調（_flHlVeh）は月を動かしても**そのまま**＝どの車を触っているか見失わない。 */
    h += '<div class="fl-h"><span><button class="vh-btn" onclick="flBackMonth()">← 月表示</button>　'
       + '<button class="vh-btn" onclick="flDayShift(-1)" title="先月へ">‹ 先月</button>'
       + '<button class="vh-btn" onclick="flDayShift(1)" title="来月へ">来月 ›</button>　'
       + '<i data-ic=calendar data-ics=16></i> ' + y + '年' + (m+1) + '月（日別）</span>'
       + '<span class="fl-note">セルをクリック＝イベント追加／チップ＝編集／月をまたぐ時は先月・来月で移動</span></div>';
  }
  /* 🔴 v2.70.0 凡例（ゆうた指定 2026-09-05）
     🗣「凡例に無い見た目は画面に出さない」＝ 色と形の意味を、必ずカレンダーの真上に置く。 */
  h += flCalLegendHtml();
  h += (_flMode === 'month') ? flMonthCalHtml() : flDayCalHtml(_flDay.getFullYear(), _flDay.getMonth());
  h += '</div>';

  /* ===== ①-2 🔧 代車作業予定ボード（v2.44.0・ゆうた指定 2026-08-31） =====
     🗣「車両カレンダーと代車一覧の間に **代車作業予定** の欄を追加。ココには直近半年分の予定が入る」
     ⚠ 中身は maint-pit.js。ここは差し込むだけ（この画面に判断を書かない）。 */
  if (window.flMaintBoardHtml) h += flMaintBoardHtml();

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
      /* 🔗 v2.64.0（ゆうた指定 2026-09-05「代車一覧の方にも紐づけ完了バッチが欲しい」）
         🔴 判定は `pitFleetLinkTarget`（js/fleet-link.js）1本。ここで custId を見に行かない。
         🔴 結ばれていない車は **「未紐づけ」を出す**＝2026-09-04 の大前提（抜けは0にする対象）。
         ⚠ 引退した車は出さない（L08 も数えていない＝画面と数を揃える）。
         ⚠ 色は css のクラス（.fl-link-bdg）で持つ。js に色を直書きしない。 */
      const _lk = window.pitFleetLinkTarget ? pitFleetLinkTarget(v) : null;
      /* 🔴 v2.65.0（ゆうた「うるさい」「🔗済 ぐらいの内容で」）**印は「済」だけ。**
         ここは代車・社用車しか並ばないので**種別は要らない**（顧客ビューは「代車／自社」を付ける）。
         ⚠ 誰と結んであるかは、カーソルを乗せた時（title）と、押して出るスペック表に回す。 */
      const _lkBdg = _lk
        ? '<div class="fl-card-link"><span class="fl-link-bdg on" title="'
            + _fleetEsc('お客様の車と紐づけ済み（' + (_lk.cust.name || _lk.cust.kana || '(無名)') + ' 様）')
            + '"><i data-ic=link data-ics=12></i>済</span></div>'
        : (v.retired ? ''
            : '<div class="fl-card-link"><span class="fl-link-bdg off" title="編集 ▸「顧客車両との紐づけ」から結べます">未紐づけ</span></div>');
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
         + _lkBdg   /* 🔗 v2.64.0 顧客車両との紐づけ */
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

  /* ===== ③ 貸出履歴（v1.145.0） ===== */
  h += _flHistoryHtml();

  wrap.innerHTML = h;

  /* 🔧 v2.46.0（ゆうた指定 2026-08-31）**候補日はドラッグでまとまった日を選べる。**
     ⚠ クリックだけでも1日ぶんとして通る（押した＝離した が同じマス）。
     ⚠ 同じ車の行の中だけで伸びる（別の車へは飛ばない）。 */
  if (_flMode === 'day') _flBindDayDrag();

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

/* 🔧 v2.46.0 日ビューのなぞり（範囲選択）。
   ⚠ 画面の中だけの話＝1文字も保存しない。離した時に選択肢を出すだけ。 */
let _flDrag = null;
function _flBindDayDrag(){
  const wrap = document.getElementById('view-fleet-body');
  if (!wrap || wrap._flDragBound) return;
  wrap._flDragBound = true;
  const cellOf = function(t){ return t && t.closest ? t.closest('.fl-cal-cell.fl-day') : null; };
  wrap.addEventListener('mousedown', function(e){
    const el = cellOf(e.target);
    if (!el || !el.dataset.fv) return;
    /* 🔴 v2.70.0 掴まない所＝整備のバー（.fl-bar3）・自由イベント（.fl-ev）・満了日の字（.fl-big）。
       ⚠ バーは上の 22px だけに置いてある＝その下はふつうになぞれる（候補のドラッグ選択）。 */
    if (e.target.closest('.fl-bar3') || e.target.closest('.fl-ev') || e.target.closest('.fl-big')) return;
    e.preventDefault();
    _flDrag = { v: el.dataset.fv, a: el.dataset.fd, b: el.dataset.fd };
    _flPaintDrag();
  });
  wrap.addEventListener('mousemove', function(e){
    if (!_flDrag) return;
    const el = cellOf(e.target);
    if (!el || el.dataset.fv !== _flDrag.v) return;   /* 別の車へは伸ばさない */
    if (el.dataset.fd === _flDrag.b) return;
    _flDrag.b = el.dataset.fd;
    _flPaintDrag();
  });
  document.addEventListener('mouseup', function(){
    if (!_flDrag) return;
    const d = _flDrag; _flDrag = null;
    _flClearDrag();
    const from = (d.a <= d.b) ? d.a : d.b, to = (d.a <= d.b) ? d.b : d.a;
    if (window.flMaintCellMenu) flMaintCellMenu(d.v, from, to);
  });
}
function _flPaintDrag(){
  _flClearDrag();
  if (!_flDrag) return;
  const lo = (_flDrag.a <= _flDrag.b) ? _flDrag.a : _flDrag.b;
  const hi = (_flDrag.a <= _flDrag.b) ? _flDrag.b : _flDrag.a;
  document.querySelectorAll('.fl-cal-cell.fl-day').forEach(function(el){
    if (el.dataset.fv !== _flDrag.v) return;
    if (el.dataset.fd >= lo && el.dataset.fd <= hi) el.classList.add('fl-pick');
  });
}
function _flClearDrag(){
  document.querySelectorAll('.fl-cal-cell.fl-pick').forEach(function(el){ el.classList.remove('fl-pick'); });
}

/* ==================================================================
   🔴🔴 v2.70.0 車両カレンダー 作り直し（ゆうた承認 2026-09-05・モックのとおり）
   ------------------------------------------------------------------
   ◎なぜ作り直したか（2026-09-05 に画面と CSS を突き合わせて分かったこと）
     マスは **横に並べて中央寄せ・折り返し**の入れ物なのに、中の札は
     「下に3px空ける＝縦に積むつもり」で書かれていた。だから札が2つ以上あると
     **横に並んで両方潰れる**。「たまに変」の正体はこれ。
   ◎決めごと（ゆうた指定・凡例と1対1）
     ① マスは縦積み ② 網掛けは1か所も使わない ③ 字は 11px 以上
     ④ 月ビューは**やること・内容だけ**（候補の日付・貸出・仮押さえは日ビューの仕事）
     ⑤ 色＝**状態**（未割当＝赤／予定＝黄／確定＝緑）。作業の種類は**前の小さい四角**
     ⑥ ベタ塗りは「手遅れになると困る日」だけ＝**超過と満了日**
     ⑦ 車検は**満了月＋その前2ヶ月を1本のバー**でぶち抜く（3つ並べない）
     ⑧ 期限（満了・12点）は札にしない＝**左に色の縦線の1行**（やることと形で分ける）
     ⑨ 凡例に無い見た目は画面に出さない
   🔴 何を出すかは **maint-pit.js の pitMaintCalItems / pitMaintDayBars 1本**に聞く。
      ここで state.cards を読んで自分で数えない（＝画面ごとに古くなる元）。
   ⚠ 列は**固定幅**にした（月=86px・日=56px）。バーが何マスぶんか計算するため。
   ================================================================== */
const FL_COL_M = 86;    /* 月ビューの1列（ゆうた確定 2026-09-05「列幅は86PXでいいや」） */
const FL_COL_D = 56;    /* 日ビューの1列 */
const FL_COL_NAME = 150;

/* 凡例。**画面に出る見た目は全部ここに載っている**（載っていない見た目は出さない） */
function flCalLegendHtml(){
  const dot = function(w, lb){
    return '<span class="fl-lg-w"><i class="fl-dot ' + (window.pitMaintWorkDot ? pitMaintWorkDot(w) : 'wk-general') + '"></i>' + lb + '</span>';
  };
  let h = '<div class="fl-lg">';
  h += '<div class="fl-lg-g"><span class="fl-lg-t">状態</span>'
     + '<span class="fl-mb tbd"><b>未割当</b></span>'
     + '<span class="fl-mb cand"><b>予定</b></span>'
     + '<span class="fl-mb fixed"><b>確定</b></span>'
     + '<span class="fl-mb over"><b>超過</b></span></div>';
  h += '<div class="fl-lg-g"><span class="fl-lg-t">作業</span>'
     + dot('shaken','車検') + dot('12pt','12点') + dot('general','一般') + dot('bp','B.P') + '</div>';
  if (_flMode === 'month'){
    /* 🔴 v2.71.0 期限として出すのは**車検の満了日だけ**。12点は目安なので日付を出さない。 */
    h += '<div class="fl-lg-g"><span class="fl-lg-t">期限</span>'
       + '<span class="fl-due">満了</span>'
       + '<span class="fl-lg-n">左に赤い縦線の1行＝やることではなく<b>車検の期限</b></span></div>';
    h += '<div class="fl-lg-g"><span class="fl-lg-t">バー</span>'
       + '<span class="fl-lg-n">車検＝満了月＋その前<b>2ヶ月</b>（3ヶ月ぶち抜き）／'
       + '12点＝目安の月＋その前<b>1ヶ月</b>（2ヶ月）。<b>12点に期限日はありません</b></span></div>';
    h += '<div class="fl-lg-g"><span class="fl-lg-n">※ 月表示は<b>やること・内容だけ</b>。日・貸出・仮押さえは日別で見る</span></div>';
  } else {
    h += '<div class="fl-lg-g"><span class="fl-lg-t">その日</span>'
       + '<span class="fl-lg-sq exp">満了</span>'
       + '<span class="fl-lg-n">この日を過ぎると車検が切れる＝<b>画面でいちばん強い</b>（12点は目安なので塗りません）</span></div>';
    h += '<div class="fl-lg-g"><span class="fl-lg-t">代車</span>'
       + '<span class="fl-lg-sw lend"></span><span class="fl-lg-n">貸出中</span>'
       + '<span class="fl-lg-sw hold"></span><span class="fl-lg-n">仮押さえ（名前の頭に「仮」）</span></div>';
  }
  h += '</div>';
  return h;
}

/* 作業の種類の四角＋名前＋状態 の1枚。月ビューの札とバーで同じ見た目を使う。 */
function _flMbInner(it){
  return '<i class="fl-dot ' + it.workDot + '"></i><b>' + _fleetEsc(it.workShort) + '</b>'
       + '<span class="st">' + _fleetEsc(it.stateLabel) + '</span>';
}

/* 月モードのカレンダー */
function flMonthCalHtml(){
  const months = [];
  const base = new Date(); base.setDate(1); base.setHours(0,0,0,0);
  for (let i = 0; i < _flMonths; i++){ months.push(new Date(base.getFullYear(), base.getMonth() + i, 1)); }
  const keys = months.map(function(m){ return m.getFullYear() + '-' + String(m.getMonth()+1).padStart(2,'0'); });
  let h = '<div class="fl-cal-wrap" id="fl-cal-scroll"><div class="fl-cal fl-cal-new" style="grid-template-columns:'
        + FL_COL_NAME + 'px repeat(' + months.length + ', ' + FL_COL_M + 'px)">';
  h += '<div class="fl-cal-h fl-cal-corner">車両</div>';
  months.forEach(function(m){
    h += '<div class="fl-cal-h fl-cal-m" onclick="flZoom(' + m.getFullYear() + ',' + m.getMonth() + ')" title="クリックで日別表示">'
       + (m.getMonth()+1) + '月' + (m.getMonth() === 0 || m.getTime() === months[0].getTime() ? '<span>' + m.getFullYear() + '</span>' : '') + '</div>';
  });
  _flVehSections().forEach(function(sec){
   h += _flSecRow(sec.label);
   sec.arr.forEach(function(v){
    h += '<div class="fl-cal-name" title="' + _fleetEsc(v.model || '') + '">' + _fleetEsc(_flVehName(v)) + '</div>';
    const items = (window.pitMaintCalItems ? pitMaintCalItems(v) : []);
    /* 🔴 月をまたぐもの（＝車検）は「始まりの月のマス」に入れて、右へ何マスぶんか伸ばす。
       ⚠ バーが乗っているマスは上に場所を空ける（barpad）。空けないと中身と重なる。 */
    const barAt = {}, padAt = {};
    items.filter(function(it){ return it.bar; }).forEach(function(it){
      const idx = it.months.map(function(k){ return keys.indexOf(k); })
                    .filter(function(i){ return i >= 0; }).sort(function(a,b){ return a-b; });
      if (!idx.length) return;
      const span = idx[idx.length-1] - idx[0] + 1;
      barAt[idx[0]] = { it: it, span: span };
      /* ⚠ 上に場所を空けるのは**バーになる時だけ**（1マスなら札なので空けない＝無駄な空白になる） */
      if (span > 1) for (let i = 0; i < span; i++) padAt[idx[0]+i] = 1;
    });
    months.forEach(function(m, mi){
      const ym = keys[mi];
      const first = ym + '-01';
      const last  = ym + '-' + String(new Date(m.getFullYear(), m.getMonth()+1, 0).getDate()).padStart(2, '0');
      let inner = '';
      /* ① ぶち抜きのバー（車検＝3ヶ月／12点＝2ヶ月）
         ⚠ v2.71.1 **1マスぶんしか見えていない時はバーにしない。**
            1マスの幅（74px）に「四角＋作業名＋状態」を1行で入れると必ずはみ出すので、
            その時は下と同じ2行の札で出す（見た目は変わるが、読めなくなるより良い）。 */
      const b = barAt[mi];
      if (b && b.span > 1){
        inner += '<div class="fl-bar3 ' + b.it.state + '" style="width:calc(' + FL_COL_M + 'px * ' + b.span + ' - 12px)"'
               + ' title="' + _fleetEsc(b.it.title) + '"'
               + ' onclick="event.stopPropagation();flMaintGoto(\'' + v.id + '\',\'' + ym + '\')">'
               + _flMbInner(b.it) + '</div>';
      } else if (b){
        inner += '<div class="fl-mb ' + b.it.state + '" title="' + _fleetEsc(b.it.title) + '"'
               + ' onclick="event.stopPropagation();flMaintGoto(\'' + v.id + '\',\'' + ym + '\')">'
               + _flMbInner(b.it) + '</div>';
      }
      /* ② 1ヶ月ぶんの札（12点・一般・B.P、超過） */
      items.forEach(function(it){
        if (it.bar) return;
        if (it.months.indexOf(ym) < 0) return;
        inner += '<div class="fl-mb ' + it.state + '" title="' + _fleetEsc(it.title) + '"'
               + ' onclick="event.stopPropagation();flMaintGoto(\'' + v.id + '\',\'' + ym + '\')">'
               + _flMbInner(it) + '</div>';
      });
      /* ③ 期限＝札にしない。左に赤い縦線の1行（やること／期限を形で分ける）
         🔴 v2.71.0（ゆうた指定 2026-09-05）**12点の日付は出さない。**
            🗣「12点は満了日の記載はいらない。あくまで位だから」
            ＝ 12ヶ月点検に「満了日」は無い。満了日の1年前という**目安**でしかないので、
              日付を書くと「その日までにやらないといけない」と読み違える。
            ＝ 12点は**2ヶ月ぶんの帯**（やること）だけで出す。日付を主張しない。
         ⚠ 車検の満了日は**本物の期限**なので、ここは残す。 */
      if (v.shakenDate && String(v.shakenDate).slice(0,7) === ym)
        inner += '<div class="fl-due" title="車検の満了日">満了 ' + _flMd(v.shakenDate) + '</div>';
      /* ④ 自由イベント＝小さい丸＋名前ぜんぶ（4文字で切らない） */
      /* 🔴 v2.70.1 ここで `!x.auto` を書かない。**物差し（loaner-free.js）が弾く。**
         ⚠ 画面側で隠していたせいで、隠していない代車カレンダーにだけ残って見えていた。同じことを繰り返さない。 */
      pitLoanerSpan(v.id, first, last, { kinds:['event'] })
        .forEach(function(x){
          inner += '<div class="fl-ev" title="' + _fleetEsc(x.from + '〜' + x.to) + '"'
                 + ' onclick="event.stopPropagation();flOpenEventModal(null,null,\'' + x.id + '\')">'
                 + '<i style="background:' + x.color + '"></i><span>' + _fleetEsc(x.label) + '</span></div>';
        });
      h += '<div class="fl-cal-cell' + (padAt[mi] ? ' barpad' : '') + '"'
         + ' onclick="flOpenEventModal(\'' + v.id + '\',\'' + first + '\')">' + inner + '</div>';
    });
   });
  });
  h += '</div></div>';
  return h;
}

/* 日モードのカレンダー（1列＝1日・代車の利用状況を透かし表示） */
function flDayCalHtml(y, mo){
  const last = new Date(y, mo+1, 0).getDate();
  const ymP = y + '-' + String(mo+1).padStart(2, '0');
  const first = ymP + '-01', lastDs = ymP + '-' + String(last).padStart(2, '0');
  const metas = [];
  for (let d = 1; d <= last; d++){
    const dt = new Date(y, mo, d);
    const ds = ymP + '-' + String(d).padStart(2, '0');
    /* 🚫 v1.50.0 休みは MHS の定休日カレンダー（PitCal）が基準 */
    metas.push({ d: d, ds: ds, dow: dt.getDay(), hol: (window.Holidays && Holidays.name(ds)) || null,
                 closed: (window.PitCal ? PitCal.isClosed(ds) : false) });
  }
  let h = '<div class="fl-cal-wrap" id="fl-cal-scroll"><div class="fl-cal fl-cal-new" style="grid-template-columns:'
        + FL_COL_NAME + 'px repeat(' + last + ', ' + FL_COL_D + 'px)">';
  h += '<div class="fl-cal-h fl-cal-corner">車両</div>';
  metas.forEach(function(m){
    h += '<div class="fl-cal-h' + (m.dow === 0 ? ' sun' : (m.dow === 6 ? ' sat' : '')) + (m.hol ? ' fl-holh' : '') + (m.closed ? ' fl-closedh' : '') + '"' + (m.hol ? ' title="' + _fleetEsc(m.hol) + '"' : '') + '>' + m.d + '<span>' + '日月火水木金土'[m.dow] + (m.closed ? '・休' : '') + (m.hol ? '・祝' : '') + '</span></div>';
  });
  _flVehSections().forEach(function(sec){
   h += _flSecRow(sec.label);
   sec.arr.forEach(function(v){
    const isLoanerVeh = (state.loaners || []).some(function(l){ return l.id === v.id; });
    const _hl = (_flHlVeh && _flHlVeh === v.id) ? ' fl-hl' : '';   /* 🔧 ボードから飛んできた車 */
    h += '<div class="fl-cal-name' + _hl + '" title="' + _fleetEsc(v.model || '') + '">' + _fleetEsc(_flVehName(v)) + '</div>';
    /* 🔴 整備の枠は「日ごとの細切れ」をやめて、**期間ぜんぶを1本のバー**で描く。
       ⚠ 飛び地は本数ぶんバーが並ぶ＝何本あるか数えられる。
       ⚠ バーは上の 22px だけ。その下はなぞり（候補のドラッグ選択）のために空けてある。 */
    const bars = (window.pitMaintDayBars ? pitMaintDayBars(v.id, first, lastDs) : []);
    const barAt = {}, padAt = {};
    bars.forEach(function(b){
      const s = +b.clipFrom.slice(8) - 1, e = +b.clipTo.slice(8) - 1;
      barAt[s] = { b: b, span: e - s + 1 };
      for (let i = s; i <= e; i++) padAt[i] = 1;
    });
    metas.forEach(function(m, di){
      const ds = m.ds;
      const day = pitLoanerDay(v.id, ds);
      let cls = 'fl-cal-cell fl-day' + _hl + (m.closed ? ' fl-closedc' : '') + (m.hol ? ' fl-holc' : '');
      let inner = '';
      /* 代車の貸出・仮押さえ＝マスの薄い色（整備のバーと満了はこの上に乗る） */
      if (isLoanerVeh){
        const it = day.lends[0] || day.holds[0] || null;
        if (it){
          cls += ' fl-use' + (it.kind === 'hold' ? ' fl-hold' : '');
          if (it.isStart) inner += '<div class="fl-use-tag">'
            + _fleetEsc(it.kind === 'hold' ? ('仮 ' + (it.memo || '仮押さえ')) : it.label) + '</div>';
        }
      }
      /* 🔴🔴 満了日・12点の日は**マスごと塗る**（ゆうた指定「逆に最も目立つぐらいじゃないと」）
         ＝ その日を過ぎたら車検が切れる日。細い線では気づけない。 */
      /* 🔴 v2.71.0 **12点の日は塗らない**（ゆうた指定「あくまで位だから」）。
         ＝ 目安の日をマスごと橙に塗ると「この日が期限」に見える。12点にその日は無い。
         ⚠ 車検の満了日だけ残す。こちらは**その日を過ぎたら切れる**本物の期限。 */
      if (v.shakenDate === ds){ cls += ' d-exp'; inner += '<div class="fl-big">満了<small>' + _flMd(ds) + '</small></div>'; }
      if (padAt[di]) cls += ' barpad';
      const bb = barAt[di];
      if (bb){
        /* 🔴 v2.71.1（ゆうた報告「テキストが1せるだと入り切ってない」）**幅で出す字を変える。**
           日ビューの列は 56px。1日だけの枠はバーの内側が **26px しか無い**ので、
           作業名を入れると必ず切れる。
             1日  … 四角だけ（何の作業かは色で分かる。名前と期間はカーソルを乗せると出る）
             2日〜… 四角＋作業名
             4日〜… 四角＋作業名＋状態
           ⚠ 予定か確定かは**色**が言っている（凡例に出してある）ので、字が消えても意味は落ちない。
           ⚠ 字を小さくして詰め込まない（11.5px は決めごと）。**入る物だけ出す。** */
        const _w = bb.span;
        inner = '<div class="fl-bar3 ' + bb.b.state + (_w < 2 ? ' tiny' : '')
              + (bb.b.cutL ? ' cutL' : '') + (bb.b.cutR ? ' cutR' : '') + '"'
              + ' style="width:calc(' + FL_COL_D + 'px * ' + bb.span + ' - 12px)"'
              + ' title="' + _fleetEsc(bb.b.title) + '"'
              + ' onclick="event.stopPropagation();flMaintChip(\'' + bb.b.id + '\')">'
              + '<i class="fl-dot ' + bb.b.workDot + '"></i>'
              + (_w >= 2 ? '<b>' + _fleetEsc(bb.b.workShort) + '</b>' : '')
              + (_w >= 4 ? '<span class="st">' + _fleetEsc(bb.b.stateLabel) + '</span>' : '')
              + '</div>' + inner;
      }
      /* 自由イベント＝丸＋名前ぜんぶ */
      day.events.forEach(function(x){   /* ⚠ 自動のぶんは物差しが弾く（v2.70.1）。ここで数えない */
        inner += '<div class="fl-ev" onclick="event.stopPropagation();flOpenEventModal(null,null,\'' + x.id + '\')">'
               + '<i style="background:' + x.color + '"></i><span>' + _fleetEsc(x.label) + '</span></div>';
      });
      h += '<div class="' + cls + '" data-fv="' + v.id + '" data-fd="' + ds + '">' + inner + '</div>';
    });
   });
  });
  h += '</div></div>';
  return h;
}

/* 🔴🔴 v2.63.1（ゆうた報告 2026-09-05「車両管理で見るをクリックしても管理ビューに飛ばない」）
   **別の画面から来た時は、画面を切り替えてから描く。**
   ◎なぜ抜けていたか
     ここを呼ぶのは長いあいだ**車両管理の中（月ヘッダ・作業予定ボード）だけ**だったので、
     もう車両管理を見ている前提で `renderFleet()` しか呼んでいなかった。
     ＝ v2.63.0 で**当日ビューから呼ぶ道**を作った瞬間に、
       「見えていない車両管理を描き直して、画面はそのまま」になっていた（押しても何も起きない）。
   🔴 日ビューの中身（`_flMode` / `_flDay` / `_flHlVeh`）は**この関数より前に決めておく**
      ＝ `showView` が描く時にはもう効いている（二度描きしない）。
   ⚠ すでに車両管理を見ている時は `showView` を通さない（サイドバーの点滅・スクロール位置の巻き戻しを避ける）。 */
function _flGoFleet(){
  if (window.state && state.currentView === 'fleet'){ renderFleet(); return; }
  if (window.showView) showView('fleet');
  else renderFleet();
}
window._flGoFleet = _flGoFleet;

function flZoom(y, m){ _flMode = 'day'; _flDay = new Date(y, m, 1); _flGoFleet(); }
/* 🔧 v2.44.0 作業予定ボードから「日を決める」＝**日ビューに切り替えて、その車の行をアクティブに**する。
   ⚠ 代車カレンダーへは飛ばさない（ゆうた指定「今も管理カレンダーの月をクリックすると日ビューにかわる仕様、
      それをそのまま使うイメージで」）。 */
window.flZoomTo = function(vehId, y, m){
  _flHlVeh = vehId || '';
  _flMode = 'day'; _flDay = new Date(y, m, 1);
  _flGoFleet();   /* 🔴 v2.63.1 別の画面（当日ビュー）から来ることがある。上の注記を参照 */
  setTimeout(function(){
    var el = document.querySelector('.fl-cal-name.fl-hl');
    if (el && el.scrollIntoView) el.scrollIntoView({ block:'center' });
  }, 0);
};
function flBackMonth(){ _flMode = 'month'; renderFleet(); }
/* 🔧 v2.52.0 日ビューのまま隣の月へ（月をまたぐ整備の候補を置くため）。
   ⚠ `_flHlVeh`（どの車を触っているか）は消さない。消すと、月を動かした瞬間にどの行か分からなくなる。 */
function flDayShift(n){
  _flDay = new Date(_flDay.getFullYear(), _flDay.getMonth() + (n || 0), 1);
  renderFleet();
  setTimeout(function(){
    var el = document.querySelector('.fl-cal-name.fl-hl');
    if (el && el.scrollIntoView) el.scrollIntoView({ block:'center' });
  }, 0);
}
window.flDayShift = flDayShift;

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
  if (!vehicleId || !from){ pitAlert('車両と開始日を入れてください', { code:'PF-3030' }); return; }
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
  /* 🔴 v2.70.1 いま見ている画面も描き直す。
     ⚠ この窓は**代車カレンダーからも開く**ようになった（前は車両管理からだけ）。
        `renderFleet()` だけだと、代車カレンダーで消しても消えたように見えない。 */
  if (window.state && state.currentView && state.currentView !== 'fleet' && window.showView) showView(state.currentView);
}
function flEventDelete(){
  if (!_flEvtEditId) return;
  pitAsk('このイベントを削除しますか？', { danger:true, ok:'削除する' }).then(function(yes){
    if (!yes) return;
    state.fleetEvents = _flEvents().filter(function(e){ return e.id !== _flEvtEditId; });
    if (window.PitDB) PitDB.save();
    flEventClose();
    renderFleet();
    if (window.state && state.currentView && state.currentView !== 'fleet' && window.showView) showView(state.currentView);
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
  /* 🔗 v2.62.0 ナンバーを直したら、下の紐づけ欄の候補も出し直す。
     ⚠ 探している最中（探す欄に文字が入っている）は書き換えない＝打っている手を止めない */
  const _q=(document.getElementById('fl-link-q')||{}).value||'';
  if(!_q.trim()) _flLinkRender();
};

/* =====================================================================
   🔗 顧客車両との紐づけ（v2.62.0・ゆうた指定 2026-09-05）
   ---------------------------------------------------------------------
   🗣「代車の設定画面から紐づけ設定欄を作成する」／（選び方）「ナンバーの候補を出す」
   🗣（入庫時の自動紐づけは）「やめる（手で設定したものだけ）」

   🔴 **結ばれているかの判定はここに書かない。** `js/fleet-link.js` の物差し1本を呼ぶだけ。
   🔴 **窓を閉じるまで保存しない。** 選んでも `_flLink` に控えるだけで、書くのは「保存」を押した時。
      ＝ 途中でやめた時に結び目だけ残る、が起きない。
   🔴 **お客様の車1台に、自社の車は1台まで。** もう掴まれている車は押せない形で出す
      （押せてしまうと、顧客ビューの印がどちらの車のものか分からなくなる）。
   ===================================================================== */
let _flLink = { custId:'', custVehId:'' };

function _flLinkVehText(v){
  return _fleetEsc(((v.maker?v.maker+' ':'')+(v.car||'')).trim()||'—');
}
function _flLinkRow(x){
  const nm  = _fleetEsc(x.cust.name||x.cust.kana||'(無名)');
  const pl  = _fleetEsc(x.veh.plate||'ナンバーなし');
  const car = _flLinkVehText(x.veh);
  const held = (window.pitFleetHeldBy) ? pitFleetHeldBy(x.cust.id, x.veh.id, _fleetEditId||'') : null;
  const main = '<div class="fl-link-main"><b>'+nm+' 様</b><span>'+pl+'　'+car+'</span></div>';
  if(held){
    const who = _fleetEsc(window.pitFleetBadgeText ? pitFleetBadgeText(held.kind, held.v) : '別の車');
    return '<div class="fl-link-cand held">'+main+'<span class="fl-link-held">'+who+'に紐づけ済み</span></div>';
  }
  return '<button type="button" class="fl-link-cand" onclick="flLinkPick(\''+_fleetEsc(x.cust.id)+'\',\''+_fleetEsc(x.veh.id)+'\')">'
       + main + '<span class="fl-link-go">紐づける</span></button>';
}
function _flLinkRender(){
  const box = document.getElementById('fl-link');
  if(!box) return;
  const tgt = window.pitFleetLinkTarget ? pitFleetLinkTarget({ custId:_flLink.custId, custVehId:_flLink.custVehId }) : null;
  let h = '';
  if(tgt){
    h += '<div class="fl-link-on"><i data-ic=link data-ics=15></i>'
       + '<div class="fl-link-main"><b>'+_fleetEsc(tgt.cust.name||tgt.cust.kana||'(無名)')+' 様</b>'
       + '<span>'+_fleetEsc(tgt.veh.plate||'ナンバーなし')+'　'+_flLinkVehText(tgt.veh)+'</span></div>'
       + '<button type="button" class="fl-link-off" onclick="flLinkClear()">紐づけを外す</button></div>';
    box.innerHTML = h;
    if(window.icHydrate) { try { icHydrate(box); } catch(e){} }
    return;
  }
  /* 🔴 前に結んでいた相手が消えている時は、黙って空にしない（気づけなくなる） */
  if(_flLink.custId || _flLink.custVehId){
    h += '<div class="fl-link-warn">前に紐づけていたお客様の車が見つかりません（消された／まとめられた可能性）。選び直してください。</div>';
  }
  const plate = _flPlateJoin();
  const cands = window.pitFleetPlateCands ? pitFleetPlateCands(plate) : [];
  if(cands.length){
    h += '<div class="fl-link-lead">この車のナンバーで見つかりました。</div>';
    if(cands.length>1) h += '<div class="fl-link-warn">同じナンバーが '+cands.length+' 件あります。ダブりかもしれません。どれか選んでください。</div>';
    h += '<div class="fl-link-cands">'+cands.map(_flLinkRow).join('')+'</div>';
  } else {
    h += '<div class="fl-link-lead">'+(plate ? 'このナンバーでは顧客控えに見つかりませんでした。' : 'ナンバーを入れると候補が出ます。')+'　お名前でも探せます。</div>';
  }
  h += '<div class="fl-link-find"><input id="fl-link-q" class="fl-in" placeholder="お名前・ナンバー・車種で探す" autocomplete="off" oninput="flLinkSearch()">'
     + '<div class="fl-link-cands" id="fl-link-res"></div></div>';
  box.innerHTML = h;
  if(window.icHydrate) { try { icHydrate(box); } catch(e){} }
}
window.flLinkPick  = function(custId, vehId){ _flLink = { custId:custId||'', custVehId:vehId||'' }; _flLinkRender(); };
window.flLinkClear = function(){ _flLink = { custId:'', custVehId:'' }; _flLinkRender(); };
window.flLinkSearch = function(){
  const q = (document.getElementById('fl-link-q')||{}).value||'';
  const box = document.getElementById('fl-link-res');
  if(!box) return;
  const res = (q.trim() && window.pitFleetSearch) ? pitFleetSearch(q, 12) : [];
  box.innerHTML = !q.trim() ? '' : (res.length ? res.map(_flLinkRow).join('') : '<div class="fl-link-lead">見つかりませんでした。</div>');
  if(window.icHydrate) { try { icHydrate(box); } catch(e){} }
};
document.addEventListener('mousedown', function(e){
  const box=document.getElementById('fl-plate');
  if(box && box.classList.contains('open') && !box.contains(e.target)) box.classList.remove('open');
});
/* 🔴🔴 v2.70.1 **車を保存した時に「車検入庫」「12ヶ月点検」を自動で作るのはやめた。**
   ◎前まで … 保存のたびに `auto_<車id>_shakenIn` / `_tenken` を `fleetEvents` に作っていた。
     v1.12 の、まだ整備の仕組みが無かったころの作り。
   ◎なぜやめたか … 同じことを**整備の枠（カード）が全部やっている**。二重に持つと必ず食い違う。
     しかも車両カレンダーは画面側で「自動のぶんは隠す」としていただけなので、
     **代車カレンダーにだけ古い車検の予定が残って見えていた**（ゆうた報告 2026-09-05）。
     消しても、車を保存した瞬間に**また作られて**いた。
   ⚠ 残っている古いぶんは、下の `pitCleanupAutoVehEvents` が画面を開いた時に片付ける。
   ⚠ 手で入れた「車検入庫」には自動の印が付かない＝**そのまま残る**（人が入れたものは勝手に消さない）。 */

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
        /* 🔗 v2.65.0（ゆうた指定）**「顧客紐づけ：🔗済み　カルテNo」ぐらいの内容で。**
           ⚠ 結ばれていない時も**行を空にしない**（空だと「項目が無い」のか「まだ結んでいない」のか分からない）。
           ⚠ お名前・ナンバー・車種はここに出さない（v2.64.0 は出していたが「うるさい」）＝
              誰と結んであるかは title に回す。カルテNo は**その車を指す番号**なので出す。 */
        + row('顧客紐づけ', (function(){
            var lk = window.pitFleetLinkTarget ? pitFleetLinkTarget(v) : null;
            if (!lk) return '<span class="fd-nolink" title="編集 ▸「顧客車両との紐づけ」から結べます">未紐づけ</span>';
            var kt = String(lk.veh.karteNo || '').trim();
            /* 🔗 v2.66.0（ゆうた指定）**カルテNo を押すと、そのお客様の車両一覧（顧客詳細）へ飛ぶ。** */
            return '<span class="fd-linked" title="' + e((lk.cust.name || lk.cust.kana || '(無名)') + ' 様') + '">'
                 + '<i data-ic=link data-ics=13></i>済み</span>'
                 + (kt ? '<button type="button" class="fd-linkkarte" onclick="fleetGoCustomer(\'' + e(v.id) + '\')"'
                       + ' title="押すと、このお客様の車両一覧へ飛びます">' + e(kt) + '</button>' : '');
          })())
        /* v1.14.5：代車／社用車のどちらでも同じ項目を出す */
        + row('区分', e(cat))
        + (seatTxt ? row('定員', e(seatTxt)) : '')
        + row('寸法', [v.length != null ? '長 ' + e(v.length) : '', v.width != null ? '幅 ' + e(v.width) : '', v.height != null ? '高 ' + e(v.height) : ''].filter(Boolean).join(' / ') + (v.height != null || v.width != null || v.length != null ? ' cm' : ''))
        + row('車検満了', v.shakenDate ? e(window.pitWareki ? pitWareki(v.shakenDate) : v.shakenDate) : '')
        + row('12ヶ月点検', tk ? (e(window.pitWareki ? pitWareki(tk, 'ym') : tk) + '<span class="fd-auto">（車検の1年前／1年後・自動）</span>') : '')
        + '</table>'
        + '<div class="fd-opts">' + opt(v.etc, 'ETC') + opt(v.navi, 'ナビ') + opt(v.iso, 'ISO') + opt(v.camera, 'Bカメ') + '</div>'
        /* 🔴 v2.66.0（ゆうた指定 2026-09-05）**一番下の列に「履歴」「作業予定」を足した。**
           ・履歴 …… 顧客ビューの履歴を、**この車で絞った状態**で開く（紐づけていないと相手が分からないので押せない）
           ・作業予定 … **この車でワンタイムの作業予定**を足す窓（作業予定ボードの「＋ 予定を足す」と同じ窓）
           🔴 飛び先はどちらも既存の1本を呼ぶだけ（`custHistory` ／ `flMaintAdd`）。ここで組み立てない。 */
        + '<div class="fd-btns"><button class="vh-btn" onclick="fleetCloseDetail()">閉じる</button>'
        + '<button class="vh-btn" onclick="fleetGoHistory(\'' + v.id + '\')"'
          + (window.pitFleetLinked && pitFleetLinked(v) ? '' : ' disabled title="先に「顧客車両との紐づけ」で結んでください"')
          + '><i data-ic=clock data-ics=16></i> 履歴</button>'
        + '<button class="vh-btn" onclick="fleetCloseDetail();flMaintAdd(\'' + v.id + '\')"><i data-ic=wrench data-ics=16></i> 作業予定</button>'
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
/* 🔗 v2.66.0（ゆうた指定 2026-09-05）スペック表からお客様側へ渡る2本。
   🔴 **飛び先は customers.js の1本を呼ぶだけ**（履歴の絞り込みも顧客詳細も、あちらの作りをそのまま使う）。
   🔴 先に顧客ビューへ切り替える＝開いた窓を閉じた時に、**顧客一覧に戻る**（車両管理に取り残されない）。
      ⚠ v2.63.1 と同じ形＝「中身を出す関数は、画面の切り替えを持っていない」。 */
function _flToCustomer(id, then){
  var f = _fleetFind(id); if (!f) return null;
  var lk = window.pitFleetLinkTarget ? pitFleetLinkTarget(f.v) : null;
  if (!lk){
    pitAlert('この車は、お客様の車と紐づいていません', { code:'PF-3068',
      detail:'編集 ▸「顧客車両との紐づけ」で結ぶと、お客様の履歴や車両一覧へ行けるようになります。' });
    return null;
  }
  fleetCloseDetail();
  if (window.showView) showView('customers');
  then(lk);
  return lk;
}
window.fleetGoHistory = function (id) {
  _flToCustomer(id, function(lk){
    if (window.custHistory) custHistory(lk.cust.id, lk.veh.id);   /* 🔴 この車で絞った履歴 */
  });
};
window.fleetGoCustomer = function (id) {
  _flToCustomer(id, function(lk){
    if (window.custOpen) custOpen(lk.cust.id);                    /* 🔴 そのお客様の車両一覧 */
  });
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
/* 🔴🔴 v2.70.1（ゆうた報告 2026-09-05）
   **アプリが勝手に作った古い予定を、画面を開いた時に片付ける。**
   🗣「この代車に整備の仕組みになる以前の車検の予定みたいのが代車カレンダーに何個か残ってるんだよね」
   ◎正体 … v1.12 のころ、車を保存するたびに作っていた `auto_<車id>_shakenIn` / `_tenken`。
     ・車両カレンダーは画面側で隠していた（v2.46.0「今元のバッチとダブっちゃってる」の時）
     ・**代車カレンダーは隠していなかった**＝そこにだけ残って見えていた
     ・しかも車を保存するたびに作り直されていたので、消しても戻ってきた
   ◎いま … 作るのをやめた（上の注記）＋**残っているぶんはここで消す**。
   ⚠ 消すのは**自動の印（auto）が付いているものだけ**。
      手で入れた「車検入庫」「12ヶ月点検」は**そのまま残る**（人が入れたものは勝手に消さない）。
   ⚠ 前の名前は「点検を貼り直す」だった。**やることが逆になったので名前も変えた。**
      呼ぶ側＝車両管理（renderFleet）と代車カレンダー（renderLoaner）の2ヶ所。 */
window.pitCleanupAutoVehEvents = function () {
  if (typeof state === 'undefined' || !state) return false;
  const evs = _flEvents();
  const before = evs.length;
  const keep = evs.filter(function (e) { return !(e && e.auto); });
  if (keep.length === before) return false;
  state.fleetEvents = keep;
  try {
    if (window.pitLog) pitLog('前の仕組みの車検・点検の予定を片付けた（' + (before - keep.length) + '件）',
      { auto: true, kind: 'auto' });
  } catch (e) {}
  if (window.PitDB && PitDB.save) { try { PitDB.save(); } catch (e) { console.warn('[fleet] 古い予定の片付けで保存できず', e); } }
  return true;
};

function fleetOpenModal(id){
  _fleetEditId = id || null;
  const f = id ? _fleetFind(id) : null;
  const v = f ? f.v : {};
  document.getElementById('fl-modal-title').textContent = f ? '車両を編集': '＋ 車両を追加';
  /* 🔴 v1.144.0（ゆうた指定 2026-08-19）
     🗣「**1回でも貸出実績がある代車には「消去」という概念が当たらないようにして。引退のみにしよう**」
     ＝ 貸したことがある代車は**消せない**。列から外したい時は**引退**にする（履歴はそのまま残る）。
     ⚠ 顧客・車両・予約カードの**アーカイブと同じ考え方**。「消す」ではなく「もう使わない状態にする」。
     ⚠ 一度も貸していない代車（間違えて登録した等）は、今までどおり削除できる。 */
  var _db = document.getElementById('fl-del-btn');
  if (_db) {
    _db.style.display = f ? '' : 'none';
    if (f) {
      var _used = _flUsedCount(id);
      if (f.v.retired) {
        _db.className = 'vh-btn';
        _db.innerHTML = '<i data-ic=undo data-ics=16></i> 引退を取り消す';
        _db.onclick = function(){ fleetUnretire(id); };
      } else if (_used > 0) {
        _db.className = 'vh-btn';
        _db.innerHTML = '<i data-ic=box data-ics=16></i> この車両を引退させる';
        _db.onclick = function(){ fleetRetire(id); };
      } else {
        _db.className = 'vh-btn del';
        _db.innerHTML = '<i data-ic=trash data-ics=16></i> この車両を削除';
        _db.onclick = function(){ fleetDelete(id); };
      }
      if (window.icHydrate) { try { icHydrate(_db); } catch(e){} }   /* 線画アイコンを描く（全アプリ共通の部品） */
    }
  }
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
  /* 🔗 v2.62.0 顧客車両との紐づけ。⚠ 保存を押すまでは控え（_flLink）にしか入れない */
  _flLink = { custId: (v.custId||''), custVehId: (v.custVehId||'') };
  _flLinkRender();
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
    pitAlert('保存できませんでした。\n' + (err && err.message ? err.message : err), { code:'PF-3032' });
    return;
  }
  if (okId === false) return;   /* 入力もれ＝入れ直してもらうので、開いたまま */
  try { fleetCloseModal(); } catch (e) { console.error('[fleet] 閉じるでエラー', e); }
  try { renderFleet(); }
  catch (e) {
    console.error('[fleet] 画面の描き直しでエラー', e);
    if (window.showToast) showToast('保存しました（画面の更新でつまずいたので、開き直してください）', 'PF-3033');
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
  if (!model){ pitAlert('車種名を入れてください（例：タント）', { code:'PF-3031' }); return false; }   /* false＝保存していない（閉じない） */
  /* 🔗 v2.62.0 お客様の車1台に、自社の車は1台まで。
     ⚠ 窓を開けている間に別の端末が結んだ時のため、**保存の時にもう一度見る**（画面の中だけの判定にしない）。 */
  if (_flLink.custId && _flLink.custVehId && window.pitFleetHeldBy){
    const _held = pitFleetHeldBy(_flLink.custId, _flLink.custVehId, _fleetEditId || '');
    if (_held){
      pitAlert('その車は「' + (window.pitFleetBadgeText ? pitFleetBadgeText(_held.kind, _held.v) : '別の車') + '」にもう紐づいています',
        { code:'PF-3065', detail:'お客様の車1台に紐づけられる自社の車は1台までです。先に向こうの紐づけを外してください。' });
      return false;
    }
  }
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
      /* 🔗 v2.62.0 紐づけ。外した時は欄ごと消す（空文字を残すと「結んである」と読み違える元） */
      if (_flLink.custId && _flLink.custVehId){ f.v.custId=_flLink.custId; f.v.custVehId=_flLink.custVehId; }
      else { delete f.v.custId; delete f.v.custVehId; }
    }
  } else {
    const id = (kind === 'loaner' ? 'L' : 'C') + Date.now().toString(36);
    const rec = { id:id, name:labelName, number:number, model:model, color:color, plate:plate, shakenDate:shaken,
      height:height, width:width, length:length, category:category, seats:seats, etc:etc, navi:navi, iso:iso, camera:camera };
    if (dupLoaner && repDate){ rec.replaceOf = dupLoaner.id; rec.replaceDate = repDate; }
    /* 🔗 v2.62.0 紐づけ（選んでいる時だけ書く） */
    if (_flLink.custId && _flLink.custVehId){ rec.custId=_flLink.custId; rec.custVehId=_flLink.custVehId; }
    (kind === 'loaner' ? state.loaners : state.companyCars).push(rec);
    _fleetEditId = id;   /* v1.14.2：万一もう一度押されても、増やさずに同じ車両を直す */
    // 入替予定＝旧車のカレンダーに「代車入替」イベント（〜入替日）＋新車にも開始予定
    if (dupLoaner && repDate){
      _flEvents().push({ id:'rep_'+id, vehicleId:dupLoaner.id, type:'lease', label:'代車'+number+'入替→新車へ', fromDate:ymd(new Date()), toDate:repDate });
    }
  }
  if (window.PitDB) PitDB.save();
  return _fleetEditId;   /* 閉じる・描き直しは呼び出し元（fleetSubmit）でやる */
}
/* =====================================================================
   🚙 貸出履歴（v1.145.0・ゆうた指定 2026-08-19）
   ---------------------------------------------------------------------
   🗣「代車管理の下部に**履歴一覧という専用ページ**を作成。そこに**テキストベースでいいから、
   　　過去を含めて がーーーーーーっと全履歴が残る**イメージがいいかな」
   🗣（並びは？）「**新しい順＋代車で絞れる**」

   ◎なぜ要るか
     🔴 **引退させた代車は代車カレンダーから列ごと消える**（`_loFiltered`）。
     　 ＝ 引退にした瞬間、その代車の過去の貸出も**画面からは追えなくなっていた**（データは残っている）。
     カレンダーは「いま貸せる車」だけを見る所のままにして、**過去はここで全部追える**ようにする。

   ◎出すもの
     ・**全部**（引退した代車のぶんも／予約以外で貸したぶんも／緊急車両のぶんも）
     ・貸した日の**新しい順**
     ・上のボタンで**代車ごとに絞れる**（引退した代車もボタンに出す）
   ◎作りの決めごと
     ⚠ **見るだけ。**ここから消したり直したりはできない（v1.143.0「返却済みは不可侵」の続き）。
     ⚠ 数える所（何日間・返却済みか）は**貸出の札に書いてある内容だけ**を使う。ここで計算し直さない。
   ===================================================================== */
let _flHistLo = '';
/* 🔧 v2.44.0 作業予定ボードから飛んできた車（日ビューで行を光らせる）。画面の中だけ・保存しない */
let _flHlVeh = '';
let _flHistOpen = false;  /* 🔴 v1.146.0（ゆうた指定）**最初はたたんでおく。**開いたかどうかも画面の中だけ */

window.flHistToggle = function(){
  _flHistOpen = !_flHistOpen;
  renderFleet();
};
/* 🔴 v1.146.0（ゆうた指定）「代車検索はチップじゃなくてプルダウンで。
   　 今後も含めるとかなりの台数になっていくと思う」＝台数が増えても縦に伸びない形にした。 */
window.flHistFilter = function(id){
  _flHistLo = id || '';
  renderFleet();
};

function _flHistDays(a){
  if (!a || !a.fromDate || !a.toDate) return null;
  const f = new Date(a.fromDate), t = new Date(a.toDate);
  if (isNaN(f.getTime()) || isNaN(t.getTime())) return null;
  return Math.round((t - f) / 86400000) + 1;   /* 両端を含む */
}
function _flHistMD(ds){
  if (!ds) return '—';
  const p = String(ds).split('-');
  return p.length === 3 ? (p[0].slice(2) + '/' + (+p[1]) + '/' + (+p[2])) : String(ds);
}
/* その貸出は誰のものか。予約から作った札はカードのお客様名、手動・緊急は札に入れた名前。 */
function _flHistWho(a){
  const card = a.cardId ? (state.cards || []).find(function(c){ return c.id === a.cardId; }) : null;
  if (card) return (window.pitCustName ? pitCustName(card) : (card.customer || '')) || '（未入力）';
  return a.customer || (a.emergency ? '（緊急）' : '（予約以外）');
}
function _flHistCar(a){
  const card = a.cardId ? (state.cards || []).find(function(c){ return c.id === a.cardId; }) : null;
  return (card && card.car) || a.car || '';
}
function _flHistLoName(id){
  const l = (state.loaners || []).find(function(x){ return x.id === id; });
  if (!l) return '（消えた代車）';
  return (window.pitVehLabel ? pitVehLabel(l) : (l.model || l.name || id));
}

function _flHistoryHtml(){
  /* 🅿 v2.40.0 貸出履歴に仮押さえは出さない（貸した記録ではない） */
  const all = (state.loanerAssigns || []).filter(function(a){ return a && !a.hold; });
  /* 新しい順（貸した日）。同じ日なら返却日の新しい順 */
  all.sort(function(a, b){
    const x = String(b.fromDate || ''), y = String(a.fromDate || '');
    if (x !== y) return x < y ? -1 : 1;
    return String(b.toDate || '') < String(a.toDate || '') ? -1 : 1;
  });
  const list = _flHistLo ? all.filter(function(a){ return a.loanerId === _flHistLo; }) : all;

  /* 🔴 v1.146.0 最初はたたんでおく（見出しをクリックで開く）。
     ⚠ 台数と件数が増えていく一覧なので、開いたままだと車両リストが遠くなる。 */
  let h = '<div class="fl-card fl-hist' + (_flHistOpen ? ' open' : '') + '">';
  h += '<div class="fl-h fl-hist-h" onclick="flHistToggle()" title="クリックで開く・閉じる">'
     + '<span class="fl-hist-caret">' + (_flHistOpen ? '▼' : '▶') + '</span>'
     + '<i data-ic=clock data-ics=16></i> 貸出履歴（' + all.length + '件）'
     + '<span class="fl-note">引退した代車のぶんも、予約以外で貸したぶんも全部。見るだけです</span></div>';
  if (!_flHistOpen) return h + '</div>';

  /* 絞り込み＝プルダウン（貸出がある代車だけ・引退も出す） */
  const used = {};
  all.forEach(function(a){ if (a && a.loanerId) used[a.loanerId] = (used[a.loanerId] || 0) + 1; });
  const ids = Object.keys(used).sort(function(x, y){
    const lx = (state.loaners || []).find(function(l){ return l.id === x; });
    const ly = (state.loaners || []).find(function(l){ return l.id === y; });
    return ((lx && lx.number) || 9999) - ((ly && ly.number) || 9999);
  });
  h += '<div class="fl-hist-fil">';
  h += '<label class="fl-hist-lb">代車で絞る</label>';
  h += '<select class="fl-hist-sel" onchange="flHistFilter(this.value)">';
  h += '<option value=""' + (_flHistLo ? '' : ' selected') + '>全部（' + all.length + '件）</option>';
  ids.forEach(function(id){
    const l = (state.loaners || []).find(function(x){ return x.id === id; });
    h += '<option value="' + _fleetEsc(id) + '"' + (_flHistLo === id ? ' selected' : '') + '>'
       + _fleetEsc(_flHistLoName(id)) + (l && l.retired ? '（引退）' : '') + '　' + used[id] + '件</option>';
  });
  h += '</select>';
  if (_flHistLo) h += '<span class="fl-hist-now">' + list.length + '件を出しています</span>';
  h += '</div>';

  if (!list.length){
    h += '<div class="fl-empty">貸出の記録はまだありません</div></div>';
    return h;
  }

  h += '<div class="fl-hist-rows">';
  list.forEach(function(a){
    const d = _flHistDays(a);
    const who = _flHistWho(a);
    const car = _flHistCar(a);
    const lo = (state.loaners || []).find(function(x){ return x.id === a.loanerId; });
    const st = a.returned
      ? '<span class="fl-hist-st done">返却済</span>'
      : '<span class="fl-hist-st now">貸出中</span>';
    h += '<div class="fl-hist-row">'
       + '<span class="fl-hist-lo">' + _fleetEsc(_flHistLoName(a.loanerId))
       +   (lo && lo.retired ? '<span class="fl-hist-ret">引退</span>' : '') + '</span>'
       + '<span class="fl-hist-dt">' + _flHistMD(a.fromDate) + ' 〜 ' + _flHistMD(a.toDate) + '</span>'
       + '<span class="fl-hist-day">' + (d != null ? d + '日' : '') + '</span>'
       + st
       + '<span class="fl-hist-who">' + _fleetEsc(who) + (car ? ' <small>' + _fleetEsc(car) + '</small>' : '') + '</span>'
       + (a.emergency ? '<span class="fl-hist-tag emg">緊急</span>' : (a.manual ? '<span class="fl-hist-tag">予約以外</span>' : ''))
       + (a.purpose ? '<span class="fl-hist-memo">' + _fleetEsc(a.purpose) + '</span>' : '')
       + '</div>';
  });
  h += '</div></div>';
  return h;
}

/* 🔴 v1.144.0 その車の**貸出実績**の件数（返却済みも数える＝「1回でも貸したか」を見る） */
function _flUsedCount(id){
  /* 🅿 v2.40.0 仮押さえは「貸した」ではないので数えない */
  return (state.loanerAssigns || []).filter(function(a){ return a && !a.hold && a.loanerId === id; }).length;
}
window._flUsedCount = _flUsedCount;

/* 🔴 v1.144.0 引退させる＝列から外すだけ。**貸出の記録も、その車の登録も消さない。**
   ⚠ 空き判定は引退を除くようになっているので（v1.80.0）、引退にした時点で新しくは貸せない。
   ⚠ 入口を作ったら出口も作る（R3）＝「引退を取り消す」も同じボタンの場所に出す。 */
function fleetRetire(id){
  const f = _fleetFind(id);
  if (!f) return;
  const used = _flUsedCount(id);
  pitAsk('「' + f.v.name + '」を引退させますか？', {
    ok: '引退させる',
    detail: 'これから新しく貸せなくなります。\n'
          + '⚠ **今までの貸出（' + used + '件）はそのまま残ります。**代車カレンダーの履歴も消えません。\n'
          + 'あとから「引退を取り消す」で戻せます。'
  }).then(function(yes){
    if (!yes) return;
    f.v.retired = true;
    f.v.retiredAt = (window.ymd ? ymd(new Date()) : '');
    if (window.PitDB) PitDB.save();
    renderFleet();
    if (window.pitToast) pitToast('「' + f.v.name + '」を引退にしました（記録は残っています）');
  });
}
window.fleetRetire = fleetRetire;

function fleetUnretire(id){
  const f = _fleetFind(id);
  if (!f) return;
  pitAsk('「' + f.v.name + '」の引退を取り消しますか？', { ok:'取り消す', detail:'また貸せるようになります。' }).then(function(yes){
    if (!yes) return;
    f.v.retired = false;
    delete f.v.retiredAt;
    if (window.PitDB) PitDB.save();
    renderFleet();
    if (window.pitToast) pitToast('「' + f.v.name + '」を戻しました');
  });
}
window.fleetUnretire = fleetUnretire;

function fleetDelete(id){
  const f = _fleetFind(id);
  if (!f) return;
  const isLoaner = (f.kind === 'loaner');
  const cnt = isLoaner ? _flUsedCount(id) : 0;
  /* 🔴 v1.144.0 **1回でも貸したことがある代車は消せない**（ゆうた指定）。
     ⚠ ボタンを出し分けるだけにしない＝ここでも止める。外から呼ばれても通らない。
     ⚠ v1.143.0 まではここで貸出を全件 filter で消しており、**返却済みの履歴も一緒に消えていた。**
        「返却済みの貸出は不可侵」という決めごと（v1.143.0）に真っ向から反していた。 */
  if (isLoaner && cnt > 0) {
    pitAlert('「' + f.v.name + '」は ' + cnt + ' 件の貸出があるので消せません。\n'
           + '実際に貸した記録として残します。\n\n'
           + '列から外したい時は「この車両を引退させる」を使ってください。');
    return;
  }
  pitAsk('「' + f.v.name + '」を削除しますか？',
         { danger:true, ok:'削除する', detail:'一度も貸していない車両なので、消しても記録は残りません。' }).then(function(yes){
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

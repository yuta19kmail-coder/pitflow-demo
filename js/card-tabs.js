/* ========================================
   card-tabs.js  -  入庫カードのタブ（基本/フロー/整備/バックオフィス）／PitFlow v0.6.0
   ----------------------------------------
   ・renderCardForm（card-detail.js）から呼ばれる。タブUIと各パネルのHTMLを供給。
   ・sec / secEnd / statusLabel は card-detail.js / views.js の関数を実行時に利用。
   ・_cardTab は card-detail.js 側で宣言（タブの現在地）。
   ======================================== */

function cfTabBtn(id, label){
  return '<button type="button" class="cf-tab' + (_cardTab === id ? ' on' : '') + '" data-tab="' + id + '" onclick="switchCardTab(\'' + id + '\')">' + label + '</button>';
}

function switchCardTab(id){
  _cardTab = id;
  const hostId = (typeof _cardBodyId !== 'undefined') ? _cardBodyId : 'md-body';
  const host = document.getElementById(hostId) || document;
  host.querySelectorAll('.cf-tab').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-tab') === id); });
  host.querySelectorAll('.cf-panel').forEach(function(p){ p.hidden = (p.getAttribute('data-tab') !== id); });
  // 切替時は上端へ（ブレ防止）
  const scroller = (hostId === 'md-body-modal') ? (host.closest('.modal-body') || host) : document.getElementById('main');
  if (scroller) scroller.scrollTop = 0;
}

/* ===== フロー（進捗ログ） ===== */
function fmtFlowTime(ms){
  const d = new Date(ms);
  return (d.getMonth()+1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}
/* 🔴 v1.43.0 「よくあるアクション」の一覧は **js/flow-pit.js（PitFlowLog.QUICK）へ引っ越した**。
      カード詳細と編集で同じものを使うため＝ここに二重に持たない。
   🔴 v1.42.0 の教訓：そこに **HTML（<i data-ic=…>）を書かないこと**。
      ボタンの文字もフローの記録も esc() を通るので、書くと**タグが文字のまま画面に出る**
      （CoreTemplate v1.15.1 と同じ落とし穴）。印は `ic`（アイコン名）で持ち、**描く時に線画へ**。 */
function _flowEsc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
/* タイムライン1行。delIdx を渡すと ✕（手動記録の削除）が付く。 */
function _flowRow(title, detail, delIdx){
  /* 🔴 v1.42.0 すでに保存されている記録には、古い作りのせいで <i data-ic=…> の文字が
     そのまま入っていることがある。**データは書き換えず**、描く時に線画アイコンへ読み替える
     （icoText＝esc したうえでタグと絵文字だけをアイコンに戻す。他アプリと同じ考え方）。 */
  const _ft = (window.icoText ? icoText(title) : _flowEsc(title));
  let r = '<div class="cf-flowrow"><span class="cf-flowdot"></span><div class="cf-flowmain"><div class="cf-flowt">' + _ft + '</div>';
  if (detail) r += '<div class="cf-flowd">' + _flowEsc(detail) + '</div>';
  r += '</div>';
  if (delIdx !== null && delIdx !== undefined){
    r += '<button type="button" class="cf-flowdel" title="この記録を消す" onclick="cfFlowDel(' + delIdx + ')"><i data-ic=close data-ics=16></i></button>';
  }
  return r + '</div>';
}
/* 🔴 v1.43.0 ゆうた指定でこのタブの役目が変わった。
     ・**用件を足すのは「カード詳細」のフロー欄**（ここにはもう置かない）。
     ・ここは「**本当の編集**」＝すでに入っている記録の**日時・担当を書き換える／消す**ところ。
     ・**設定権限（PitFlow の役割＝管理）を持っている人だけ**。ほかの人には今までどおり見えるだけ。
   ⚠ 中身の作りは `js/flow-pit.js`（PitFlowLog）に置いてある＝**記録の形が3通りある**のを
      1か所で吸収するため。ここでは呼ぶだけにすること。 */
function cfFlowHtml(c){
  const canEdit = window.PitFlowLog ? PitFlowLog.canEdit() : true;
  let h = sec('フロー（進捗ログ）' + (canEdit ? ' ― 記録の編集' : ''), '<i data-ic=clock data-ics=16></i>');

  if (canEdit && window.PitFlowLog){
    h += '<div class="cf-flownote"><i data-ic=pencil data-ics=15></i> 記録の<b>日時</b>と<b>担当</b>をここで直せます。手で足した記録は<b>言葉</b>も直せます。'
       + '<br><span class="cf-flownote-sub">用件を足すのは「カード詳細」のフロー欄から。工程の記録（自動）は言葉だけ直せません。</span></div>';
    h += PitFlowLog.editHtml(c);
  } else {
    /* 権限が無い人：今までどおりのタイムライン（見えるだけ） */
    h += '<div class="cf-flownote cf-flownote-lock"><i data-ic=lock data-ics=15></i> 記録を直せるのは<b>設定権限（管理）</b>のある人だけです。'
       + '<br><span class="cf-flownote-sub">用件を足すのは「カード詳細」のフロー欄からどうぞ。</span></div>';
    h += '<div class="cf-flow">';
    if (c.bookedAt)    h += _flowRow('予約受付', c.bookedAt);
    if (c.reserveDate) h += _flowRow('入庫予定', c.reserveDate + (c.reserveTime ? ' ' + c.reserveTime : ''));
    /* 🗑 v2.13.2 もう無い機能の記録は出さない。見分けは pit-share.js の `pitLogGone` 1本。 */
    (c.log || []).filter(function(l){
      return !(window.pitLogGone && pitLogGone(l && (l.label || l.text)));
    }).forEach(function(l){
      const _t = window.PitFlowLog ? PitFlowLog.atText(l) : fmtFlowTime(l.at);
      const _w = window.PitFlowLog ? PitFlowLog.byOf(l) : (l.staff || '');
      /* 🔴 工程の記録は label/text を持っていない＝titleOf を通さないと**見出しが空**になる */
      const _x = window.PitFlowLog ? PitFlowLog.titleOf(l) : (l.label || '');
      h += _flowRow(_x, _t + (_w ? '　・　' + _w : ''), null);
    });
    if (c.returnDate)  h += _flowRow('返車予定', c.returnDate + (c.returnTime ? ' ' + c.returnTime : ''));
    /* 🔴 v1.164.0 カードの状態の言葉は pit-share.js の pitCardStatusText 1本（予約キャンセル／未入庫を言い分ける） */
    h += '<div class="cf-flowrow now"><span class="cf-flowdot"></span><div class="cf-flowmain"><div class="cf-flowt">現在：' + (window.pitCardStatusText ? pitCardStatusText(c) : statusLabel(c.status)) + '</div></div></div>';
    h += '</div>';
  }

  h += '<div class="cf-hint">工程を動かす（タスクのドラッグ／「次へ」）と自動でも記録されます。</div>';
  h += secEnd();
  return h;
}
/* フローの面だけ描き直す＝タブも巻物の位置もそのまま（card-view.js の cvFlowRepaint と対） */
window.cfFlowRepaint = function(){
  const host = document.getElementById((typeof _cardBodyId !== 'undefined' ? _cardBodyId : 'md-body')) || document;
  const panel = host.querySelector('.cf-panel[data-tab="flow"]');
  const c = _flowCard();
  if (panel && c) panel.innerHTML = cfFlowHtml(c);
};
/* ===== 手動アクションログ：追加・削除 =====
   🔴 v1.43.0 中身は **js/flow-pit.js（PitFlowLog）に引っ越した**。
      ここに残しているのは「今までの呼び名」だけ＝古い呼び出しが残っていても動くようにする受け皿。
      **新しく書く時は PitFlowLog を直接呼ぶこと。** */
function _flowCard(){ return state.cards.find(function(x){ return x.id === _editingCardId; }); }
function cfFlowNow(){ if (window.pitFlowNow) pitFlowNow('cv'); }
function cfFlowAdd(label){
  const c = _flowCard(); if (!c || !window.PitFlowLog) return;
  PitFlowLog.add(c.id, label, 'cv');
}
function cfFlowAddQuick(i){
  const c = _flowCard(); if (!c || !window.PitFlowLog) return;
  PitFlowLog.addQuick(c.id, i, 'cv');
}
function cfFlowAddCustom(){
  const c = _flowCard(); if (!c || !window.PitFlowLog) return;
  PitFlowLog.addCustom(c.id, 'cv');
}
function cfFlowDel(i){
  const c = _flowCard(); if (!c || !window.PitFlowLog) return;
  PitFlowLog.del(c.id, i);
}
window.cfFlowAdd = cfFlowAdd;
window.cfFlowAddQuick = cfFlowAddQuick;
window.cfFlowAddCustom = cfFlowAddCustom;
window.cfFlowDel = cfFlowDel;
window.cfFlowNow = cfFlowNow;

/* ===== 整備（作業チェックリスト） =====
   🔴 v1.100.0 **項目も保存の形も、予約詳細（card-view.js）と1本に揃えた。**
      ⚠ それまでは、同じ `c.maint` を
        ・予約詳細＝`c.maint.checks[番号]`（受付・問診／点検／…）
        ・この編集画面＝`c.maint[番号]`（オイル交換／オイルエレメント／…）
        と、**別の項目・別の場所**で読み書きしていた。同じ車なのに2つの表が出ていて、
        どちらを直しても、もう片方の画面では意味が変わってしまう状態だった。
      🔴 項目は state.js の `PIT_MAINT_CHECKS`、読み書きは `pitMaintChecked` / `pitMaintToggle` を通す。
         **ここに項目を書き写さないこと。** */
function cfMaintHtml(c){
  c.maint = c.maint || {};
  const items = window.PIT_MAINT_CHECKS || [];
  let h = sec('作業チェック', '<i data-ic=wrench data-ics=16></i>');
  h += '<div class="cf-checks">';
  items.forEach(function(it){
    const on = window.pitMaintChecked ? pitMaintChecked(c, it.key) : false;
    h += '<div class="cf-chk' + (on ? ' on' : '') + '" onclick="cfMaintToggle(\'' + it.key + '\')"><span class="cf-chkbox">' + (on ? '✓' : '') + '</span><span class="cf-chkl">' + it.label + '</span></div>';
  });
  h += '</div>';
  h += '<div class="cf-hint">タップで✓。予約詳細の「整備」タブと同じ項目・同じ✓です。</div>';
  h += secEnd();
  return h;
}
function cfMaintToggle(key){
  const c = state.cards.find(function(x){ return x.id === _editingCardId; });
  if (!c) return;
  if (window.pitMaintToggle) pitMaintToggle(c, key);
  if (window.PitDB) PitDB.save();
  renderCardForm(c);
}

/* ===== バックオフィス（返車後の後処理） ===== */
const CF_OFFICE_STEPS = ['カルテ（点検結果）最終確認','原価チェック（部品・外注）','請求発行','入金確認','後処理 完了（締め）'];
function cfOfficeHtml(c){
  c.office = c.office || {};
  let h = sec('バックオフィス（返車後の後処理）', '<i data-ic=folder data-ics=16></i>');
  h += '<div class="cf-checks">';
  CF_OFFICE_STEPS.forEach(function(s, i){
    const on = !!c.office[i];
    h += '<div class="cf-chk' + (on ? ' on' : '') + '" onclick="cfOfficeToggle(' + i + ')"><span class="cf-chkbox">' + (on ? '✓' : '') + '</span><span class="cf-chkl">' + s + '</span></div>';
  });
  h += '</div>';
  h += '<div class="cf-hint">返車 → 後処理（カルテ確認・原価・請求/入金・締め）→ 完了 まで。受付/事務向けの欄（現場には隠す等の出し分けは将来）。原価・請求は整備ソフト/会計と重複しない範囲で。</div>';
  h += secEnd();
  return h;
}
function cfOfficeToggle(i){
  const c = state.cards.find(function(x){ return x.id === _editingCardId; });
  if (!c) return;
  c.office = c.office || {};
  c.office[i] = !c.office[i];
  if (window.PitDB) PitDB.save();
  renderCardForm(c);
}

/* ===== 工程ログ記録（task.js / dnd.js / views.js から呼ぶ） =====
   🔴 v1.55.0（ゆうた指定）**自動で入る記録にも、操作した人の名前を入れる。**
      ⚠ 名前の作り方は flow-pit.js の `pitFlowMe()` に一本化（呼び名を使う）。ここで組み立てない。 */
window.logFlow = function(card, label){
  if (!card) return;
  if (!Array.isArray(card.log)) card.log = [];
  card.log.push({ label: label, at: Date.now(), staff: (window.pitFlowMe ? pitFlowMe() : '') });
};

/* ===== フェーズ移動ログ（誰が・いつ・どこから→どこへ）＋ phaseAt 更新 =====
   dnd.js（ドラッグ）／task.js（<i data-ic=chevLeft data-ics=16></i><i data-ic=chevRight data-ics=16></i>）から status を変える時に呼ぶ。
   card.phaseAt ＝ 今のフェーズに入った時刻（「このフェーズ何日目」のカウント起点）。 */
window.logPhaseMove = function(card, fromStatus, toStatus){
  /* 操作ログ（誰が・いつ・どのカードを動かしたか） */
  try{
    if (window.pitLog && card && fromStatus !== toStatus){
      var _sl = (typeof statusLabel === 'function') ? statusLabel : function(x){ return x; };
      pitLog('フェーズ移動 ' + _sl(fromStatus) + ' → ' + _sl(toStatus),
             { cardId: card.id, kind: 'phase', label: (card.customer? card.customer+' 様':'') + (card.car? ' / '+card.car:'') });
    }
  }catch(e){}
  if (!card) return;
  if (!Array.isArray(card.log)) card.log = [];
  var d = new Date();
  var pad = function(n){ return (n < 10 ? '0' : '') + n; };
  var entry = {
    type: 'phase',
    from: fromStatus || '',
    to:   toStatus || '',
    /* 🔴 v1.55.0 ここは長いあいだ **window.bnMe（どこにも入れていない変数）** を見ていたので、
       工程移動の記録の担当が**ずっと空**だった。`pitFlowMe()`（呼び名）に直した。 */
    by:   (window.pitFlowMe ? pitFlowMe() : ''),
    at:   d.getTime(),
    atTxt:(d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  };
  // 入力金額をフローにも記載（ポップアップで先にカードへ保存済み）。連絡中＝見積／パーツ待ち＝受注
  if (toStatus === 'contact'  && card.amountQuote != null && card.amountQuote !== ''){ entry.amount = card.amountQuote; entry.amountKind = '見積'; }
  if (toStatus === 'parts'    && card.amountOrder != null && card.amountOrder !== ''){ entry.amount = card.amountOrder; entry.amountKind = '受注'; }
  if (toStatus === 'workDone' && card.amountFinal != null && card.amountFinal !== ''){ entry.amount = card.amountFinal; entry.amountKind = '確定'; }
  /* 🔴 v1.62.0 クイック受注＝受注の関門（パーツ待ち）を飛び越えた移動。
     この時は受注額をフローにも残す（飛ばした先が作業待ち・作業完了でも「いくらで受けたか」が残る）。
     ⚠ 判定は phase-popup.js の `pitIsOrderJump` 1本。ここで条件を書き写さないこと。 */
  if (entry.amount == null && window.pitIsOrderJump && pitIsOrderJump(fromStatus, toStatus)
      && card.amountOrder != null && card.amountOrder !== ''){
    entry.amount = card.amountOrder; entry.amountKind = '受注'; entry.quick = true;
  }
  card.log.push(entry);
  card.phaseAt = d.getTime();
};

/* ========================================
   card-detail.js
   入庫カード詳細フォーム（自動保存・現代的UI）
   ======================================== */

let _editingCardId = null;
let _returnView = 'today';   // 全画面カードを閉じたとき戻る先
/* 🔴 v1.44.0 全画面フォームが「どのカードを出していたか」。
   ポップアップを開いた時に全画面の中身を空にする（下の _cardClearOtherBody）ので、
   ポップアップを閉じて全画面に戻る時は、これを見て**描き直す**（空のページにしない）。 */
let _pageCardId = null;
let _cardTab = 'basic';      // カード内タブの現在地（card-tabs.js が参照）
let _cardMode = 'page';      // 'page'＝新規入庫(全画面) / 'modal'＝各ビューから(ポップアップ)
let _cardBodyId = 'md-body'; // フォームの描画先（card-tabs.js も参照）
let _cardCheckOn = false;    // 入力チェックON中＝未入力を赤枠表示（再描画/入力ごとに再評価）

function _cardTitleHtml(card){
  const no = card.resNo ? '<span title="予約番号" style="font-size:12px;font-weight:700;letter-spacing:.5px;color:var(--text2);background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:1px 8px;margin-left:8px;font-family:ui-monospace,Menlo,Consolas,monospace;">' + card.resNo + '</span>' : '';
  return '<span style="font-size:13px;color:var(--text3);font-weight:400;">入庫カード</span>' + no + '<br>' +
    ((window.pitCustName ? pitCustName(card) : card.customer) || '（未入力）') + ' 様 / ' + (card.car || '（車種未入力）');
}

/* mode: 'page'＝全画面（新規入庫予約） / 'modal'＝ポップアップ（各ビューから開く） */
var _openSnap = null;   /* 🔴 v2.22.0 開いた時のカードの姿（編集の記録を作るため） */
function openCard(cardId, mode){
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;
  /* 🔴 v1.56.1 別のカードを開く＝前の「予約を編集」はもう終わっている。
     見張り（保存を止める hold）をここでも外す＝置き去りにしない。
     ⚠ 中身は触らない。外す時に1回保存されるので、打ったものは残る。 */
  if (window.pitCardEditRelease) pitCardEditRelease();
  _editingCardId = cardId;
  /* 🔴 v2.22.0（ゆうた「予約カード内部の操作も履歴に残る？」→ 残っていなかった）
     **開いた時の姿を控える。** 閉じる時にこれと見くらべて、変わった欄を記録に残す。
     ⚠ 新しく持つデータではない（閉じたら捨てる）。 */
  try { if (window.pitCardEnsure) pitCardEnsure(card); } catch (e) {}   /* 先に下ごしらえ（既定値）を済ませる */
  try { _openSnap = JSON.parse(JSON.stringify(card)); } catch (e) { _openSnap = null; }
  _cardTab = 'basic';
  _cardCheckOn = false;   // 開いた直後は赤枠なし
  _cardMode = (mode === 'page') ? 'page' : 'modal';

  if (_cardMode === 'modal'){
    _cardBodyId = 'md-body-modal';
    _cardClearOtherBody('md-body-modal');   /* 🔴 v1.44.0 全画面フォームを残さない（下の注記を参照） */
    document.getElementById('card-title-modal').innerHTML = _cardTitleHtml(card);
    if (window.renderCardView) renderCardView(card, 'md-body-modal');
    else renderCardForm(card);
    document.getElementById('modal-detail').classList.add('show');
  } else {
    _cardBodyId = 'md-body';
    _cardClearOtherBody('md-body');         /* 🔴 v1.44.0 ポップアップの中身を残さない */
    window._cfsYM = null;    // 右パネルのカレンダーは今月から
    window._cfsLgN = null;   // 代車ガントは今日から28日ぶんで仕切り直し
    if (state.currentView && state.currentView !== 'card') _returnView = state.currentView;
    document.getElementById('card-title').innerHTML = _cardTitleHtml(card);
    renderCardForm(card);
    showView('card');
    const main = document.getElementById('main'); if (main) main.scrollTop = 0;
  }
}

/* 🔴 v1.52.0 いま開いている入庫カードのID（customers.js が「新規予約が開いたか」を見るのに使う）。
   ⚠ 中身は返すだけ。ここから書き換えないこと。 */
window.pitOpenCardId = function(){ return _editingCardId; };

// 各ビューのカードをクリック＝ポップアップで開く
function openDetail(cardId){ openCard(cardId, 'modal'); }

function closeDetail(){
  /* 🔴 v1.56.0 予約の編集中に、別の道（付箋の直リンク・削除など）からここへ来た時の逃げ道。
     見張り（保存を止める hold）だけ外す＝**外し忘れると全部の保存が止まる**。
     ⚠ 中身は触らない＝打ったものは残す。編集の出口は今までどおり「保存する／キャンセル」だけ。 */
  if (window.pitCardEditRelease) pitCardEditRelease();
  const modal = document.getElementById('modal-detail');
  const modalOpen = modal && modal.classList.contains('show');
  if (!modalOpen && state.currentView !== 'card') return;   // 何も開いていなければ無視（ESC誤爆防止）
  // 閉じる前に、このカードから顧客控えを更新（入力補助用）。
  // ★サンプル生成カード（_sample）は書き戻さない＝顧客控えが二重化するのを防ぐ。
  const _c = state.cards.find(x => x.id === _editingCardId);
  /* 🔴 v2.22.0 **閉じる前に、開いた時の姿と見くらべて記録を残す。**
     🗣 ゆうた「結局こういう時に追えないのがやだなと思う」
     ⚠ 見くらべるのは**人が入力する欄だけ**（pit-share.js の `pitCardDiff` 1本）。
        状態・フェーズはドラッグ側がすでに記録しているので入れない＝同じことが2回残らない。
     ⚠ ここが**唯一の出口**（「保存する」も「予約を編集」も、別の画面へ行く時も必ずここを通る）。 */
  try { if (_c && _openSnap && window.pitLogCardEdit) pitLogCardEdit(_c, _openSnap); } catch (e) {}
  _openSnap = null;
  if (_c && !_c._sample && window.upsertCustomerFromCard) upsertCustomerFromCard(_c);
  _editingCardId = null;
  if (window.pitSyncLoanerAssigns) pitSyncLoanerAssigns();   // 代車を入れた予約を代車カレンダーへ同期（v0.100.2）
  if (window.PitDB) PitDB.save();
  if (modalOpen){
    modal.classList.remove('show');
    /* 🔴 v1.44.0 背後が全画面カードだった場合、その中身は空にしてあるので描き直す */
    if (state.currentView === 'card' && _pageCardId && state.cards.some(x => x.id === _pageCardId)){
      openCard(_pageCardId, 'page');
      return;
    }
    if (state.currentView) showView(state.currentView);   // 背後のビューを更新して反映
  } else {
    _pageCardId = null;
    showView(_returnView || 'today');
  }
}

/* ===================================================================
   🔴 v1.56.1  中身が空のまま「保存」してしまう穴（2026-08-06 本番で6枚）
   -------------------------------------------------------------------
   ◎起きたこと
     予約番号 J22207 / H50708 / Y53818 / E61962 / P14095 / R20119 の6枚が、
     お客様も車も何も入っていないのに予約として保存されていた。
     6枚ともフローの記録は **「予約作成」→「表紙を印刷して保存」の2つだけ**。
     ＝**何も打たないまま「印刷して保存」を押した**ぶん。7〜8秒おきに6回続いていた。
   ◎これまでの作り
     「保存」系のボタンは**中身を一切見ずに**下書きを外していた＝空でも予約になった。
     しかも「表紙を印刷して保存」の記録が付くと、blank-cards.js の空カード判定が
     **中身あり**と誤解して、設定の「空の予約カード」にも出てこなかった（そちらも直した）。
   ◎これから
     ・**印刷して保存**（空のとき）… **表紙だけ刷って、予約は作らない**。
       ⚠ 空の表紙を刷りたいだけ、という使い方をそのまま活かす（余計な確認も出さない）。
     ・**保存する／仮予約で登録**（空のとき）… **1回だけ聞く**。既定は「入力に戻る」。
   ⚠ 物差しは blank-cards.js の `pitIsBlankCard` ひとつ。**ここで別に作らないこと。**
   =================================================================== */
/* ===================================================================
   🔴 v1.56.1  「反応しないから連打した」の受け止め（ゆうた証言・2026-08-06）
   -------------------------------------------------------------------
   ◎ゆうたの証言
     「**複数台で一気に予約を入れ直していて、保存して印刷をクリックしても
       反応しない時があった。それで6回くらい押したと思う**」
   ◎なぜ反応が無いように見えるか
     ・「印刷して保存」は **表紙の組み立て→印刷ダイアログ→画面を閉じて一覧を描き直す**
       までを一息にやる。**6,600件を読み込んだ本番では、この描き直しに時間がかかる。**
     ・その間ブラウザは固まって見えるので、**押せていないと思ってもう一度押す**。
   ◎受け止め方（3つ）
     ① **押した瞬間に手応えを返す**（トースト）＝「効いていない」と思わせない。
     ② 🔴 **二度押しを飲み込む**＝1.2秒は次の保存を受け付けない。
     ③ 🔴 **保存の直後（0.7秒以内）の「＋ 新規予約」も飲み込む**。
        ⚠ 「＋ 新規予約」は**上のバーにずっと出ている**ので、保存で画面が戻った直後の
           2度目のクリックが**そのまま新しい予約を開いてしまう**。
           これが「空の予約が7〜8秒おきに次々できる」の正体だった。
   ⚠ 飲み込んだ時は**必ず知らせる**。黙って無視すると、今度は本当に壊れたと思われる。
   =================================================================== */
var _pitLastSaveAt = 0;
/* 保存系のボタン：前の1回からまだ間もなければ false を返す（＝二度押し） */
function _pitSaveOnce(){
  var now = Date.now();
  if (now - _pitLastSaveAt < 1200){
    if (window.pitToast) pitToast('いま保存しています。少しお待ちください', 'PF-0004');
    return false;
  }
  _pitLastSaveAt = now;
  return true;
}
/* 「＋ 新規予約」が、保存の直後の流れ弾で押されていないか（views.js の openNewReserve が見る） */
window.pitJustSaved = function(){ return (Date.now() - _pitLastSaveAt) < 700; };

function _pitCardIsBlankNow(){
  const c = state.cards.find(x => x.id === _editingCardId);
  return !!(c && window.pitIsBlankCard && pitIsBlankCard(c));
}
/* 空だったら「作りますか？」と1回だけ聞く。作ってよければ then(true)。
   ⚠ v1.76.0 以降、**ここまで来ることは実際には無い**。
      保存はすべて `_pitCardGuard` を通り、空のカードは赤（カナ・TEL・入庫日…）が全部空なので
      手前で止まる。＝これは**念のための受け皿**。
   🔴 新しく保存の道を足す時、この受け皿を頼りにしないこと。**関門（_pitCardGuard）で包む。** */
function _pitAskBlankSave(title){
  if (!_pitCardIsBlankNow()) return Promise.resolve(true);
  const msg = 'まだ何も入力されていません。このまま空の予約を作りますか？';
  const detail = 'お客様・車・作業内容のどれも入っていません。'
               + '空のまま作ると、予約ビューや「今日の入庫」に中身の無いカードとして数えられます。'
               + '表紙を刷りたいだけなら「その他保存 → 表紙印刷のみ」をお使いください。';
  if (window.UI && UI.confirm){
    return UI.confirm(msg, { title: title || '中身が空です', detail: detail, ok: '空のまま作る', cancel: '入力に戻る', danger: true });
  }
  return Promise.resolve(window.confirm(msg + '\n\n' + detail));
}

/* 📝 仮予約で登録（新規予約画面の右上ボタン）＝今のカードを仮予約フラグONで保存して戻る。
   仮予約は予約カレンダー/代車カレンダーには「仮」付きで載り、予約ビューの未定タブ「仮予約」カラムに集まる。
   本予約への確定は予約詳細画面の⋮メニューで行う（v0.100.0）。 */
function pitSaveTentative(){
  if (!_pitSaveOnce()) return;                        /* 🔴 v1.56.1 二度押しを飲み込む */
  /* 🚦 v1.76.0 赤が空なら止める／黄だけなら1回聞く（仮予約も止める＝ゆうた指定） */
  _pitCardGuard('仮予約で登録', function(){
    /* 🔴 v1.56.1 中身が空なら1回聞く（下の _pitAskBlankSave の注記を参照） */
    if (_pitCardIsBlankNow()){ _pitAskBlankSave('仮予約で登録').then(function(ok){ if (ok) _pitSaveTentativeGo(); }); return; }
    _pitSaveTentativeGo();
  });
}
function _pitSaveTentativeGo(){
  const c = state.cards.find(x => x.id === _editingCardId);
  if (c){
    if (c._draft) delete c._draft;   /* v1.17.0：ここで初めて確定＝保存される */
    if (window.pitClearDraftKeep) pitClearDraftKeep();
    c.tentative = true;
    c.approvalPending = false;       /* 🔵 v1.74.0 仮予約と承認待ちは別物＝同時に立てない */
    if (window.logFlow) logFlow(c, '仮予約で登録');
    if (window.pitToast) pitToast('仮予約として登録しました');
  }
  closeDetail();
}
window.pitSaveTentative = pitSaveTentative;

/* 🔵 v1.74.0（ゆうた指定）承認に回して保存＝**枠は埋めたまま、承認待ちとして登録する**。
   -------------------------------------------------------------------
   ◎仮予約との違い（ここを取り違えないこと）
     ・仮予約 … まだ確定していない「仮おさえ」。カレンダーには「仮」で載る
     ・承認に回す … **予約そのものは確定**。人の目で確かめてもらう待ちなので、
                    入庫カレンダーも代車も**本予約と同じに枠が埋まる**（ゆうた指定）
     ・外れ方 … 仮＝詳細の⋮メニューで本予約に確定／承認＝承認バーの「承認して印刷して保存」
   🔴 承認者はアカウントで縛らない。誰でも承認できる（ルールは現場側で決める＝ゆうた指定）。 */
function pitSaveApproval(){
  if (!_pitSaveOnce()) return;                        /* 二度押しを飲み込む */
  _pitCardGuard('承認に回して保存', function(){
    if (_pitCardIsBlankNow()){ _pitAskBlankSave('承認に回して保存').then(function(ok){ if (ok) _pitSaveApprovalGo(); }); return; }
    _pitSaveApprovalGo();
  });
}
function _pitSaveApprovalGo(){
  const c = state.cards.find(x => x.id === _editingCardId);
  if (c){
    if (c._draft) delete c._draft;   /* ここで初めて確定＝保存される */
    if (window.pitClearDraftKeep) pitClearDraftKeep();
    c.approvalPending = true;
    c.tentative = false;             /* 🔴 仮ではない＝本予約扱い（枠は埋まる） */
    const who = (window.pitFlowMe ? (pitFlowMe() || '') : '');
    if (window.logFlow) logFlow(c, '承認に回した' + (who ? '／' + who : ''));
    if (window.pitToast) pitToast('承認待ちとして登録しました（予約ビュー ▸ 未定 ▸ 承認待ち）');
  }
  closeDetail();
}
window.pitSaveApproval = pitSaveApproval;

/* ===================================================================
   v1.17.0  「保存する」と「← やめる」を、はっきり分ける
   -------------------------------------------------------------------
   🔴 これまで：ヘッダーの「保存する」と「← 戻る」が **どちらも closeDetail()** を呼んでいた。
      ＝保存とキャンセルの区別が存在せず、やめたつもりの予約がそのまま残っていた。
   🔴 これから：新規予約は「下書き（_draft）」で始まり、
        ・保存する／仮予約で登録／印刷して保存 … 下書きを外す＝ここで初めて保存される
        ・← やめる                              … カードごと捨てる（書きかけは端末に控えが残る）
   ⚠ 既にあるカードを開いて編集している時は下書きではないので、今までどおりの動き。
   =================================================================== */
function pitSaveCard(){
  if (!_pitSaveOnce()) return;                        /* 🔴 v1.56.1 二度押しを飲み込む */
  /* 🚦 v1.76.0 赤が空なら止める／黄だけなら1回聞く */
  _pitCardGuard('保存', function(){
    /* 🔴 v1.56.1 中身が空なら1回聞く */
    if (_pitCardIsBlankNow()){ _pitAskBlankSave('保存する').then(function(ok){ if (ok) _pitSaveCardGo(); }); return; }
    _pitSaveCardGo();
  });
}
function _pitSaveCardGo(){
  const c = state.cards.find(x => x.id === _editingCardId);
  if (c && c._draft){
    delete c._draft;                                   /* ここで初めて「本物の予約」になる */
    if (window.pitClearDraftKeep) pitClearDraftKeep();  /* 端末の書きかけ控えは役目を終える */
  }
  closeDetail();   /* 顧客控えの更新・代車同期・保存・前の画面へ戻る（従来どおり） */
}
window.pitSaveCard = pitSaveCard;

function pitCancelCard(){
  const c = state.cards.find(x => x.id === _editingCardId);
  /* 下書きでなければ（＝既にある予約を開いていただけ）今までどおり閉じる */
  if (!c || !c._draft){ closeDetail(); return; }
  const id = c.id;
  const blank = window.pitIsBlankCard ? pitIsBlankCard(c) : false;
  /* 何も入れていない＝黙って捨てる（いちいち聞かない） */
  if (blank){ if (window.pitDropDraft) pitDropDraft(id, true); closeDetail(); return; }
  /* 何か入っている＝必ず確認する。⚠ 打ち込んだものを無言で消さないこと。 */
  const msg = 'この予約はまだ保存していません。やめますか？';
  const detail = '入力した内容は予約になりません。'
               + '書きかけはこの端末に控えてあるので、次に「＋ 新規予約」を押すと「続きから開きますか？」と聞きます。';
  const ask = (window.UI && UI.confirm)
    ? UI.confirm(msg, { title: '保存せずにやめる', detail: detail, ok: 'やめる', cancel: '入力に戻る', danger: true })
    : Promise.resolve(window.confirm(msg + '\n\n' + detail));
  ask.then(function (ok){
    if (!ok) return;                                   /* 「入力に戻る」＝そのまま編集を続ける */
    if (window.pitDropDraft) pitDropDraft(id, false);   /* false＝端末の控えは残す */
    closeDetail();
  });
}
window.pitCancelCard = pitCancelCard;

/* 🖨 印刷して保存（新規予約画面の一等地）＝カルテ表紙を印刷しつつ、通常どおり保存して戻る。
   印刷は cover-print.js の pitPrintCover(cardId) を使う（別iframeで印刷ダイアログを出すので画面遷移とは独立）。
   pitPrintCover は cardId を直接受け取るため、先に呼んでおけば closeDetail() が _editingCardId を消しても影響なし。 */
function pitSaveAndPrint(){
  if (!_pitSaveOnce()) return;                        /* 🔴 v1.56.1 二度押しを飲み込む */
  const c = state.cards.find(x => x.id === _editingCardId);
  const id = c ? c.id : _editingCardId;
  /* 🚦 v1.78.0（ゆうた指定）**足りなければ、印刷にも行かせない。**
     ⚠ v1.76.0 では「まっさらなカードなら表紙だけ刷る」道を関門の**手前**に残していたが、
        現場で試して**やめた**＝「印刷して保存」を押したのに**紙だけ出る**のが分かりにくい。
     🔴 これで「印刷して保存」は **関門を通った時だけ刷る**。
        ＝**刷った＝保存された**が必ず成り立つ（紙が出たのに予約が無い、が起きない）。
     ⚠ **空の表紙を刷りたい時は「その他保存 ▸ 表紙印刷のみ」。** そちらは今までどおり刷れる。 */
  _pitCardGuard('印刷して保存', function(){ _pitSaveAndPrintGo(c, id); });
}
function _pitSaveAndPrintGo(c, id){
  /* 🔴 v1.56.1 押した瞬間に手応えを返す＝本番は描き直しに時間がかかり「効いていない」と見える */
  if (window.pitToast) pitToast('表紙を印刷しています…');
  /* 🔴 ここへ来られるのは**関門を通った時だけ**（v1.78.0）。
     2026-08-06 の本番で、この道から空の予約が6枚できた（フローが「予約作成→表紙を印刷して保存」だけ）。
     いまは v1.76.0 の赤（必須）が空だと手前で止まるので、**空の予約はここまで来ない**。 */
  if (c && c._draft) delete c._draft;   /* v1.17.0：ここで初めて確定＝保存される */
  if (window.pitClearDraftKeep) pitClearDraftKeep();
  if (c && window.logFlow) logFlow(c, '表紙を印刷して保存');
  if (id && window.pitPrintCover) pitPrintCover(id);   // 表紙を印刷（別iframe＝画面遷移と独立・非同期）
  closeDetail();                                        // 顧客控え更新＋代車同期＋DB保存＋戻る（＝従来の「保存して戻る」）
}
window.pitSaveAndPrint = pitSaveAndPrint;

/* ===================================================================
   v1.19.0  右上の保存ボタンの整理と「その他保存」メニュー
   -------------------------------------------------------------------
   ◎並び（右から）  印刷して保存 ／ その他保存▾ ／ 入力チェック
     いちばん多い「印刷して保存」を一等地に置いたまま、ふだん使わない
     保存の仕方を「その他保存」の中にたたんだ。
   ◎その他保存の中身
     仮予約で保存 ／ 入庫中に印刷して保存 ／ 入庫中に保存のみ ／
     予約保存のみ ／ 表紙印刷のみ
   =================================================================== */

/* ---- ▾ メニューの開け閉め（外側クリック・Esc で閉じる） ---- */
function pitSaveMenuClose(){
  const m = document.getElementById('cs-menu');
  if (!m) return;
  m.classList.remove('open');
  const b = document.getElementById('cs-menu-btn');
  if (b) b.setAttribute('aria-expanded', 'false');
}
window.pitSaveMenuClose = pitSaveMenuClose;

function pitSaveMenuToggle(e){
  if (e) e.stopPropagation();
  const m = document.getElementById('cs-menu');
  if (!m) return;
  const open = !m.classList.contains('open');
  m.classList.toggle('open', open);
  const b = document.getElementById('cs-menu-btn');
  if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
}
window.pitSaveMenuToggle = pitSaveMenuToggle;

document.addEventListener('click', function (e){
  const m = document.getElementById('cs-menu');
  if (m && m.classList.contains('open') && !m.contains(e.target)) pitSaveMenuClose();
});
document.addEventListener('keydown', function (e){
  if (e.key === 'Escape') pitSaveMenuClose();
});

/* 🖨 表紙印刷のみ＝刷るだけ。保存もせず、画面もそのまま（ゆうた指定）。
   ⚠ 下書き（_draft）は下書きのまま残す＝ここで確定させないこと。
      「もう一枚刷りたい」「刷ってから続きを入力する」ための入口。 */
function pitPrintCoverOnly(){
  pitSaveMenuClose();
  const id = _editingCardId;
  if (!id) return;
  if (window.pitPrintCover) pitPrintCover(id);
  if (window.pitToast) pitToast('表紙を印刷しました（保存はしていません）');
}
window.pitPrintCoverOnly = pitPrintCoverOnly;

/* 🚗 入庫中に保存＝**もう入庫してしまった車を、あとから記録する**ための保存（v1.19.0）
   -------------------------------------------------------------------
   緊急で入れてしまった／登録を忘れていた車を、予約の段階を飛ばして
   そのまま **1課（国産）/ 2課（輸入）のタスクボードの「点検待ち」** に置く。

   ◎入庫日は過去の日付をそのまま受け取る。カウント（その日の入庫台数）は
     入力された入庫日で数えられるので、あとから入れても台数が合う。
   ◎実入庫日（actualInAt）にも同じ日付を入れる＝「いつ入ったか」が残る。
   ⚠ 国産／輸入が未選択だと、どちらのタスクボードに置くか決まらないので先に選んでもらう。 */
function pitSaveInWork(alsoPrint){
  if (!_pitSaveOnce()) return;                        /* 🔴 v1.56.1 二度押しを飲み込む */
  pitSaveMenuClose();
  /* 🚦 v1.76.0 赤が空なら止める／黄だけなら1回聞く */
  _pitCardGuard(alsoPrint ? '入庫中に印刷して保存' : '入庫中に保存', function(){ _pitSaveInWorkGo(alsoPrint); });
}
function _pitSaveInWorkGo(alsoPrint){
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;

  if (!c.boardId){
    const msg = '先に「国産車」か「輸入車」を選んでください。';
    const detail = 'タスクボードは 1課（国産）と 2課（輸入）に分かれているので、どちらに置くかが決まりません。';
    pitAlert('どちらの課か決まっていません', { code:'PF-1001', detail: msg + '\n' + detail, ok: '入力に戻る' });
    return;
  }

  const today = ymd(new Date());
  let filled = false;
  if (!c.reserveDate){ c.reserveDate = today; filled = true; }   /* 空なら今日＝カウントの基準日 */

  c.status     = 'check';          /* タスクボードの最初の列＝点検待ち */
  c.intakeTbd  = false;            /* 入庫日は決まっている */
  c.tentative  = false;            /* 仮予約ではない */
  if (!c.actualInAt) c.actualInAt = c.reserveDate;   /* 実入庫日＝入力された入庫日 */
  if (c._draft) delete c._draft;                     /* ここで初めて確定＝保存される */
  if (window.pitClearDraftKeep) pitClearDraftKeep();

  const past  = c.reserveDate < today;
  const board = (c.boardId === 'import') ? '2課（輸入）' : '1課（国産）';
  if (window.logFlow) logFlow(c, '入庫中で登録（' + c.reserveDate + '・' + board + 'の点検待ちへ）');
  if (window.pitLog) pitLog('入庫中で登録', { cardId: c.id, kind: 'in',
    label: ((window.pitCustName?pitCustName(c):c.customer) ? (window.pitCustName?pitCustName(c):c.customer) + ' 様' : '') + (c.car ? ' / ' + c.car : '') + ' / 入庫日 ' + c.reserveDate + (past ? '（過去日）' : '') });

  if (alsoPrint && window.pitPrintCover) pitPrintCover(c.id);   /* 印刷は別iframe＝画面遷移と独立 */

  if (window.pitToast){
    pitToast(board + 'の「点検待ち」に入れました'
      + (past ? '（入庫日 ' + c.reserveDate + ' で記録）' : '')
      + (filled ? '（入庫日が空だったので今日にしました）' : ''));
  }
  closeDetail();   /* 元の画面へ戻る（ゆうた指定） */
}
window.pitSaveInWork = pitSaveInWork;

/* 既存の3つもメニューから呼ばれるので、押したらメニューを閉じる */
(function (){
  ['pitSaveTentative', 'pitSaveCard'].forEach(function (fn){
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function (){ pitSaveMenuClose(); return orig.apply(this, arguments); };
  });
})();

/* 🔴 v1.44.0 入庫カードのフォームは置き場所が2つある（全画面＝md-body／ポップアップ＝md-body-modal）。
     **両方に中身が残っていると、同じ id・同じ data-key の入力欄が2つできる**。
     すると `document.querySelector(...)` は**先に見つかる方＝前に開いていたカードの欄**を掴んでしまい、
     症状ホイールのチップ（「車検満了日：」等）や顧客呼び出しの候補が
     **別のカードに入ってしまう**（2026-08-04 の不具合）。
     ⚠ **描く直前に、使わない方の入れ物を必ず空にする。**
     ⚠ 入力は打った瞬間にカード（state.cards の中身）へ入っているので、空にしても書きかけは消えない。 */
function _cardClearOtherBody(keepId){
  ['md-body', 'md-body-modal'].forEach(function(id){
    if (id === keepId) return;
    const el = document.getElementById(id);
    if (el && el.innerHTML !== '') el.innerHTML = '';
  });
}
function renderCardForm(c){
  const body = document.getElementById(_cardBodyId || 'md-body');
  if (!body) return;
  _cardClearOtherBody(_cardBodyId || 'md-body');
  if ((_cardBodyId || 'md-body') === 'md-body') _pageCardId = c.id;   /* 戻り先を覚える（v1.44.0） */

  /* 再描画前にスクロール位置を控える（ボタン操作で先頭に飛ばないように・v0.28.1） */
  const _pm = body.querySelector('.cfp-main');
  const _ps = body.querySelector('.cfp-side');
  const _pg = body.querySelector('#cfs-lg-scroll');
  const _keep = {
    main: _pm ? _pm.scrollTop : 0,
    side: _ps ? _ps.scrollTop : 0,
    gT: _pg ? _pg.scrollTop : 0,
    gL: _pg ? _pg.scrollLeft : 0,
  };

  let h = '';

  /* 新規予約（全画面）は右パネル付き2カラム（v0.27.0） */
  const withSide = (_cardMode === 'page');
  if (withSide) h += '<div class="cfp-wrap"><div class="cfp-main">';

  /* === 顧客呼び出し（入力補助・整備ソフトとは別の控え） === */
  h += '<div class="cf-recall">';
  h += '<input id="cf-recall-input"class="cf-input"placeholder="過去の顧客・ナンバーから呼び出し（名前/ナンバー）"oninput="custSuggestSoon(this.value,event)"autocomplete="off">';
  h += '<div id="cf-recall-list" class="cf-recall-list" style="display:none"></div>';
  h += '</div>';

  /* === タブ（新規予約＝page は基本情報だけ・既存編集＝modal は全タブ）v0.35.5 === */
  if (!_cardTab) _cardTab = 'basic';
  if (withSide){
    _cardTab = 'basic';   // 新規予約は基本情報のみ表示
    h += '<div class="cf-tabs">' + cfTabBtn('basic', '<i data-ic=clipboard data-ics=16></i> 基本情報') + '</div>';
  } else {
    h += '<div class="cf-tabs">'
       + cfTabBtn('basic',  '<i data-ic=clipboard data-ics=16></i> 基本情報')
       + cfTabBtn('flow',   '<i data-ic=clock data-ics=16></i> フロー')
       + cfTabBtn('maint',  '<i data-ic=wrench data-ics=16></i> 整備')
       + cfTabBtn('office', '<i data-ic=folder data-ics=16></i> バックオフィス')
       + '</div>';
  }

  /* === 基本情報パネル === */
  h += '<div class="cf-panel" data-tab="basic"' + (_cardTab === 'basic' ? '' : ' hidden') + '>';

  /* === 基本情報（車両もここに統合・v0.27.0） === */
  /* 顧客を呼び出し済み（c.customerId あり）なら、右端に「この顧客で新規車両を追加」ボタン（v0.38.4） */
  h += '<div class="cf-section"><div class="cf-section-head"><i data-ic=user data-ics=16></i> <span>基本情報</span>'
     /* 🔴 v1.49.0（ゆうた指定）1つのボタンから **乗り換え／増車 の2択**へ（右上の保存メニューと同じ形）。 */
     + (c.customerId
        ? '<div class="vh-menu cf-vehmenu" id="cf-veh-menu">'
          + '<button type="button" class="cf-addveh-btn" id="cf-veh-menu-btn" aria-haspopup="true" aria-expanded="false" onclick="cfVehMenuToggle(event)">'
          + '＋ この顧客で新規車両 <i data-ic=chevDown data-ics=14></i></button>'
          + '<div class="vh-menu-panel" role="menu">'
          + '<button type="button" class="vh-mi" role="menuitem" onclick="cfAddVehicle(\'trade\')">'
          + '<b><i data-ic=swap data-ics=16></i> 乗り換え（前の車は降りる）</b>'
          + '<span>いまの車をアーカイブして、新しい車を登録します。前の車の入庫履歴は顧客詳細に残ります</span></button>'
          + '<button type="button" class="vh-mi" role="menuitem" onclick="cfAddVehicle(\'add\')">'
          + '<b><i data-ic=plus data-ics=16></i> 増車（前の車も乗り続ける）</b>'
          + '<span>いまの車はそのまま残して、2台目として登録します</span></button>'
          + '</div></div>'
        : '')
     + '</div><div class="cf-section-body">';
  _ensureNameParts(c);
  /* 1行目：初回／リピーター → お客様名(姓/名・1BOX) → カナ(姓/名・1BOX)。名前は半角空白で合成（v0.74） */
  h += '<div class="cf-row">';
  h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-label">初回／リピーター</div>' + chips(c, 'repeat', state.repeatTypes) + '</div>';
  h += '<div class="cf-field" style="flex:1"><div class="cf-label">お客様名（姓／名）</div>' + nameBoxInput(c) + '</div>';
  h += '<div class="cf-field" style="flex:1"><div class="cf-label">カナ（姓／名）</div>' + kanaBoxInput(c) + '</div>';
  h += '</div>';
  /* 2行目：LINE(新設) ｜ TEL ｜ その他連絡先　＝ここまで顧客情報（v0.91.0） */
  h += '<div class="cf-row">';
  h += field('LINE', lineField(c));
  h += field('TEL',  telInput(c));
  h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-label">連絡先</div>' + contactsBtn(c) + '</div>';
  h += '</div>';
  /* ── ここから下は車両情報。顧客情報と点線で区切る（v0.91.0） ── */
  h += '<div class="cf-divider"></div>';
  /* 3行目：国産輸入 ｜ カルテNo.(新設) ｜ メーカー ｜ ナンバー ｜ 車両注意 */
  h += '<div class="cf-row">';
  h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-label">国産車／輸入車</div>' + chips(c, 'boardId', TEAM_ITEMS) + '</div>';
  h += '<div class="cf-field" style="flex:0 0 6em"><div class="cf-label">カルテNo.</div>' + textIn(c, 'karteNo', 'placeholder="例 1234"') + '</div>';
  h += '<div class="cf-field cf-field-cn" style="flex:0 0 8.5em"><div class="cf-label">メーカー</div>' + textIn(c, 'maker', 'placeholder="トヨタ" data-cn="maker"') + '</div>';
  h += '<div class="cf-field" style="flex:1"><div class="cf-label">ナンバー</div>' + plateInput(c) + '</div>';
  h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-label">車両注意</div>' + driveChips(c) + '</div>';
  h += '</div>';
  /* 4行目：車種（グレード） */
  h += '<div class="cf-row">';
  h += '<div class="cf-field cf-field-cn" style="flex:1"><div class="cf-label">車種（グレード）</div>' + textIn(c, 'car', 'placeholder="例 アクアGz" data-cn="car"') + '</div>';
  h += '</div>';
  /* 5行目：入庫日｜入庫時刻(1BOX＋ショートカット)｜予約受付日（変わらず） */
  h += '<div class="cf-row">';
  h += field('入庫日', dateIn(c, 'reserveDate'));
  /* 🟡 v1.76.0 入庫時刻は「入れたほうがいい（黄）」。枠を付ける目印で包む（中身は timeField のまま）。 */
  h += '<div class="cf-field" style="flex:1"><div class="cf-label">入庫時刻</div><div data-key="reserveTime">' + timeField(c) + '</div></div>';
  h += field('予約受付日', dateIn(c, 'bookedAt'));
  h += '</div>';
  h += secEnd();

  /* === 予約内容（旧「作業内容」＝作業タイプ/課/受付/相談/担当/概算＋代車を統合・v0.35.2） === */
  h += sec('予約内容', '<i data-ic=sticky data-ics=16></i>');
  /* 1行目：作業タイプ(基本)｜併用可(B.P/1Y/3M)｜課 を1行に（v0.94.0）。v0.94.3 上揃え＝ラベル/チップの上端を揃える */
  h += '<div class="cf-row" style="flex-wrap:nowrap;align-items:flex-start">';
  h += '<div class="cf-field" style="flex:0 1 auto;min-width:0"><div class="cf-label">作業タイプ</div>' + workTypeChips(c) + '</div>';
  h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-label">併用可</div>' + workTypeComboChips(c) + '</div>';
  /* 🔧 v2.6.0 「特殊」→「**その他**」。バッジを並べるのをやめて、押すと開く引き出しにした。
     　　ふだんあまり使わない印（保証・保険・社員／中古・代車・内部）をここにまとめる。 */
  h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-label">その他</div>' + workTypeOtherBtn(c) + '</div>';
  h += '<div class="cf-field" style="flex:0 0 auto;margin-left:auto"><div class="cf-label">課</div>' + chips(c, 'division', state.divisions, true) + '</div>';
  h += '</div>';
  h += otherPanelHtml(c);
  /* 2行目：受付タイプ（待/当/預）の右隣に「相談」を□っぽい別ボタンで配置（区切り線で違いを演出）＋担当を1行に詰める */
  h += '<div class="cf-row">';
  h += field('受付タイプ', '<div class="cf-recv">' + dropChips(c)
       + '<span class="cf-recv-sep"></span>'
       + '<button type="button" id="cf-consult-btn" class="cf-consult' + (c.consult ? ' active' : '') + '">相談</button>'
       + '<button type="button" id="cf-codered-btn" class="cf-codered' + (c.codeRed ? ' active' : '') + '" title="マルエフ＝コードレッド（クレーム等の要注意案件）">F</button></div>');
  h += field('フロント担当', staffSelect(c, 'frontStaff'));
  h += field('予約担当',     staffSelect(c, 'reserveStaff'));
  h += '</div>';
  /* 3行目：概算。🔧 v2.6.0 社内車両（中古・代車・内部）はお金のやり取りが無いので入れられない。 */
  if (_internOn(c)){
    h += '<div class="cf-row">';
    h += field('概算 預かり日数', _offBox('—'));
    h += field('概算 金額（円）', _offBox('—'));
    h += '</div>';
    h += '<div class="cf-hint" style="margin-top:0">※ ' + _internName(c) + 'は売上のやり取りが無いので、概算の日数・金額は入れません。</div>';
  } else {
  h += '<div class="cf-row">';
  h += field('概算 預かり日数', numIn(c, 'estHoldDays', 'placeholder="例 5（当日仕上げは0）"'));
  h += field('概算 金額（円）', numIn(c, 'estAmount', 'placeholder="作業タイプから自動"'));
  h += '</div>';
  h += '<div class="cf-hint" style="margin-top:0">※ 日数・金額とも作業タイプを選ぶと平均値が自動で入る概算。診断・見積もりで後から直せばOK。</div>';
  }
  /* 車検を選んだ時だけ：入庫時持ち物（概算の下・代車の上に出す・v0.35.4） */
  if (c.workType === 'shaken' && !_internOn(c)){
    h += '<div class="cf-subhead"><i data-ic=clipboard data-ics=16></i> 入庫時持ち物（車検）</div>';
    h += '<div class="cf-mochi"><div class="cf-mochi-lead"><i data-ic=megaphone data-ics=16></i> お客様にご案内ください（当日ご持参いただくもの）</div>'
       + '<div class="cf-mochi-items"><span class="cf-mochi-i"><i data-ic=car data-ics=16></i> 車検証</span><span class="cf-mochi-i"><i data-ic=receipt data-ics=16></i> 納税証明書</span><span class="cf-mochi-i"><i data-ic=file data-ics=16></i> 自賠責</span></div></div>';
    h += '<div class="cf-row" style="flex-wrap:wrap">';
    /* 🔴 v1.54.2（ゆうた指定）諸費用は**手で打つ欄**なので、上下の矢印（数字を増減させるつまみ）は出さない。
       ⚠ 印は `data-nospin`。中身・計算・保存は今までどおり。 */
    h += '<div class="cf-field cf-field-narrow"><div class="cf-label">諸費用 ¥</div>' + numIn(c, 'feeAmount', 'data-nospin style="width:120px"') + '</div>';
    h += '<div class="cf-field cf-field-narrow"><div class="cf-label">早期割</div>' + toggle(c, 'earlyDiscount', '適用', 'なし') + '</div>';
    h += '</div>';
  }
  /* 代車：スイッチ＋使用代車＋車種固定を1行（中央揃え＝スイッチが上下にブレない）。貸出/条件/メモは下に展開（v0.38.9） */
  h += '<div class="cf-subhead"><i data-ic=van data-ics=16></i> 代車</div>';
  /* 🔧 v2.6.0 社内車両にはお客様が居ないので、代車は貸さない＝ここは触れない。 */
  if (_internOn(c)){
    h += '<div class="cf-row"><div class="cf-field" style="flex:1">' + _offBox('代車なし（' + _internName(c) + '）') + '</div></div>';
    h += secEnd();
  } else {
  h += '<div class="cf-row cf-loaner-switchrow">';
  h += '<div class="cf-field" style="flex:0 0 auto">' + toggle(c, 'needLoaner', '必要', '不要') + '</div>';
  if (_prevIntakeLoaner(c)) h += '<span class="cf-prevloaner"><i data-ic=warn data-ics=16></i> 前回入庫時 代車あり</span>';
  if (c.needLoaner){
    h += '<div class="cf-field" style="flex:2">' + loanerSelect(c, 'loanerId') + '</div>';   // ラベルなし＝1行高さ（スイッチがブレない）
    h += '<div class="cf-field" style="flex:0 0 auto"><div class="cf-chips"><button type="button" id="cf-fixed-btn" class="cf-chip' + (c.loanerFixed ? ' active' : '') + '"' + (c.loanerFixed ? ' style="background:#1db97a;color:#fff;border-color:#1db97a;"' : '') + '>車種固定</button></div></div>';
  }
  h += '</div>';
  if (c.needLoaner){
    h += '<div class="cf-loaner-detail">';
    h += '<div class="cf-row">';
    h += field('貸出 から', dateIn(c, 'loanerFrom'));
    h += field('まで',     dateIn(c, 'loanerTo'));
    h += '</div>';
    h += '<div class="cf-row"><div class="cf-field" style="flex:1">';
    h += '<div class="cf-label">代車条件</div>';
    h += conditionChips(c);
    h += '</div></div>';
    h += '<div class="cf-row">';
    h += field('条件メモ', textIn(c, 'loanerOther', 'placeholder="その他"'));
    h += '</div>';
    h += '</div>';
  }
  h += secEnd();
  }

  /* === 内容（旧「整備内容（自由記入）」を独立セクション化＋テンプレ挿入・v0.35.2） === */
  h += sec('内容', '<i data-ic=wrench data-ics=16></i>');
  h += '<div class="cf-row"><div class="cf-field" style="flex:1">';
  h += '<div class="cf-label">作業内容（自由記入）</div>';
  h += textareaIn(c, 'menu', 3);
  // 🧰 作業内容テンプレート＝症状ホイール＋チップ（work-content.js が描画・設定で編集可・v0.70.0）
  h += (window.WorkContent ? WorkContent.builderHtml() : '');
  h += '</div></div>';
  h += secEnd();

  /* 入庫時持ち物（車検）は予約内容＝概算の下・代車の上へ移動済み（v0.35.4） */
  /* 返車・完了/支払い・メモは基本情報タブから撤去（v0.35.5）。返車/支払いは将来「別タブ」へ。
     データキー（returnDate・returnTime・needWash・payment・followUpTel・completeCall系・memo・urgent）はモデルに温存。
     ※返車予定はフロータブのタイムラインに引き続き表示される。 */

  h += '</div>'; // /基本情報パネル
  // 他タブ（フロー/整備/バックオフィス）は既存編集（modal）時のみ。新規予約（page）は基本情報だけ。
  if (!withSide){
    h += '<div class="cf-panel" data-tab="flow"'   + (_cardTab === 'flow'   ? '' : ' hidden') + '>' + cfFlowHtml(c)   + '</div>';
    h += '<div class="cf-panel" data-tab="maint"'  + (_cardTab === 'maint'  ? '' : ' hidden') + '>' + cfMaintHtml(c)  + '</div>';
    h += '<div class="cf-panel" data-tab="office"' + (_cardTab === 'office' ? '' : ' hidden') + '>' + cfOfficeHtml(c) + '</div>';
  }

  /* === 右パネル（新規予約・全画面のみ）：最短入庫＋予約状況カレンダー（v0.27.0） === */
  if (withSide){
    h += '</div>';   // /cfp-main
    h += '<div class="cfp-side">' + cfSideHtml(c) + '</div>';
    h += '</div>';   // /cfp-wrap
  }

  body.innerHTML = h;

  /* スクロール位置を復元（v0.28.1） */
  const _nm = body.querySelector('.cfp-main');
  const _ns = body.querySelector('.cfp-side');
  const _ng = body.querySelector('#cfs-lg-scroll');
  if (_nm) _nm.scrollTop = _keep.main;
  if (_ns) _ns.scrollTop = _keep.side;
  if (_ng){ _ng.scrollTop = _keep.gT; _ng.scrollLeft = _keep.gL; }

  // === イベントバインド ===
  bindCardFormEvents(body);

  // 🧰 作業内容テンプレート（症状ホイール）を起動（内容セクションがある時だけ）
  if (window.WorkContent && WorkContent.mount) WorkContent.mount(body);

  /* 🚗 メーカー・車種の候補（v1.23.0）。候補の元は取り込んだ顧客データ＝車検証の記載どおり。
     ⚠ 値の保存は上の input ハンドラに任せている。ここでは「選んだ後の後始末」だけする。 */
  if (window.PitCarName && PitCarName.mount) PitCarName.mount(body, c, {
    onMaker: function (v) {
      /* 国産／輸入がまだなら、メーカーから決めて入れる（すでに選んであれば上書きしない）。
         ⚠ 車検証どおりの表記なので、ミニは年式で BMW と MINI の両方がある。どちらも輸入。 */
      if (c.boardId) return;
      const bd = PitCarName.boardOf(v);
      if (bd !== 'default' && bd !== 'import') return;
      c.boardId = bd;
      c.division = (bd === 'import') ? 'div2' : 'div1';
      _syncStaffToDivision(c);
      if (window.PitDB) PitDB.save();
      renderCardForm(c);
      /* 描き直しで焦点が飛ぶので、次に打つ車種へ移す */
      const nx = document.querySelector('.cf-panel[data-tab="basic"] input[data-cn="car"]');
      if (nx) { try { nx.focus(); } catch (e) {} }
    }
  });

  /* 🔴 v1.59.1 描き直したら見出しも合わせる（顧客呼び出し・車種の候補選択など、
     入力欄を通らずに中身が変わる道もここを通るため） */
  pitCardTitleRefresh();

  // v0.83.1 フォーム再描画のたびに自動保存（チップ＝作業/受付タイプ・相談・Ⓕ・車種固定などの選択を取りこぼさない）。
  //   ※デバウンス保存なので、カレンダー送り等の連続再描画でも localStorage 書き込みは1回にまとまる。
  if (window.PitDB) PitDB.save();
}

/* ========================================
   右パネル：最短入庫BOX＋予約状況ミニカレンダー（クリックで入庫日を自動入力）
   ======================================== */
const TEAM_ITEMS = [
  { id: 'default', label: '国産車', color: '#1db97a' },
  { id: 'import',  label: '輸入車', color: '#ec4899' },
];
/* 特殊運転（車両属性）。左+M/Tが両方ONなら「左MT」自動成立として配車マッチングに使う */
const DRIVE_ITEMS = [
  { id: 'leftHand', label: '左'   },
  { id: 'mt',       label: 'M/T'  },
  { id: 'lowCar',   label: '車高' },
  { id: 'noShoes',  label: '土禁' },
];
/* 入庫時刻のショートカット（メインBOXに直接入力も可） */
/* 🔴 v1.33.0 入庫時間のショートカット。**中身と並び順は state.js の PIT_TIME_QUICK が正**。
   （）内の時間は画面に出さない＝ここではラベルだけ使う（時間は並び順の計算にだけ使われる）。 */
const TIME_QUICK = (window.PIT_TIME_QUICK || []).map(function (t){ return t.label; });

/* 既存データ（customer/kana のみ）を開く時、姓名・カナへ分割（先頭の半角/全角空白で区切る） */
function _ensureNameParts(c){
  if (!(c.sei || c.mei) && (c.customer || '').trim()){
    const t = (c.customer || '').trim().split(/[ 　]+/);
    c.sei = t[0] || ''; c.mei = t.slice(1).join(' ') || '';
  }
  if (!(c.seiKana || c.meiKana) && (c.kana || '').trim()){
    const t = (c.kana || '').trim().split(/[ 　]+/);
    c.seiKana = t[0] || ''; c.meiKana = t.slice(1).join(' ') || '';
  }
}
/* お客様名＝見た目1BOX・中で姓/名（ナンバー入力と同じ思想）。data-key=customer は必須チェックの赤枠用 */
function nameBoxInput(c){
  /* 🔵 v2.35.0 打っている最中に「似た方がいます」を出す（呼び出し済みなら出ない・customers.js 側で判断） */
  return '<div class="cf-namebox" data-key="customer">'
    + '<input type="text" class="cf-nb-seg" data-name="sei" value="' + _pe(c.sei || '') + '" placeholder="姓" autocomplete="off" oninput="pitRecallHint(this,event)">'
    + '<span class="cf-nb-sep"></span>'
    + '<input type="text" class="cf-nb-seg" data-name="mei" value="' + _pe(c.mei || '') + '" placeholder="名" autocomplete="off" oninput="pitRecallHint(this,event)">'
    + '</div>';
}
/* 🔴 v1.76.0（ゆうた指定）**カナは必須（赤）** になったので、赤枠を付ける目印を足す。
   ⚠ 漢字（customer）は「入れたほうがいい（黄）」に変わった。 */
function kanaBoxInput(c){
  return '<div class="cf-namebox" data-key="kana">'
    + '<input type="text" class="cf-nb-seg" data-name="seiKana" value="' + _pe(c.seiKana || '') + '" placeholder="セイ" autocomplete="off" oninput="pitRecallHint(this,event)">'
    + '<span class="cf-nb-sep"></span>'
    + '<input type="text" class="cf-nb-seg" data-name="meiKana" value="' + _pe(c.meiKana || '') + '" placeholder="メイ" autocomplete="off" oninput="pitRecallHint(this,event)">'
    + '</div>';
}
/* v0.92.0 LINE欄：状態（未/お断り/案内してない/OK）。OK のときだけ Lステップ顧客番号を入力し、
   Lステップへのリンクを自動生成（リンクの土台URLは設定 state.settings.lstepBaseUrl・未設定なら番号だけ保持）。 */
/* v0.92.5 LINE状態＝3パターン：未案内(既定) / LINE NG / 登録済（登録済＝Lステップ番号入力→ボタン埋め込み） */
const LINE_STATUS_ITEMS = [
  { id: '',   label: '未案内' },
  { id: 'ng', label: 'LINE NG' },
  { id: 'ok', label: '登録済' },
];
/* v0.92.3 入力（番号 or 全文URL）から Lステップ顧客ページのURLを作る。
   全文URL（…?member=数字）を貼られても member= の数字を抜いて正しいリンクにする。 */
function _lstepUrl(raw){
  raw = String(raw == null ? '' : raw).trim();
  if (!raw) return '';
  const base = (state.settings && state.settings.lstepBaseUrl) || 'https://manager.linestep.net/line/visual?member=';
  const m = raw.match(/member=(\d+)/);
  if (m) return base + m[1];                       // 全文URLを貼った → 数字だけ抜く
  if (/^\d+$/.test(raw)) return base + raw;        // 数字だけ → そのまま付ける
  if (/^https?:\/\//i.test(raw)) return raw;       // 既に何かのURL → そのまま
  return base + encodeURIComponent(raw);
}
window.pitLstepUrl = _lstepUrl;   // 予約詳細・顧客ビューでも同じURL生成を使う
function lineField(c){
  const id = (c.lstepId || '').trim();
  const ok = ((c.lineStatus || '') === 'ok');
  // v0.92.6 登録済（OK＋番号）＝埋め込み：状態は静的な「登録済」ラベル＋Lステップボタン（セレクトは出さない）。✕で解除して編集に戻る。
  if (ok && id){
    const url = _lstepUrl(id);
    let h = '<div class="cf-line-wrap"><span class="cf-line-done">✓ 登録済</span>';
    h += url
      ? '<a class="cf-line-link" href="' + _pe(url) + '" target="_blank" rel="noopener" draggable="true" title="クリックで開く／ドラッグでブラウザへ（タブのように掴める）" onclick="event.stopPropagation()"><i data-ic=link data-ics=16></i> Lステップ</a>'
      : '<span class="cf-line-bad">番号を確認</span>';
    h += '<button type="button" class="cf-line-x" onclick="cfLineClear()" title="解除して入れ直す"><i data-ic=close data-ics=16></i></button></div>';
    return h;
  }
  // 未登録：編集できる状態セレクト（未案内/LINE NG/登録済）。「登録済」を選ぶと番号入力が出る。
  let h = '<div class="cf-line-wrap"><select class="cf-input cf-line-status" data-key="lineStatus">'
    + LINE_STATUS_ITEMS.map(function(o){ return '<option value="' + o.id + '"' + (((c.lineStatus || '') === o.id) ? ' selected' : '') + '>' + o.label + '</option>'; }).join('')
    + '</select>';
  if (ok) h += textIn(c, 'lstepId', 'placeholder="Lステップ番号 / URL貼付OK"');
  h += '</div>';
  return h;
}
/* ✕＝Lステップ番号を消して編集に戻す（状態OKのまま入力欄を再表示） */
function cfLineClear(){
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;
  c.lstepId = '';
  if (window.PitDB) PitDB.save();
  renderCardForm(c);
}
window.cfLineClear = cfLineClear;
/* 特殊運転チップ（複数選択＝既存の data-multi ハンドラで c.drive 配列をトグル） */
function driveChips(c){
  const arr = Array.isArray(c.drive) ? c.drive : [];
  let h = '<div class="cf-chips cf-drive" data-key="drive" data-multi="1">';
  DRIVE_ITEMS.forEach(it => {
    const on = arr.indexOf(it.id) >= 0;
    h += '<button type="button" class="cf-chip cf-chip-drv' + (on ? ' active' : '') + '" data-val="' + it.id + '">' + it.label + '</button>';
  });
  h += '</div>';
  return h;
}
/* 入庫時刻＝メインBOXに直接入力（全角→半角）。フォーカスで下にショートカット（AM/PM/決まり次第/未定）
   🔴 v1.60.0 **画面の作りは return-slot.js の pitTimeGuideHtml ひとつ**（返車時間の欄と同じ部品を借りる）。
      ここでHTMLを書き写さないこと。書き写すと、片方だけ直して見た目や動きがズレる。
      ボタンに出す一覧だけ「入庫用（TIME_QUICK）」を渡す。 */
function timeField(c){
  if (window.pitTimeGuideHtml) return pitTimeGuideHtml(c.reserveTime || '', { list: TIME_QUICK });
  return '<div class="cf-time"><input type="text" class="cf-input cf-time-main" value="' + _pe(c.reserveTime || '') + '" autocomplete="off"></div>';
}
/* 全角→半角（数字・コロン・ハイフン）。９：００→9:00 */
function _timeHalf(s){
  var t = String(s == null ? '' : s)
    .replace(/[０-９]/g, function(ch){ return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
    .replace(/[：]/g, ':');
  /* 🔴 v1.33.0 「レッカー」のような**言葉の長音（ー）を - に変えない**こと。
     変えると「レッカ-」になり、範囲（9:00-10:00）とみなされて後ろが消える。
     数字・コロン・区切り・時分半 だけでできている＝**時刻の書き方の時だけ** - に寄せる。 */
  if (/^[0-9:\s\-－ー―〜～時分半〇一二三四五六七八九十]+$/.test(t)) {
    t = t.replace(/[－ー―〜～]/g, '-');
  }
  return t;
}
window._timeHalf = _timeHalf;   /* v1.60.0 返車時間の欄（return-slot.js）からも使う＝物差しは1本 */
/* v0.95.0 入庫時刻の賢い自動補正。全角/半角不問で「9」「900」「0900」「9時」「9時半」「九時半」「0915」「0900-1000」等を HH:MM（範囲は HH:MM-HH:MM）に。
   AM/PM/決まり次第/未定 などの語はそのまま残す。 */
function _timeHHMM(h, m){ if (isNaN(h)) return ''; h = Math.max(0, Math.min(23, h)); m = isNaN(m) ? 0 : Math.max(0, Math.min(59, m)); return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'); }
function _timeKanji(t){
  const map = { '〇':'0','一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9' };
  t = t.replace(/十([一二三四五六七八九])/g, function(_m, b){ return '1' + map[b]; });
  t = t.replace(/([一二三四五六七八九])十/g, function(_m, a){ return map[a] + '0'; });
  t = t.replace(/十/g, '10');
  return t.replace(/[〇一二三四五六七八九]/g, function(ch){ return map[ch]; });
}
function _normTimePart(t){
  t = _timeKanji(String(t == null ? '' : t).trim());
  if (!t) return '';
  const half = /半/.test(t); t = t.replace(/半/g, '');
  let m = t.match(/^(\d{1,2})\s*時\s*(\d{1,2})?\s*分?$/);
  if (m) return _timeHHMM(+m[1], m[2] != null ? +m[2] : (half ? 30 : 0));
  m = t.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m) return _timeHHMM(+m[1], +m[2]);
  m = t.match(/^(\d{1,4})$/);
  if (m){
    const d = m[1];
    if (d.length <= 2) return _timeHHMM(+d, half ? 30 : 0);   // 9 / 09 (＋半=30)
    if (d.length === 3) return _timeHHMM(+d.slice(0,1), +d.slice(1));  // 915→9:15
    return _timeHHMM(+d.slice(0,2), +d.slice(2));               // 0900→09:00
  }
  return String(t == null ? '' : t).trim();   // 解釈できない（AM等）はそのまま
}
function _normTime(raw){
  /* 🔴 v1.33.0 ショートカットの言葉（AM・朝一・レッカー…）はそのまま返す＝時刻に直そうとしない */
  const raw0 = String(raw == null ? '' : raw).trim();
  if (window.pitTimeQuick && pitTimeQuick(raw0)) return raw0;
  const s = _timeHalf(raw).trim();
  if (!s) return '';
  if (s.indexOf('-') >= 0) return s.split('-').map(function(p){ return _normTimePart(p); }).filter(Boolean).join('-');
  return _normTimePart(s);
}
/* v1.34.0 外へ出す。card-hover.js / card-view.js（返車時間の直接入力）が
   `window._normTime` を呼ぶ作りになっていたのに**代入されておらず、ずっと素通り**していた。
   これでどこから入れても同じ整形（900→09:00／ショートカットの言葉はそのまま）になる。 */
window._normTime = _normTime;

/* 時間ピッカー(input type=time)用の値。単一のHH:MMの時だけ返す（範囲や語は空＝ピッカーは空表示）
   🔴 v1.60.0 中身は return-slot.js の pitTimePickVal ひとつ（返車時間の欄と共通）。 */
function _timePickVal(v){
  if (window.pitTimePickVal) return pitTimePickVal(v);
  const n = _normTime(v || '');
  const m = (n.split('-')[0] || '').match(/^\d{2}:\d{2}$/);
  return m ? m[0] : '';
}
/* 姓→姓カナ／名→名カナ の自動フリガナ（_bindAutoKana を1セグメント用に。確定後 onCommit で合成保存） */
function _bindAutoKanaSeg(nameEl, kanaEl, onCommit){
  if (!nameEl || !kanaEl) return;
  const hasKanji = function(s){ return /[㐀-䶿一-鿿豈-﫿々々]/.test(s || ''); };
  let base = kanaEl.value || '', comp = '';
  nameEl.addEventListener('compositionstart', function(){ base = kanaEl.value || ''; comp = ''; });
  nameEl.addEventListener('compositionupdate', function(e){ const d = e.data || ''; if (hasKanji(d)) return; comp = d; kanaEl.value = base + _toKatakana(comp); if (onCommit) onCommit(); });
  nameEl.addEventListener('compositionend', function(){ base = base + _toKatakana(comp); comp = ''; kanaEl.value = base; if (onCommit) onCommit(); });
  nameEl.addEventListener('input', function(){ if (!nameEl.value){ base = ''; comp = ''; kanaEl.value = ''; if (onCommit) onCommit(); } });
}

/* 🔁 いま開いているカードを描き直す（外部から呼ぶ入口）。
   MHSの予定が後から届いた時に、js/mhs-pit.js がこれを呼ぶ。
   入力途中の値はカード（c）へ随時入っているので、描き直しで消えることはない。 */
window.pitCardRepaint = function(){
  const c = state.cards.find(x => x.id === _editingCardId);
  if (c && typeof renderCardForm === 'function') renderCardForm(c);
};

/* ===================================================================
   🔤 v1.59.1（ゆうた報告）**画面いちばん上の見出しを、打つたびに書き直す。**
   -------------------------------------------------------------------
   ◎ゆうたの言葉
     「**新規予約で顧客を入力しているのに、一番上のタイトル的な顧客名と車種が未入力のまま。
       保存をするとちゃんと入る**」
   ◎正体
     見出し（`#card-title` / `#card-title-modal`）は **`openCard()` で1回書いて終わり**だった。
     打った内容はカードには入っているのに、**見出しだけ書き直していなかった**。
     保存して開き直すと `openCard()` を通るので入る＝「保存すると入る」という見え方になっていた。
   ◎これから
     入力のたびにここを呼んで書き直す。
     ⚠ **中身が変わっていない時は何もしない**（打つたびに DOM を触らない）。
     ⚠ 書き方は `_cardTitleHtml()` ひとつ。**ここで組み立てないこと。**
     ⚠ 行き先は開き方で変わる＝全画面なら `card-title`、ポップアップなら `card-title-modal`。
   =================================================================== */
function pitCardTitleRefresh(){
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;
  const id = ((_cardBodyId || 'md-body') === 'md-body-modal') ? 'card-title-modal' : 'card-title';
  const el = document.getElementById(id);
  if (!el) return;
  const h = _cardTitleHtml(c);
  if (el.innerHTML !== h) el.innerHTML = h;
}
window.pitCardTitleRefresh = pitCardTitleRefresh;

function cfSideHtml(c){
  const today = new Date(); today.setHours(0,0,0,0);
  const tStr = ymd(today);
  if (!window._cfsYM){ window._cfsYM = { y: today.getFullYear(), m: today.getMonth() }; }
  const picked = (c.boardId === 'default' || c.boardId === 'import');   // 国産/輸入を選んだか
  let h = '';

  /* 並び＝最短入庫カード→カレンダー→（未選択ならもう1チームぶん）カード→カレンダー（v0.27.4） */
  if (picked){
    h += _cfsShortHtml(c, c.boardId, today, tStr);
    h += _cfsCalHtml(c, c.boardId, tStr);
  } else {
    h += _cfsShortHtml(c, 'default', today, tStr);
    h += _cfsCalHtml(c, 'default', tStr);
    h += _cfsShortHtml(c, 'import', today, tStr);
    h += _cfsCalHtml(c, 'import', tStr);
  }

  /* v0.84.0 選んだ日の入庫/返車ミニ一覧（時間提案用）＋担当のMHS予定 ＝ 代車カレンダーの上 */
  h += _cfsDayListHtml(c);
  h += _cfsMhsHtml(c);

  /* 🚙 代車の空き（「代車必要」を押すと出る・代車ビュー式＝どの車がいつ空くか） */
  if (c.needLoaner) h += _cfsLoanerGanttHtml(today, tStr, c);

  return h;
}

/* v0.84.0 選んだ日の入庫/返車ミニ一覧。入庫=左/返車=右・時間順・休憩バー・
   左ライン＝国産緑/輸入ピンク・選択中フロント担当はゴールドで控えめ強調（左バー色は変えない）。
   日付を選んだ後に「時間」を決める助け（接客スペースの溢れ防止）。 */
function _cfsDayListHtml(c){
  const ds = c.reserveDate;
  if (!ds) return '';   // 入庫日が未選択なら出さない（最短カレンダーで日を選んでから）
  const me = c.id;
  const who = (c.frontStaff || '').trim();
  /* v1.33.0 物差しは state.js の pitTimeMin に一本化（ショートカットの時間も解決される） */
  const toMin = function (s){ return window.pitTimeMin ? pitTimeMin(s) : 99999; };
  /* 🔴 v1.161.0（ゆうた報告「新規予約画面の右カラム、予定にもキャンセルした車両が表示されてる」）
     **まだ生きているカードかは pit-share.js の `pitCardActive` 1本**に聞く。
     ⚠ ここは `'canceled'`（L が1つ）と書いてあった。PitFlow の値は `'cancelled'`（L が2つ）なので、
        **この行は1件も外していなかった**＝キャンセルした車がずっと予定に並び続けていた。
        JSエラーは1つも出ないので、綴りの間違いに誰も気づけない。
        ⚠ **状態の名前を自分で綴らない。1本に聞く。** */
  const _alive = window.pitCardActive || function (x){ return !!x && x.status !== 'scrap' && x.status !== 'cancelled'; };
  const live = function (x){ return x.status !== 'returned' && _alive(x); };
  /* v1.17.0：他の人が書きかけの下書き（_draft）は、この一覧にも出さない */
  const intake = (state.cards||[]).filter(function(x){ return x && !x._draft && x.id!==me && x.reserveDate===ds && live(x); });
  /* 🔴 v1.65.0 返車の日は return-slot.js の物差し1本から取る */
  const ret    = (state.cards||[]).filter(function(x){ return x && !x._draft && x.id!==me && live(x) && (window.pitReturnListDate ? pitReturnListDate(x)===ds : x.returnDate===ds); });
  const BRK = [{from:'12:00',to:'13:00'},{from:'15:30',to:'16:30'}];
  function evHtml(x, t){
    const imp = (x.boardId==='import');
    const isHl = who && (x.frontStaff||'').trim()===who;
    /* 🔴 v1.104.0 自社（小林モータース）は狭いバッジだと入らないので「コバモ」（pit-share.js の1本） */
    const front = (window.pitStaffShort ? pitStaffShort(x.frontStaff||'') : (window.pitSurname ? pitSurname(x.frontStaff||'') : (x.frontStaff||'')));
    /* 🔴 v1.161.0（ゆうた指定）**担当フロントが決まっていない時は、代わりに課（1課／2課）を出す。**
       ＝当日ビューは v1.98.0 でそうなったのに、**新規予約の右カラムだけ「—」のまま**だった。
       ⚠ 課は `c.division`（予約画面のボタン）だけで決まる。国産／輸入から逆算しない（v1.92.0 の決めごと）。
       ⚠ 課のボタンも空なら、今までどおり「—」。無いものを作らない。 */
    const divL = front ? '' : (window.pitDivisionLabel ? pitDivisionLabel(x) : '');
    /* 🔴 v1.161.0 **バッジの色も課から引く。課が空ならコバモのグレー**（`PIT_DIV_NONE_COLOR`）。
       ⚠ 直す前は CSS（`.dl-badge` / `.dl-ev.imp .dl-badge`）が
          **車（国産／輸入）から色を作っていた**ので、課を何も押していなくても
          必ず緑かピンクが付き「入っている」ように見えていた。
          当日ビューでは v1.104.0 で追い出した筋が、ここにだけ残っていた。
       ⚠ 色をここにも CSS にも書き写さない。物差しは `pitDivisionColorOr` の1本。 */
    const badgeBg = window.pitDivisionColorOr ? pitDivisionColorOr(x)
                                              : ((window.pitDivisionColor ? pitDivisionColor(x) : '') || '#8390a6');
    const badge = front || divL || '—';
    const car = (x.car || '').trim();   // v0.84.1 メーカーは出さない＝車種のみ
    const nm = ((window.pitCustSurname ? pitCustSurname(x) : (x.customer||'')) || '（未入力）');   // v0.86.1 名字だけ（法人はフル）
    return '<div class="dl-ev'+(imp?' imp':'')+(isHl?' hl':'')+'">'
      + '<div class="dl-top"><span class="dl-time">'+_pe(t||'—')+'</span>'
      + '<span class="dl-badge'+(front?'':(divL?' is-div':' is-none'))+'" style="background:'+_pe(badgeBg)+'"'
      + (divL ? ' title="担当者はまだ決まっていません（'+_pe(divL)+'）"' : '')
      + '>'+_pe(badge)+'</span></div>'
      + '<div class="dl-line">'+_pe(nm)+' 様 <span class="dl-car">'+_pe(car)+'</span></div></div>';
  }
  function col(list, isRet){
    if (!list.length) return '<div class="dl-empty">予定なし</div>';
    /* 🔴 v1.70.0 返車側の並びは return-slot.js の物差し1本（入庫時刻で代用しない） */
    const items = list.map(function(x){
      const tt = isRet ? (x.returnTime || '') : (x.reserveTime || '');
      const mn = isRet ? (window.pitReturnSortMin ? pitReturnSortMin(x) : toMin(tt)) : toMin(tt);
      return { min: mn, html: evHtml(x, tt.split('-')[0]) };
    });
    BRK.forEach(function(b){ items.push({ min: toMin(b.from), html: '<div class="dl-brk"><i data-ic=cup data-ics=15></i> 休憩 '+b.from+'–'+b.to+'</div>' }); });
    items.sort(function(a,b){ return a.min-b.min; });
    return items.map(function(i){ return i.html; }).join('');
  }
  /* 🆕 v1.156.0（ゆうた指定）**入庫と返車の真ん中に、その日の日付をバッジで出す。**
     🗣「上のカレンダーでアクティブになってるから分かるのだが、実際表示かわってる？
     　　これ何日のスケジュール？ってちょっと不安になるから」
     ＝ 日を選び直しても画面の形が変わらないので、**今どの日を見ているのかが分からなくなる。** */
  const _d = new Date(ds + 'T00:00:00');
  const _dLbl = isNaN(_d.getTime()) ? ds
    : ((_d.getMonth()+1) + '/' + _d.getDate() + '（' + '日月火水木金土'[_d.getDay()] + '）');
  const _isToday = (ds === ymd(new Date()));
  let h = '<div class="dl">';
  h += '<div class="dl-hrow">';
  h += '<div class="dl-h in"><i data-ic=download data-ics=16></i> 入庫</div>';
  h += '<div class="dl-datechip' + (_isToday ? ' today' : '') + '">' + _pe(_dLbl) + (_isToday ? '<em>今日</em>' : '') + '</div>';
  h += '<div class="dl-h ret"><i data-ic=upload data-ics=16></i> 返車</div>';
  h += '</div>';
  h += '<div class="dl-cols">';
  h += '<div class="dl-col"><div class="dl-body">'+col(intake,false)+'</div></div>';
  h += '<div class="dl-col"><div class="dl-body">'+col(ret,true)+'</div></div>';
  h += '</div></div>';
  return h;
}

/* v0.84.0 → v1.29.0 担当フロントのMHS予定（来客以外＝MTG・外出・ルーティン）。代車カレンダーの上。
   🔴 v1.29.0（ゆうた指定）**当番は出さない**。**休みは MHS と同じく「休み欄」に顔（アバター）を並べる**。
   データは js/mhs-pit.js が MHS の配る appSummaries/mhsDigest-YYYY-MM から読んで
   window.pitMhsSchedule(担当名, 日付) / window.pitMhsStatus(日付) で渡してくる。
   ⚠ ここは「読んで出すだけ」。予定の展開（繰り返し・当番・休日振替）は MHS 側の仕事。 */
function _cfsMhsHtml(c){
  const who = (c.frontStaff || '').trim();
  const head = '<div class="mhs-head"><i data-ic=calendar data-ics=16></i> <span>'+(who ? _pe(who)+' の予定' : '担当の予定')+'</span><span class="mhs-tag">MHS</span></div>';
  const _ds0 = c.reserveDate || ymd(new Date());
  if (!who) return '<div class="mhs-box">'+head+'<div class="mhs-empty">フロント担当を選ぶと、その人のMHS予定が出ます。</div>'+_cfsMhsOffHtml(_cfsMhsOffList(_ds0), '')+'</div>';
  const ds = _ds0;
  let list = [];
  if (typeof window.pitMhsSchedule === 'function'){ try { list = window.pitMhsSchedule(who, ds) || []; } catch(e){ list = []; } }
  let st = null;
  if (typeof window.pitMhsStatus === 'function'){ try { st = window.pitMhsStatus(ds); } catch(e){ st = null; } }
  const _offs = _cfsMhsOffList(ds);
  const bigHtml = _cfsMhsOffBigHtml(_offs, who);
  const offHtml = _cfsMhsOffHtml(_offs, who);
  const foot = _cfsMhsFoot(st);
  if (!list.length){
    /* 「予定が無い」のか「まだ届いていない／読めない」のかを、はっきり書き分ける。
       ここを一緒くたにすると『予定なし』を信じて予約を入れてしまう。 */
    let msg = 'この日の予定は入っていません。';
    if (!st || st.state === 'loading')  msg = 'MHSの予定を読み込んでいます…';
    else if (st.state === 'error')      msg = 'MHSの予定を読めませんでした（通信または権限）。MHS側で確認してください。';
    else if (st.state === 'none')       msg = 'この月ぶんがMHSからまだ届いていません（誰かがMHSを開くと配られます）。';
    return '<div class="mhs-box">'+head+bigHtml+'<div class="mhs-empty">'+msg+'</div>'+offHtml+foot+'</div>';
  }
  const ic = {mtg:'<i data-ic=clipboard data-ics=16></i>', out:'<i data-ic=car data-ics=16></i>',
              routine:'<i data-ic=recycle data-ics=16></i>', desk:'<i data-ic=monitor data-ics=16></i>'};
  const rows = list.map(function(s){ return '<div class="mhs-row"><span class="mhs-t">'+_pe(s.t||'終日')+'</span><span class="mhs-ic">'+(ic[s.type]||'•')+'</span><span class="mhs-l">'+_pe(s.label||'')+'</span></div>'; }).join('');
  return '<div class="mhs-box">'+head+bigHtml+'<div class="mhs-note">来客とは別の予定（MTG・外出・ルーティン）。</div>'+rows+offHtml+foot+'</div>';
}

/* 🔴 v1.29.0 その日「休み」の人を、MHS の休み欄と同じく**顔（アバター）を並べて**出す（ゆうた指定）。
   ⚠ 担当ひとりではなく**その日休みの人ぜんぶ**＝誰に振り替えられるかが一目で分かる。
   ⚠ いま選んでいる担当が休みの時は、その丸を光らせる（見落とし防止）。
   ⚠ 顔写真は CoreMembers 由来（state.staff[].photo）。無い人は名前の頭2文字。 */
function _cfsMhsOffList(ds){
  if (!ds || typeof window.pitMhsOff !== 'function') return [];
  try { return window.pitMhsOff(ds) || []; } catch(e){ return []; }
}
function _cfsMhsOffHtml(offs, who){
  if (!offs || !offs.length) return '';
  const wk = String(who || '').trim();
  /* ほかの人＝アバターを並べる／本人＝大きく知らせる（下の _cfsMhsOffBigHtml） */
  const others = offs.filter(function(m){ return !(wk && (m.name || '') === wk); });
  if (!others.length) return '';
  const av = others.map(function(m){
    const nm = (m.name || '？');
    const inner = m.photo ? '<img src="'+_pe(m.photo)+'" alt="" loading="lazy">' : _pe(nm.slice(0, 2));
    return '<span class="bn-av mhs-av'+(m.photo ? ' has-photo' : '')
         + '" title="'+_pe(nm + (m.label ? '（'+m.label+'）' : ''))+'">'+inner+'</span>';
  }).join('');
  return '<div class="mhs-off">'
       + '<span class="mhs-off-h"><i data-ic=cup data-ics=15></i> 休み</span>'
       + '<span class="mhs-off-av">'+av+'</span>'
       + '</div>';
}
/* 🔴 v1.29.0（ゆうた指定）**選んでいる担当その人が休みの日は、予定欄に大きく出す**。
   顔を並べるだけだと見落とすため。名前も添えて、何の休みか（振替など）が入っていれば出す。 */
function _cfsMhsOffBigHtml(offs, who){
  const wk = String(who || '').trim();
  if (!wk || !offs || !offs.length) return '';
  const me = offs.find(function(m){ return (m.name || '') === wk; });
  if (!me) return '';
  const sub = (me.label && me.label !== '休み') ? '<span class="mhs-big-sub">'+_pe(me.label)+'</span>' : '';
  return '<div class="mhs-big"><i data-ic=cup data-ics=22></i>'
       + '<span class="mhs-big-t">担当者休み</span>'
       + '<span class="mhs-big-n">'+_pe(wk)+'</span>' + sub + '</div>';
}

/* 「この予定はいつ時点のものか」。MHSを開く人がいない日が続くと古くなるので必ず出す。 */
function _cfsMhsFoot(st){
  if (!st || st.state !== 'ok' || !st.updatedAt) return '';
  const d = new Date(st.updatedAt);
  const p2 = function(n){ return String(n).padStart(2,'0'); };
  const t = (d.getMonth()+1)+'/'+d.getDate()+' '+p2(d.getHours())+':'+p2(d.getMinutes());
  const old = (st.staleDays != null && st.staleDays >= 2);
  return '<div class="mhs-foot'+(old?' old':'')+'">MHS更新 '+t+(old ? '（'+st.staleDays+'日前・古い可能性）' : '')+'</div>';
}

/* v0.84.0 MHS予定取得フック。js/mhs-pit.js が読み込まれていない時の保険（空＝出さない）。 */
if (!window.pitMhsSchedule){ window.pitMhsSchedule = function(staffName, dateStr){ return []; }; }

/* ⏱ 最短入庫カード（チーム別・クリックで入庫日に入る）
   ro=true（空きカレンダービュー）では読み取り専用＝クリックなしで日付だけ表示 */
function _cfsShortHtml(c, team, today, tStr, ro){
  if (typeof dashEarliestIntake !== 'function') return '';
  const teamColor = (team === 'import') ? '#ec4899' : '#1db97a';
  const teamName  = (team === 'import') ? '<i data-ic=globe data-ics=16></i> 輸入車' : '<i data-ic=car data-ics=16></i> 国産車';
  /* 🆕 v1.157.0 目印を付ける＝**この枠だけ作り直せる**ようにするため（打つたびに全部を描き直さない）
     🔴🔴 v1.157.1（ゆうた報告「全体的に動きが悪い」）**目印は `data-shortbox` 専用にする。**
        `cfs-short` は**予約カレンダーの「いつもと時間が違う日」のマスにも付いている**
        （`_cfsCalHtml` の `calTone === 'short'`）。しかも**あちらにも `data-team` がある**。
        ＝ `.cfs-short[data-team]` で拾うと、打つたびに
        **短縮営業日のマスまで「最短入庫カード」で置き換わって消えていた。**
        ⚠ 「クラス名が同じだから拾える」で選ばないこと。**作り直す物には専用の目印を付ける。** */
  let h = '<div class="cfs-card cfs-short" data-shortbox="1" data-team="' + team + '"' + (ro ? ' data-ro="1"' : '') + '>';
  h += '<div class="cfs-h" style="border-left-color:' + teamColor + '"><i data-ic=clock data-ics=16></i> 最短入庫 <span class="cfs-team" style="color:' + teamColor + '">' + teamName + '</span></div>';
  /* 🔴🔴 v1.156.0（ゆうた指定）代車ありの最短は「**きちんと枠が取れる日**」から案内する。
     ・作業タイプ未選択 … 1週間きっちり
     ・作業タイプ選択済 … 前日〜入庫日＋預かり日数（＝預かり日数＋前後1日）
     ・お客様が国産車なら**輸入車の代車は数えない**（案内では避ける。あとから選ぶのは自由）
     🔴 判定は loaner-free.js の `pitLoanerPlanWindow` 1本。ここに条件を書き写さない。
     ⚠ 「どの決まりで出した日なのか」を必ず1行出す。出さないと現場が数字を信じられない。 */
  const _holdOv = (window.pitCardHoldDays ? pitCardHoldDays(c) : null);
  const _need   = (window.pitLoanerPlanNeed ? pitLoanerPlanNeed(_holdOv) : { why: '' });
  [{ k: 'noLoaner', n: '代車なし' }, { k: 'loaner', n: '代車あり' }, { k: 'same', n: '当日作業' }].forEach(function (x) {
    const d = dashEarliestIntake(team, x.k, today, x.k === 'loaner' ? _holdOv : null, { board: team });
    const ds = d ? ymd(d) : null;
    const lbl = !d ? 'なし' : (ds === tStr ? '今日' : (d.getMonth()+1) + '/' + d.getDate() + '（' + '日月火水木金土'[d.getDay()] + '）');
    const why = (x.k === 'loaner') ? '<span class="cfs-el-why">' + _need.why + 'が取れる日</span>' : '';
    if (ro){
      h += '<div class="cfs-el cfs-el-ro"><span class="cfs-el-n">' + x.n + '</span><b>' + lbl + '</b>' + why + '</div>';
    } else {
      h += '<button type="button" class="cfs-el' + (ds && c.reserveDate === ds ? ' sel' : '') + '"' + (ds ? ' onclick="cfPickShort(\'' + ds + '\',\'' + team + '\',\'' + x.k + '\')"' : ' disabled') + '>'
         + '<span class="cfs-el-n">' + x.n + '</span><b>' + lbl + '</b>' + why + '<span class="cfs-el-go">タップで入庫日に入る</span></button>';
    }
  });
  /* 国産のお客様には「輸入の代車は避けて出している」ことを言う（黙って絞らない） */
  if (team === 'default'){
    h += '<div class="cfs-el-note"><i data-ic=car data-ics=14></i> 国産車のお客様なので、輸入車の代車は避けて案内しています（あとから選ぶことはできます）</div>';
  }
  h += '</div>';
  return h;
}

/* 予約の空きカレンダー（チーム別・月送り共有）
   ro=true（空きカレンダービュー）では日付クリックなしの読み取り専用 */
function _cfsCalHtml(c, team, tStr, ro){
  const teamColor = (team === 'import') ? '#ec4899' : '#1db97a';
  const ym = window._cfsYM;
  const lastD = new Date(ym.y, ym.m + 1, 0).getDate();
  const startDow = new Date(ym.y, ym.m, 1).getDay();
  const rc = (state.settings && state.settings.reserveCap) || { default: 5, import: 3 };
  const base = (team === 'import') ? (rc.import != null ? rc.import : 3) : (rc.default != null ? rc.default : 5);
  const tgt  = (team === 'import') ? 'capImport' : 'capDefault';
  let h = '';
  h += '<div class="cfs-card">';
  h += '<div class="cfs-h" style="border-left-color:' + teamColor + '"><span style="color:' + teamColor + '">' + (team === 'import' ? '<i data-ic=globe data-ics=16></i> 輸入車空き予約' : '<i data-ic=car data-ics=16></i> 国産車空き予約') + '</span>'
     + '<span class="cfs-nav"><button type="button" onclick="cfsCalShift(-1)" title="前の月"><i data-ic=chevLeft data-ics=16></i></button><b>' + ym.y + '年' + (ym.m + 1) + '月</b><button type="button" onclick="cfsCalShift(1)" title="次の月"><i data-ic=chevRight data-ics=16></i></button><button type="button" onclick="cfsCalShift(0)" title="今月に戻る">今月</button></span></div>';
  h += '<div class="cfs-cal' + (ro ? ' cfs-cal-ro' : '') + '">';
  ['日','月','火','水','木','金','土'].forEach(function (w, i) {
    h += '<div class="cfs-dow' + (i === 0 ? ' red' : (i === 6 ? ' sat' : '')) + '">' + w + '</div>';
  });
  for (let i = 0; i < startDow; i++) h += '<div class="cfs-day blank"></div>';
  for (let dd = 1; dd <= lastD; dd++){
    const d = new Date(ym.y, ym.m, dd);
    const ds = ymd(d);
    const hol = (window.Holidays && Holidays.name) ? Holidays.name(ds) : null;
    const holBadge = hol ? '<em class="cfs-hol"title="'+ hol + '">祝</em>': '';
    if (ds < tStr){ h += '<div class="cfs-day past"><i>' + dd + '</i>' + holBadge + '</div>'; continue; }
    let cls = '', mark = '', num = '';
    if (window.pitVerdict){
      const tv = pitVerdict(ds)[team];
      const eff = window.pitEffective ? pitEffective(ds, tgt, base) : { value: base, closed: null };
      const cnt = (state.cards || []).filter(function (x) { return x.boardId === team && x.reserveDate === ds && x.status !== 'returned' && x.status !== 'scrap'; }).length;
      if (tv.mark === '休'){ cls = ' closed'; mark = '休'; }
      else {
        num = cnt + '/' + eff.value;
        if (tv.mark === '×'){ cls = ' full'; mark = '満'; }
        else if (tv.mark === '△'){ cls = ' near'; mark = '△'; }
        else { cls = ' ok'; mark = '○'; }
      }
    }
    /* 🔴 v1.90.0（ゆうた指摘 2026-08-13）**短縮営業（午前休み・午後休み・早締め）が
       ふつうの日と全く同じに見えていた。**ここは「休みか、そうでないか」の2択しか見ていなかった。
       ・右上に小さなオレンジの ◐ を出す（○△満 の台数表示は今までどおり触らない）
       ・ホバー（title）に「何時から何時まで・空き何台」を出す＝ふつうの日にも出す
       🔴 色と判定は PitCal.tone / PitCal.hoursText 1本。ここで営業時間を計算しない。 */
    const calTone = (window.PitCal && PitCal.tone) ? PitCal.tone(ds) : '';
    const calNote = (window.PitCal && PitCal.label) ? PitCal.label(ds) : '';
    const calHrs  = (window.PitCal && PitCal.hoursText) ? PitCal.hoursText(ds) : '';
    const shortMk = (calTone === 'short') ? '<span class="cfs-mk-short" aria-hidden="true">◐</span>' : '';
    /* ホバーの中身（改行は &#10;）。「いつもと時間が違う」がここで必ず読める。 */
    let tip = (ym.m + 1) + '/' + dd + '（' + '日月火水木金土'[d.getDay()] + '）';
    if (hol) tip += '　' + hol;
    if (calTone === 'closed')      tip += '&#10;🚫 ' + (calNote || '定休') + '（この日は開いていません）';
    else if (calTone === 'short')  tip += '&#10;🕐 ' + calNote + (calHrs ? '&#10;受付 ' + calHrs : '');
    else if (calTone === 'open')   tip += '&#10;✅ ' + calNote + (calHrs ? '&#10;受付 ' + calHrs : '');
    else if (calHrs)               tip += '　' + calHrs;
    if (num) tip += '&#10;空き ' + num + ' 台';

    const dayClick = ro ? '' : ' onclick="cfPickDate(\'' + ds + '\',\'' + team + '\')"';
    const avSel = (ro && window._availPick === ds) ? ' av-sel' : '';   // 空きカレンダービュー：選択日のハイライト
    /* 🔴 v1.74.1（ゆうた報告「表示に変なバグ」）**クラスの前の半角スペースが抜けていた。**
       `cfs-day ok` ＋ `sel` が `cfs-day oksel` になり、
       ①選んだ日が緑に光らない ②今日の点線枠が出ない ③**○/△/満/休 の色まで消える**（ok が別名になるため）。
       ⚠ 見た目だけの話に見えるが、「どの日を選んだのか分からない」＝入れ間違いのもと。 */
    h += '<div class="cfs-day'+ cls + (calTone === 'short' ? ' cfs-short': '') + (!ro && c.reserveDate === ds ? ' sel': '') + (ds === tStr ? ' today': '') + avSel + '" data-ds="'+ ds + '" data-team="'+ team + '"'+ dayClick + ' title="'+ tip + '">'
       + shortMk + holBadge + '<i>' + dd + '</i>' + (num ? '<span>' + num + '</span>' : '<span></span>') + '<b class="cfs-mk">' + mark + '</b></div>';
  }
  h += '</div>';
  h += '<div class="cfs-hint">' + (ro
        ? '数字＝埋まり/枠　○空きあり ／ △残りわずか ／ 満＝受付終了'
        : '数字＝埋まり/枠　○空きあり ／ △残りわずか ／ 満＝受付終了（タップすると確認が出ます・最終判断は人）')
     + '<br><b class="cfs-hint-short">◐＝いつもと時間が違う日（乗せると出ます）</b></div>';
  h += '</div>';
  return h;
}

/* 🚙 代車の空き（代車ビュー式＝縦に日付・横に各代車。車種名はヘッダに常時表示・下へ無限スクロール）v0.27.5 */
function _cfsLgRows(from, to, today, tStr, c, ro){
  const loaners = _cfsLgLoaners(c);
  const assigns = state.loanerAssigns || [];
  const _band = _cfsPlanBand(c);   /* 🆕 v1.156.0 いま案内している期間（透過グリーンの帯） */
  let h = '';
  for (let i = from; i < to; i++){
    const d = addDays(today, i);
    const ds = ymd(d);
    const dow = d.getDay();
    const dCls = (dow === 0) ? ' red' : (dow === 6 ? ' sat' : '');
    /* v1.35.0 日付を押すと、その日の行を点線で囲う（もう一度押すと消える） */
    /* 🆕 v1.156.0 いま案内している期間は行ごと透過グリーン（どこを指しているか） */
    const inBand = !!(_band && ds >= _band.from && ds <= _band.to);
    h += '<tr data-ds="' + ds + '"' + (inBand ? ' class="cfs-lg-band"' : '') + '><td class="cfs-lg-d cfs-lg-dpick' + dCls + (ds === tStr ? ' today' : '') + '" data-lgrow="' + ds + '" title="クリックでこの日の行を目立たせる">' + (d.getMonth()+1) + '/' + d.getDate() + '<span>' + '日月火水木金土'[dow] + '</span></td>';
    loaners.forEach(function (l) {
      /* 🔴 v1.80.0 ふさがっている理由は loaner-free.js に聞く
         ＝貸出だけでなく **代車自身の車検・点検（車両管理の予定）でも塞がる**。
         ⚠ 以前はここで貸出しか見ておらず、車検入庫中の代車が「空き」に見えていた。 */
      const why = window.pitLoanerBusyWhy ? pitLoanerBusyWhy(l, ds) : null;
      const a = why ? (why.kind === 'assign' ? why.assign : { _event: why.event })
                    : assigns.find(function (x) { return x.loanerId === l.id && x.fromDate <= ds && x.toDate >= ds; });
      /* 🔴 v1.35.0 どのマスにも「どの代車の列か」の目印を付ける（貸出中のマスも）。
         列まるごと点線で囲う（エクセルの列選択のような表示）ために要る。
         ⚠ 選択やドラッグに使う data-lgl / data-lgd は**今までどおり空きマスだけ**＝挙動は変えない。 */
      const col = ' data-lgcol="' + l.id + '"';
      if (a){
        /* 古いtitle（誰に・いつまで）は撤去＝情報はヘッダのホバー詳細カードへ */
        /* 🅿 v2.40.0 仮押さえ＝**埋まり扱いは貸出と同じ**（ここは網掛けにするだけ）。
           ゆうた指定「新規予約などからその部分は埋まっているのと同義で扱ってほしい」。 */
        const _hd = !!(a && a.hold);
        h += '<td class="cfs-lg-busy' + (_hd ? ' cfs-lg-hold' : '') + '"' + col
           + (_hd ? ' title="仮押さえ' + (a.memo ? '：' + String(a.memo).replace(/"/g, '') : '') + '"' : '') + '></td>';
      } else if (ro){
        /* 空きカレンダービュー＝読み取り専用（クリック選択なし） */
        h += '<td class="cfs-lg-free cfs-lg-ro"' + col + '></td>';
      } else {
        /* このカードの貸出予定（使用代車＋から/まで）と一致するマスは緑＝双方向（ドラッグでもテキスト入力でも光る） */
        const pick = c && c.loanerId === l.id && c.loanerFrom && c.loanerTo && ds >= c.loanerFrom && ds <= c.loanerTo;
        h += '<td class="cfs-lg-free' + (pick ? ' cfs-lg-pick' : '') + '"' + col + ' data-lgl="' + l.id + '" data-lgd="' + ds + '"></td>';
      }
    });
    h += '</tr>';
  }
  return h;
}

/* 予約の代車条件で並べ替え（ソート有の時）。
   ・サイズ条件(高さ/幅/長さ)を選んだら＝その寸法の合計で「低い順」に左づめ（代車カレンダービューと同じ）。
   ・装備条件(ETC/ナビ/ISO)だけなら＝合う代車を先頭へ。 */
function _cfsLgLoaners(c){
  // 代車カレンダー側と同じ基準で寸法/装備を補完してから読む。これを通さないと、
  // 代車カレンダーを未表示のセッションでは state.loaners に属性が無く、条件ソートが効かない。
  // （未設定のみ補完＝設定画面で入力済みの実値は上書きしない）
  if (typeof _loEnsureOpts === 'function') _loEnsureOpts();
  /* 🔴 v1.80.0 貸せる代車の判定は loaner-free.js の1本
     （緊急車両は代車カレンダー専用の特殊列＝予約側には出さない・v0.101.5／
       **引退した代車もここで外れる**＝以前は列に残って選べてしまっていた）。 */
  const ls = window.pitLoanerUsableList ? pitLoanerUsableList()
           : (state.loaners || []).filter(function(l){ return !l.emergency; });
  if (window._cfsLgSort === false) return ls;   // ソート無＝元の並び
  const conds = (c && Array.isArray(c.loanerConditions)) ? c.loanerConditions : [];
  const sizes = conds.filter(function(k){ return k === 'height' || k === 'width' || k === 'length'; });
  if (sizes.length){   // サイズ＝低い順（左づめ）
    return ls.sort(function(a, b){
      const av = sizes.reduce(function(s, k){ return s + (Number(a[k]) || 0); }, 0);
      const bv = sizes.reduce(function(s, k){ return s + (Number(b[k]) || 0); }, 0);
      return av - bv;
    });
  }
  /* v1.35.0 Bカメ（camera）が抜けていて、選んでも並べ替えが効かなかった */
  const bools = conds.filter(function(k){ return k === 'etc' || k === 'navi' || k === 'iso' || k === 'camera'; });
  if (!bools.length) return ls;
  const match = [], rest = [];
  ls.forEach(function(l){ (bools.every(function(k){ return l[k]; }) ? match : rest).push(l); });
  return match.concat(rest);
}
/* 代車条件があり「ソート有」の時、条件に合う代車かどうか（緑チェック用） */
function _cfsLgMatches(l, c){
  const conds = (c && Array.isArray(c.loanerConditions)) ? c.loanerConditions.filter(function(k){ return k === 'etc' || k === 'navi' || k === 'iso' || k === 'camera'; }) : [];
  if (!conds.length) return false;
  return conds.every(function(k){ return l[k]; });
}
window.cfsLgToggleSort = function(){
  window._cfsLgSort = (window._cfsLgSort === false) ? true : false;
  if (window.cfsLgRerender) cfsLgRerender();
};
window.cfsLgRerender = function(){
  const old = document.getElementById('cfs-lg-card'); if (!old) return;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const ro = (state.currentView === 'availcal');
  const c = ro ? { reserveDate:'', boardId:null, needLoaner:true } : (state.cards.find(function(x){ return x.id === _editingCardId; }) || null);
  old.outerHTML = _cfsLoanerGanttHtml(t, ymd(t), c, ro);
  if (window.cfsLgFill) cfsLgFill();
  if (window.pitLgSync) pitLgSync(c);   /* v1.35.0 並べ替えたあとも選択の色を保つ */
};

/* 🆕 v1.156.0（ゆうた指定）**代車カレンダーに「いまどこを指しているか」を透過グリーンの帯で出す。**
   🗣「右カラムの代車カレンダーには**透過のグリーンでどこを指しているのかわかるように**したい」

   ◎どこを塗るか（ゆうた確定＝期間を縦に帯で）
     ・入庫日が入っていれば **その日を入庫日にしたときの窓**
     ・まだなら **いま案内している最短入庫日の窓**
     窓＝1週間 or「前日〜入庫日＋預かり日数」（loaner-free.js の `pitLoanerPlanWindow` 1本）
   🔴 塗るのは**日付の行ぜんぶ**（代車の列は絞らない）＝「この幅を見ている」が一目で分かる。
   ⚠ ここで日数を計算しないこと。窓の決め方は部品が持つ。 */
function _cfsPlanBand(c){
  if (!c || !window.pitLoanerPlanWindow) return null;
  /* 🔴🔴 v1.157.0（ゆうた指定 2026-08-20）
     🗣「代車の**「まで」が入ってない間（いわば検討中の段階）**であれば、
     　　作業タイプや国産／輸入のチップ、手入力の概算預かり日数で
     　　**最短入庫日と、それに伴うカレンダーの透過グリーンがリニアに変わる**ようにしてほしい」
     ＝ **「まで」が入った時点で人が決めた**ので、そこで止める。
        以後は**決まった貸出の期間**を指す（勝手に動かさない）。 */
  if (c.loanerFrom && c.loanerTo){
    return { from: c.loanerFrom, to: c.loanerTo, ok: true, why: '決まった貸出', fixed: true, base: c.loanerFrom };
  }
  const hold = (window.pitCardHoldDays ? pitCardHoldDays(c) : null);
  const board = (c.boardId === 'default' || c.boardId === 'import') ? c.boardId : null;
  let base = c.reserveDate || '';
  if (!base && typeof dashEarliestIntake === 'function'){
    const t = new Date(); t.setHours(0,0,0,0);
    const d = dashEarliestIntake(board || 'default', 'loaner', t, hold, { board: board });
    base = d ? ymd(d) : '';
  }
  if (!base) return null;
  const w = pitLoanerPlanWindow(base, hold, { board: board });
  return { from: w.from, to: w.to, ok: w.ok, why: w.why, base: base };
}

function _cfsLoanerGanttHtml(today, tStr, c, ro){
  const loaners = _cfsLgLoaners(c);
  if (!window._cfsLgN) window._cfsLgN = 28;
  // 代車条件（ETC/ナビ/ISO/高さ/幅/長さ）が入っていれば「ソート有/無」トグルを出す（デフォルト＝条件ありでソート有）
  const condKeys = (c && Array.isArray(c.loanerConditions)) ? c.loanerConditions.filter(function(k){ return ['etc','navi','iso','camera','height','width','length'].indexOf(k) >= 0; }) : [];
  const sortOn = (window._cfsLgSort !== false);
  const sortBtn = (!ro && condKeys.length)
    ? '<button type="button" class="cfs-sortbtn' + (sortOn ? ' on' : '') + '" onclick="cfsLgToggleSort()" title="条件で並べ替え（サイズは低い順／装備は合う車を先頭）">' + (sortOn ? '✓ 条件で並べ替え' : '並べ替えなし') + '</button>'
    : '';
  let h = '<div class="cfs-card" id="cfs-lg-card">';
  h += '<div class="cfs-h" style="border-left-color:#f59e0b"><span style="color:#f59e0b"><i data-ic=van data-ics=16></i> 代車カレンダー</span>'
     + '<span class="cfs-nav">' + sortBtn + '<button type="button" onclick="cfsLgToday()" title="一番上（今日）に戻る"><i data-ic=location data-ics=16></i> 今日へ</button></span></div>';
  /* 🆕 v1.156.0 何の期間を緑にしているのかを、必ず言葉でも出す（色だけに頼らない） */
  const _bd = _cfsPlanBand(c);
  if (_bd){
    const _md = window.pitLoanerMD || function(x){ return x; };
    h += '<div class="cfs-lg-bandnote' + (_bd.fixed ? ' fixed' : '') + '"><span class="cfs-lg-bandsw"></span>'
       + (_bd.fixed ? '決まった貸出の幅' : (c && c.reserveDate ? 'この入庫日で押さえる幅' : 'いま案内している最短の幅'))
       + '：<b>' + _md(_bd.from) + '〜' + _md(_bd.to) + '</b>'
       + '<span class="cfs-lg-bandwhy">' + _bd.why + '</span>'
       + (_bd.ok ? '' : '<span class="cfs-lg-bandng">この幅で丸ごと空く代車はありません</span>')
       + '</div>';
  }
  h += '<div class="cfs-lg-scroll" id="cfs-lg-scroll" onscroll="cfsLgScroll(this)"><table class="cfs-lg">';
  h += '<thead><tr><th class="cfs-lg-d"></th>';
  loaners.forEach(function (l) {
    /* 古いtitleは撤去。data-loid でヘッダにマウスオーバー＝代車の詳細ホバーカード（loaner.js）。条件マッチは強調。 */
    const mcls = (sortOn && _cfsLgMatches(l, c)) ? ' cfs-lg-match' : '';
    const _no = (l.number != null && l.number !== '') ? String(l.number) : String(l.name || '').replace('代車', '');
    /* v1.35.0 クリックで「この代車を使う」＝列を点線で囲い、使用代車の欄に入れる（ro では押せない） */
    h += '<th class="cfs-lg-th' + mcls + (ro ? '' : ' cfs-lg-thpick') + '" data-loid="' + l.id + '" data-lgcol="' + l.id + '"'
       + (ro ? '' : ' title="クリックでこの代車を使う（列が青い点線で囲まれます）"')
       + '><i>' + _no + '</i><b>' + (l.model || '') + '</b></th>';
  });
  h += '</tr></thead>';
  h += '<tbody id="cfs-lg-body">' + _cfsLgRows(0, window._cfsLgN, today, tStr, c, ro) + '</tbody>';
  h += '</table></div>';
  h += '<div class="cfs-hint">' + (ro
        ? '色付き＝貸出中（マウスで誰に・いつまでか）／空白＝空き。下にスクロールで先の日付まで見られます。'
        : '色付き＝貸出中（マウスで誰に・いつまでか）／<b style="color:#1db97a">緑＝このカードの貸出予定</b>。空きマスを<b>クリック→そのままドラッグ</b>で「使用代車＋貸出から/まで」に自動で入ります（下の入力欄に日付を打っても緑が追従）。'
          + '<br><b style="color:#378ADD">上の車種をクリック</b>＝その代車を使う（列が青い点線で囲まれ、使用代車の欄にも入ります。もう一度押すと解除）。<b style="color:#378ADD">左の日付をクリック</b>＝その日の行を目立たせる（見やすくするだけ）。') + '</div>';
  h += '</div>';
  return h;
}

/* 🆕 v1.157.0（ゆうた指定）**打っている最中でも、最短入庫日と緑の帯だけを描き直す。**
   🗣「作業タイプや国産／輸入のチップ、**手入力の概算預かり日数**で
   　　最短入庫日と、それに伴うカレンダーの透過グリーンが**リニアに変わる**ように」

   🔴 **全体（renderCardForm）を描き直さない。**
      ・打っている最中に描き直すと**入力欄から焦点が飛ぶ**（数字が打てなくなる）
      ・代車ガントのドラッグは中身を作り直すと**効かなくなる**（つかむ相手が入れ替わるため）
   👉 だから **①最短入庫の枠だけ作り直す（中のボタンは onclick 属性なので付け直し不要）**
      **②帯はクラスを付け外しするだけ** ＝ 中身は1つも作り直さない。

   ⚠ チップ（作業タイプ・国産／輸入・受付タイプ）は今までどおり renderCardForm で全部描き直す。
      あちらは押した瞬間なので焦点が飛んでも困らない。 */
window.pitCfPlanSync = function (c) {
  c = c || state.cards.find(function (x) { return x.id === _editingCardId; });
  if (!c) return;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const tStr = ymd(t);

  /* ① 最短入庫の枠（国産／輸入が未選択なら2枚出ている）
     🔴 v1.157.1 目印は **`data-shortbox` だけ**で拾う。`.cfs-short` で拾うと
        予約カレンダーの短縮営業日のマスまで巻き込む（_cfsShortHtml の注意書き参照）。 */
  Array.prototype.forEach.call(document.querySelectorAll('.cfs-card[data-shortbox]'), function (box) {
    const team = box.getAttribute('data-team');
    box.outerHTML = _cfsShortHtml(c, team, t, tStr, box.getAttribute('data-ro') === '1');
  });

  /* ② 緑の帯（クラスの付け外しだけ＝ドラッグの当たり判定を壊さない） */
  const band = _cfsPlanBand(c);
  Array.prototype.forEach.call(document.querySelectorAll('#cfs-lg-body tr[data-ds]'), function (tr) {
    const ds = tr.getAttribute('data-ds');
    tr.classList.toggle('cfs-lg-band', !!(band && ds >= band.from && ds <= band.to));
  });

  /* ③ 帯の説明（何の期間か・幅・取れるか） */
  const note = document.querySelector('.cfs-lg-bandnote');
  if (note && band){
    const md = window.pitLoanerMD || function (x) { return x; };
    note.classList.toggle('fixed', !!band.fixed);
    note.innerHTML = '<span class="cfs-lg-bandsw"></span>'
      + (band.fixed ? '決まった貸出の幅' : (c.reserveDate ? 'この入庫日で押さえる幅' : 'いま案内している最短の幅'))
      + '：<b>' + md(band.from) + '〜' + md(band.to) + '</b>'
      + '<span class="cfs-lg-bandwhy">' + band.why + '</span>'
      + (band.ok ? '' : '<span class="cfs-lg-bandng">この幅で丸ごと空く代車はありません</span>');
  }
};

/* 代車ガント：行を継ぎ足す共通処理（スクロール位置はそのまま） */
function _cfsLgAppend (count) {
  const body = document.getElementById('cfs-lg-body');
  if (!body) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const from = window._cfsLgN || 28;
  window._cfsLgN = from + (count || 21);
  const ro = (state.currentView === 'availcal');   // 空きカレンダービューは読み取り専用
  const c = ro ? null : state.cards.find(x => x.id === _editingCardId);
  body.insertAdjacentHTML('beforeend', _cfsLgRows(from, window._cfsLgN, today, ymd(today), c, ro));
  if (window.pitLgSync) pitLgSync(c);   /* v1.35.0 継ぎ足した行にも選択の色を乗せる */
}
/* 代車ガント：下端近くで21日ずつ継ぎ足し */
window.cfsLgScroll = function (sc) {
  if (!sc) return;
  if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 200){
    _cfsLgAppend(21);
  }
};
/* 代車ガント：縦スクロールバーが必ず出るよう、表示領域を超えるまで先に行を埋める。
   （これがないと初期行が縦にあふれず、横スクロールで初めて縦が出る不具合になる） */
window.cfsLgFill = function () {
  const sc = document.getElementById('cfs-lg-scroll');
  if (!sc) return;
  let guard = 0;
  while (sc.scrollHeight <= sc.clientHeight + 20 && guard < 40){ _cfsLgAppend(21); guard++; }
};
/* 🔴 v1.35.0（ゆうた指定）代車カレンダーの「いま選ばれているもの」を塗り直す共通処理。
   ・緑のマス  … 使用代車＋貸出から/まで（今までどおり）
   ・青い点線の列 … いま選んでいる使用代車の列を、エクセルの列選択のように囲う
   ・青い点線の行 … 日付を押した時、その日の行を囲う
   🔴 **日付欄を打っている最中にも呼ぶ**＝リニアに追従する（再描画は待たない）。
   ⚠ 行を継ぎ足した後（無限スクロール）にも呼ぶこと。付け直さないと下の行に色が乗らない。 */
window.pitLgSync = function (c) {
  const card = c || (window.state && state.cards ? state.cards.find(function (x) { return x.id === _editingCardId; }) : null);
  const table = document.querySelector('#cfs-lg-card table.cfs-lg');
  if (!table) return;
  const lid  = (card && card.loanerId) || '';
  const from = (card && card.loanerFrom) || '';
  const to   = (card && card.loanerTo) || '';
  const rowSel = window._cfsLgRowSel || '';
  /* 緑（このカードの貸出予定） */
  table.querySelectorAll('td[data-lgd]').forEach(function (td) {
    const on = lid && from && to && td.dataset.lgl === lid && td.dataset.lgd >= from && td.dataset.lgd <= to;
    td.classList.toggle('cfs-lg-pick', !!on);
  });
  /* 青い点線の列 */
  table.querySelectorAll('[data-lgcol]').forEach(function (el) {
    el.classList.toggle('cfs-lg-colsel', !!lid && el.getAttribute('data-lgcol') === lid);
  });
  /* 青い点線の行 */
  table.querySelectorAll('tr[data-ds]').forEach(function (tr) {
    tr.classList.toggle('cfs-lg-rowsel', !!rowSel && tr.getAttribute('data-ds') === rowSel);
  });
};

/* 代車ガント：今日（一番上）へ戻る */
window.cfsLgToday = function () {
  const sc = document.getElementById('cfs-lg-scroll');
  if (sc) sc.scrollTop = 0;
};

/* 未入力の項目に赤枠(.cf-miss)を付け直す共通処理。未入力ラベルの配列を返す（トーストは出さない）。
   再描画ごと・入力ごとに呼ぶ＝埋めた項目はその場で赤が外れ、未入力だけ残る。 */
function _cardMarkMisses(c, root){
  if (!root) return { red: [], yellow: [], all: [] };

  /* ===================================================================
     🔴 赤（必須）＝これが空だと**保存できない**（ゆうた指定 v1.76.0）
     🟡 黄（推奨）＝空でも保存できるが、**1回だけ聞く**（「入れなくてもいいが、入るのでは？」）
     -------------------------------------------------------------------
     🔴🔴 v1.168.0 **表そのものは `js/card-miss.js` の `pitCardMisses` 1本に移した。**
        ◎なぜ動かしたか
          点検（健康診断）は**画面を開かずに全カードを見る**ので、ここに表があると
          あちらに**写し**を作るしかなくなる。写しは必ずいつか食い違う（v1.161.0 の実話）。
        ⚠ **項目を足す・色を変えるのは card-miss.js だけ。**ここに書き戻さないこと。
        ⚠ ここが受け持つのは「**どの入力欄に赤枠／黄枠を塗るか**」だけ。
     =================================================================== */
  const m    = window.pitCardMisses ? pitCardMisses(c) : { need: [], keys: [], red: [], yellow: [] };
  const need = m.need;

  // 代車を「不要」にした時・車検を外した時など、対象外になったキーの色は消す
  (window.PIT_MISS_OPTIONAL || []).forEach(function (k){
    if (m.keys.indexOf(k) < 0){
      const el = root.querySelector('[data-key="' + k + '"]');
      if (el) { el.classList.remove('cf-miss'); el.classList.remove('cf-warn'); }
    }
  });
  need.forEach(function (n) {
    const el    = root.querySelector('[data-key="' + n.key + '"]');
    const isRed = (n.lv !== 'yellow');
    // 未入力→枠を付ける／入力済→外す。toggle(force)なので既に付いている項目は再アニメしない（入力中のチラつき防止）
    if (el){
      el.classList.toggle('cf-miss', isRed  && !n.ok);   /* 赤 */
      el.classList.toggle('cf-warn', !isRed && !n.ok);   /* 黄 */
    }
  });
  const red    = m.red.map(function (n) { return n.label; });
  const yellow = m.yellow.map(function (n) { return n.label; });
  return { red: red, yellow: yellow, all: red.concat(yellow) };
}

/* ===================================================================
   🚦 v1.76.0（ゆうた指定）保存の前の関門
   -------------------------------------------------------------------
   ・🔴 赤が1つでも空 … **保存できない。**どこがダメかを名前で伝えて、その欄へ運ぶ
   ・🟡 黄だけが空　　 … **1回だけ聞いて通す**（「入れなくてもいいが、入るのでは？」）
   ・どちらも無い　　　… そのまま保存
   🔴 **止めるのは「すべての保存」**（仮予約・承認に回す・入庫中に保存 も含む＝ゆうた指定）。
   ⚠ 赤で止めた時は `_pitLastSaveAt` を戻す＝**すぐ押し直せる**ようにする
      （二度押しの見張りに引っかかって「反応しない」と感じさせない）。
   =================================================================== */
function _pitCardGuard(actionLabel, next){
  const c = state.cards.find(x => x.id === _editingCardId);
  const body = document.getElementById(_cardBodyId || 'md-body');
  if (!c || !body) { next(); return; }
  const r = _cardMarkMisses(c, body);
  _cardCheckOn = (r.all.length > 0);   /* 以降の再描画・入力でも枠を保つ */

  const goTo = function (sel) {
    const el = body.querySelector(sel);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  if (r.red.length){
    _pitLastSaveAt = 0;                /* 直してすぐ押し直せるように戻す */
    pitAlert('保存できません。足りない項目があります', { code:'PF-1002',
      detail: '赤い枠のところを入れてから、もう一度保存してください。\n\n・' + r.red.join('\n・'),
      ok: '入力に戻る'
    }).then(function(){ goTo('.cf-miss'); });
    return;
  }
  if (r.yellow.length){
    pitAsk('このまま' + (actionLabel || '保存') + 'しますか？', { code:'PF-1003',
      detail: '次の項目が空です（あとから入れられます）。\n\n・' + r.yellow.join('\n・'),
      ok: 'このまま' + (actionLabel || '保存') + 'する', cancel: '入力に戻る'
    }).then(function (yes) {
      if (yes) { next(); return; }
      _pitLastSaveAt = 0;
      goTo('.cf-warn');
    });
    return;
  }
  next();
}

/* 再描画後に赤枠を貼り直す（チェックON中のみ）。bindCardFormEvents から呼ぶ。 */
function _cardReapplyCheck(root){
  if (!_cardCheckOn) return;
  const c = state.cards.find(x => x.id === _editingCardId);
  if (c) _cardMarkMisses(c, root);
}
/* 🔎 入力チェック（v0.28.1）：漏れていそうな項目を赤くハイライト＋先頭へスクロール。強制はしない */
window.pitCardCheck = function () {
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;
  const body = document.getElementById(_cardBodyId || 'md-body');
  if (!body) return;
  const r = _cardMarkMisses(c, body);
  _cardCheckOn = r.all.length > 0;   // 以降の再描画・入力でも未入力だけ色を保つ
  if (!r.all.length){
    if (window.pitToast) pitToast('入力OK！漏れはありません');
    return;
  }
  /* 🔴 v1.76.0 赤（無いと保存できない）と黄（入れたほうがいい）を分けて伝える。 */
  const parts = [];
  if (r.red.length)    parts.push('赤 ' + r.red.length + '件（保存できません）：' + r.red.join('・'));
  if (r.yellow.length) parts.push('黄 ' + r.yellow.length + '件（入れたほうがいい）：' + r.yellow.join('・'));
  if (window.pitToast) pitToast(parts.join('　／　'));
  const first = body.querySelector('.cf-miss') || body.querySelector('.cf-warn');
  if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

/* カレンダーの月送り（右パネル）。n=0 で今月に戻る */
window.cfsCalShift = function (n) {
  if (!window._cfsYM) return;
  if (n === 0){
    const now = new Date();
    window._cfsYM = { y: now.getFullYear(), m: now.getMonth() };
  } else {
    const d = new Date(window._cfsYM.y, window._cfsYM.m + n, 1);
    window._cfsYM = { y: d.getFullYear(), m: d.getMonth() };
  }
  // 空きカレンダービューならそちらを再描画。それ以外は編集中カードのフォームを再描画。
  if (state.currentView === 'availcal' && window.renderAvail){ renderAvail(); return; }
  const c = state.cards.find(x => x.id === _editingCardId);
  if (c) renderCardForm(c);
};

/* 右パネルの日付タップ → 入庫日に自動入力（×の日は確認・従来ガードと同じ）
   team指定あり＝そのカレンダーのチームで判定（チーム未選択でも正しく警告が出る）
   同じ日をもう一度タップ＝選択キャンセル（v0.28.1） */
window.cfPickDate = function (ds, team) {
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;
  if (c.reserveDate === ds){   // 同日タップ＝キャンセル
    c.reserveDate = '';
    renderCardForm(c);
    return;
  }
  const judge = { boardId: team || c.boardId };   // ガードはチームだけ見る
  /* 🔵 v1.74.1 ガードは**アプリ内ダイアログ**になった＝答えを待つ（done で受け取る）。 */
  const apply = function (fin) {
    if (fin !== ds) return;   // やめた
    c.reserveDate = ds;
    renderCardForm(c);
  };
  if (window.pitIntakeGuard) pitIntakeGuard(judge, ds, c.reserveDate, apply);
  else apply(ds);
};

/* ⏱最短入庫カードのタップ → 入庫日セット＋カレンダーをその月へジャンプ。
   「代車あり」は代車ガントも出して該当日へスクロール（v0.28.1） */
window.cfPickShort = function (ds, team, kind) {
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;
  const judge = { boardId: team || c.boardId };
  /* 🔵 v1.74.1 ガードの答えを待ってから進む（中身は _go に切り出した＝写しを作らない）。 */
  if (window.pitIntakeGuard) pitIntakeGuard(judge, ds, c.reserveDate, function (fin) { if (fin === ds) _go(); });
  else _go();
  function _go(){
  c.reserveDate = ds;
  const p = ds.split('-');
  window._cfsYM = { y: +p[0], m: +p[1] - 1 };   // 予約カレンダーをその月へ
  if (kind === 'loaner'){
    c.needLoaner = true;   // 代車ガントも表示
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const idx = Math.round((new Date(+p[0], +p[1]-1, +p[2]) - today) / 86400000);
    if ((window._cfsLgN || 28) < idx + 14) window._cfsLgN = idx + 28;   // 行を先に確保
  }
  renderCardForm(c);
  if (kind === 'loaner'){
    const sc = document.getElementById('cfs-lg-scroll');
    const tr = sc && sc.querySelector('tr[data-ds="' + ds + '"]');
    if (sc && tr) sc.scrollTop = Math.max(0, tr.offsetTop - 60);   // ガントを該当日へ
  }
  }
};

/* ========================================
   ヘルパー：セクション・フィールド・コントロール
   ======================================== */
function sec(title, icon){
  return '<div class="cf-section"><div class="cf-section-head">' +
    (icon || '') + ' <span>' + title + '</span></div><div class="cf-section-body">';
}
function secEnd(){ return '</div></div>'; }

function field(label, control){
  return '<div class="cf-field">' +
    (label ? '<div class="cf-label">' + label + '</div>' : '') +
    control + '</div>';
}

function textIn(c, key, attr){
  const v = c[key] == null ? '' : String(c[key]).replace(/"/g, '&quot;');
  return '<input type="text" class="cf-input" data-key="' + key + '" value="' + v + '" ' + (attr || '') + '>';
}
function numIn(c, key, attr){
  const v = c[key] == null ? '' : String(c[key]);
  return '<input type="number" class="cf-input" data-key="' + key + '" value="' + v + '" ' + (attr || '') + '>';
}
function dateIn(c, key){
  const v = c[key] || '';
  return '<input type="date" class="cf-input" data-key="' + key + '" value="' + v + '">';
}
function textareaIn(c, key, rows){
  const v = c[key] == null ? '' : String(c[key]);
  return '<textarea class="cf-input" data-key="' + key + '" rows="' + (rows || 2) + '">' + v + '</textarea>';
}

function chips(c, key, items, allowNone){
  let h = '<div class="cf-chips" data-key="' + key + '">';
  items.forEach(it => {
    const active = c[key] === it.id;
    let style = '';
    if (active && it.color){
      style = 'style="background:' + it.color + ';color:#fff;border-color:' + it.color + ';"';
    } else if (it.color){
      style = 'style="border-color:' + it.color + ';color:' + it.color + ';"';
    }
    h += '<button type="button" class="cf-chip' + (active ? ' active' : '') + '" data-val="' + it.id + '" ' + style + '>' + it.label + '</button>';
  });
  h += '</div>';
  return h;
}

/* v0.85.0 受付タイプ＝最大2つまで選べるチップ（待/当/預）。「作業次第でどちらにもなる」用。
   主＝c.dropType・副＝c.dropType2。両方選ぶと表示は「待or預」（pitDropLabel）。クリックの挙動は cf-dual ハンドラ参照。 */
function dropChips(c){
  let h = '<div class="cf-chips cf-dual" data-key="dropType">';
  (state.dropTypes || []).forEach(it => {
    const active = (c.dropType === it.id || c.dropType2 === it.id);
    h += '<button type="button" class="cf-chip' + (active ? ' active' : '') + '" data-val="' + it.id + '">' + it.label + '</button>';
  });
  h += '</div>';
  return h;
}

/* 作業タイプのチップ＝基本（単一選択＝c.workType）＋ 併用可タイプ（追加トグル＝c.workAddons[]）。
   設定で「併用可」にした作業（例：3M/1Y）は、基本の作業を選んでいても重ねて選べる。 */
/* ================================================================
   🏷🏷 v2.13.0 **押す前に、その印の意味が読める**（ゆうた 2026-08-25）
   ----------------------------------------------------------------
   🗣「新規予約や予約詳細から編集に入った場合、作業タイプのバッチを
     　**マウスオーバーしたらバッチの持つ意味を表示して間違えないように**したい」
   ◎とくに取りちがえると**あとの数字が変わる**印がある。
     ・保証 … 売掛がデフォルトで入る
     ・保険 … 保険専用の入金日で実績化する
     ・中古／代車／内部 … 売上に数えない
   🔴 意味は `pitBadgeDesc(id)` 1本に聞く。ここで文を書かない。
   ⚠ 押せない時の理由（`why`）は**消さない**。意味と両方あるなら2行にして両方出す
     （「なぜ押せないか」は、意味より先に知りたいので上に置く）。
   ================================================================ */
function _chipTitle(id, why){
  var d = (window.pitBadgeDesc ? pitBadgeDesc(id) : '');
  var t = why ? (d ? (why + '\n' + d) : why) : d;
  return t ? (' title="' + String(t).replace(/"/g, '&quot;') + '"') : '';
}
function _wtChipBtn(it, active, off, why){
  let style = '';
  if (active && it.color) style = 'background:' + it.color + ';color:#fff;border-color:' + it.color + ';';
  else if (it.color)      style = 'border-color:' + it.color + ';color:' + it.color + ';';
  if (off) style += 'opacity:.35;';
  return '<button type="button" class="cf-chip' + (active ? ' active' : '') + (off ? ' cf-chip-off' : '') + '"'
       + ' data-val="' + it.id + '"' + (off ? ' disabled' : '') + _chipTitle(it.id, off ? why : '')
       + ' style="' + style + '">' + it.label + '</button>';
}

/* ===================================================================
   🔧 v2.6.0 社内車両（中古・代車・内部）の時の「押せる／押せない」
   -------------------------------------------------------------------
   🔴 判定は intern-pit.js の1本に聞く。ここで c.internKind を直に見ない。
      ・中古／内部 … 作業タイプは1つも押せない（単独で立つ）
      ・代車       … 車検／12点／一般／B.P のどれか **1つだけ** 押せる（相方）
   =================================================================== */
function _internOn(c){ return !!(window.pitCardIntern && pitCardIntern(c)); }
function _internName(c){ return (window.pitInternLabel ? pitInternLabel(c) : '') || '社内車両'; }
/* その作業タイプを押せるか（社内車両でない時はいつでも押せる） */
function _wtAllowed(id, c){
  var k = window.pitInternKind ? pitInternKind(c) : '';
  if (!k) return true;
  if (k !== 'loanercar') return false;
  return (window.PIT_LOANER_MATES || []).indexOf(id) >= 0;
}
function _wtWhy(c){
  var k = window.pitInternKind ? pitInternKind(c) : '';
  if (k === 'loanercar') return '代車は 車検・12点・一般・B.P のどれか1つとセットです';
  return _internName(c) + 'を選んでいる間は、作業タイプは選びません';
}
/* 入れられない欄のグレーの箱（見た目だけ・値は持たない） */
function _offBox(txt){ return '<div class="cf-offbox">' + txt + '</div>'; }
// v0.94.0 基本（単独選択）チップだけ。併用可は workTypeComboChips に分離＝同じ1行に横並びにする。
function workTypeChips(c){
  /* 📦 v2.51.0（G）`drawer` が付いたものはここに出さない＝「その他」の引き出しに置く（物販） */
  const base = (state.workTypes || []).filter(w => !w.combinable && !w.drawer);
  const why  = _wtWhy(c);
  let h = '<div class="cf-chips" data-key="workType">';
  base.forEach(it => { h += _wtChipBtn(it, c.workType === it.id, !_wtAllowed(it.id, c), why); });
  h += '</div>';
  return h;
}
// v0.94.0 併用可チップ（複数選択＝c.workAddons）。ラベルはフィールド側の「併用可」。チップ大きさは基本と同じ(.cf-chip)。
function workTypeComboChips(c){
  const combo = (state.workTypes || []).filter(w => w.combinable && !w.drawer);
  const adds = Array.isArray(c.workAddons) ? c.workAddons : [];
  const why  = _wtWhy(c);
  let h = '<div class="cf-chips" data-key="workAddons" data-combo="1">';
  combo.forEach(it => { h += _wtChipBtn(it, adds.indexOf(it.id) >= 0, !_wtAllowed(it.id, c), why); });
  h += '</div>';
  return h;
}
/* ===================================================================
   🗄 v2.6.0 「その他」＝ふだんあまり使わない印をまとめた引き出し（旧「特殊」）
   -------------------------------------------------------------------
   🗣 ゆうた「特殊→保証 の部分を『その他』に。これはバッジではなく詳細が展開するという意味。
   　　通常あまり使用しないバッジが入ってるという感じ」
   中身は2段。
     ① **付加**（複数可・売上も実績も通常どおり）… 保証 / 保険 / 社員
     ② **社内区分**（1つだけ・売上が立たない）… 中古 / 代車 / 内部
   🔴 社内区分を選んでいる間は、①も作業タイプも押せない
      （代車だけ「車検・12点・一般・B.P のどれか1つ」を相方に選ぶ）。
   ⚠ 引き出しの開け閉めは画面の都合なので **カードには保存しない**（下の `_cfOtherOpen`）。
   =================================================================== */
var _cfOtherOpen = false;

/* いま「その他」に何が入っているかの短い言葉（閉じていても分かるようにボタンへ出す） */
function _otherSummary(c){
  var out = [];
  (Array.isArray(c.workSpecials) ? c.workSpecials : []).forEach(function (id) {
    var lb = window.pitSpecialLabel ? pitSpecialLabel(id) : '';
    if (lb) out.push(lb);
  });
  if (_internOn(c)) out.push(_internName(c));
  return out;
}
function workTypeOtherBtn(c){
  var sum = _otherSummary(c);
  var lb  = sum.length ? ('その他：' + sum.join('・')) : 'その他';
  return '<div class="cf-chips" data-other="1"><button type="button" id="cf-other-btn" class="cf-chip cf-other-btn'
       + (sum.length ? ' active' : '') + '" title="保証・保険・社員／中古・代車・内部">'
       + lb + ' <span class="cf-other-caret">' + (_cfOtherOpen ? '▲' : '▼') + '</span></button></div>';
}
function otherPanelHtml(c){
  if (!_cfOtherOpen) return '';
  var GREY = '#6b7280';
  var arr  = Array.isArray(c.workSpecials) ? c.workSpecials : [];
  var kind = window.pitInternKind ? pitInternKind(c) : '';
  var hasWork = !!c.workType || (Array.isArray(c.workAddons) && c.workAddons.length > 0);
  var addOff  = !!kind || !hasWork;
  var addWhy  = kind ? (_internName(c) + 'を選んでいる間は付けられません')
                     : '作業タイプを選ぶと押せます（単体では選べません）';

  var h = '<div class="cf-other-panel">';

  /* ① 付加 */
  h += '<div class="cf-other-sec">';
  h += '<div class="cf-other-lb">付加<span>作業タイプとセットで付ける印。売上・実績は通常どおり</span></div>';
  h += '<div class="cf-chips" data-key="workSpecials" data-special="1">';
  (window.PIT_WORK_SPECIALS || []).forEach(function (it) {
    var active = arr.indexOf(it.id) >= 0;
    var style  = active ? ('background:' + GREY + ';color:#fff;border-color:' + GREY + ';')
                        : ('border-color:' + GREY + ';color:' + GREY + ';');
    if (addOff) style += 'opacity:.35;';
    h += '<button type="button" class="cf-chip' + (active ? ' active' : '') + (addOff ? ' cf-chip-off' : '') + '"'
       + ' data-val="' + it.id + '"' + (addOff ? ' disabled' : '') + _chipTitle(it.id, addOff ? addWhy : '')
       + ' style="' + style + '">' + it.label + '</button>';
  });
  h += '</div></div>';

  /* ② 社内区分 */
  h += '<div class="cf-other-sec">';
  h += '<div class="cf-other-lb">社内区分<span>自社の車。売上には数えません（実績には残ります）</span></div>';
  h += '<div class="cf-chips" data-key="internKind" data-intern="1">';
  /* 🔴🔴 v2.53.0（ゆうた 2026-09-01）**代車はここから選べない。**
     🗣「新規予約や通常の予約詳細編集画面から代車は非表示でいいのでは？
     　　入力は全部ここ（作業予定ボード）から。でここで終わりってことになるでしょ？」
     ◎なぜ塞ぐか
       代車の整備カードは**作業予定ボードで生まれて、ボードの「完了する」で終わる**。
       ここからも作れると入口が2つになり、実際に
       「候補ゼロ・入庫日未定なのに作業中」という**どの画面にも出てこない迷子**ができた（2026-09-01・J72348）。
     ◎見えるけど押せない（ゆうた指定）
       すでに代車になっているカードを開いた時に**何のカードか分からなくなる**ため、札は出す。
     ⚠ 中古・内部はそのまま選べる。
        中古は作業予定ボードに出てこない（代車・社用車ではない）ので、塞ぐと作る道が無くなる。 */
  (window.PIT_INTERN_KINDS || []).forEach(function (it) {
    var active = (kind === it.id);
    var lock   = (it.id === 'loanercar');
    var style  = active ? ('background:#0f766e;color:#fff;border-color:#0f766e;')
                        : ('border-color:#0f766e;color:#0f766e;');
    if (lock && !active) style += 'opacity:.35;';
    if (lock) style += 'cursor:default;';
    h += '<button type="button" class="cf-chip' + (active ? ' active' : '') + (lock ? ' cf-chip-lock' : '') + '"'
       + ' data-val="' + it.id + '"' + (lock ? ' disabled' : '')
       + _chipTitle(it.id, lock ? '代車の整備は「代車・自社車両管理」の作業予定ボードから足します（ここでは選べません）' : '')
       + ' style="' + style + '">' + it.label + '</button>';
  });
  if (kind === 'loanercar'){
    h += '<div class="cf-other-note">この予約は<b>代車の整備</b>です。日を決めるのも終わらせるのも'
       + '<b>代車・自社車両管理の「代車作業予定」</b>から行います。ここでは変えられません。</div>';
  }
  h += '</div>';
  if (kind === 'loanercar'){
    var mate = window.pitInternMate ? pitInternMate(c) : '';
    h += '<div class="cf-other-note' + (mate ? '' : ' warn') + '">'
       + (mate ? ('この車は「' + _internName(c) + '」として扱います。')
               : '🔴 上の作業タイプから <b>車検・12点・一般・B.P</b> のどれか1つを選んでください（代車はセットで押します）。')
       + '</div>';
  } else if (kind){
    h += '<div class="cf-other-note">この車は「' + _internName(c) + '」として扱います。'
       + '金額・完TEL・洗車・伝票はありません。実績にはなりますが、売上には数えません。</div>';
  }
  h += '</div>';

  /* ③ 📦 v2.51.0（G・ゆうた 2026-09-01）作業だけの引き出し＝いまは「物販」だけ。
     🔴🔴 **すぐ上の社内区分（中古・代車・内部）とは意味が正反対。**
     　 社内区分＝自社の車で**売上に数えない**／物販＝**売上も実績も通常どおり**。
     　 見た目が並んでいるので、次に触る人が同じ扱いにしないよう、注意書きも別にしてある。
     ⚠ 選ぶと他の作業タイプは全部おりる（`alone`）。社内区分を選んでいる間は押せない。 */
  var _draw = (state.workTypes || []).filter(function(w){ return w.drawer; });
  if (_draw.length){
    var goodsOn = (window.pitCardGoods && pitCardGoods(c));
    h += '<div class="cf-other-sec">';
    h += '<div class="cf-other-lb">作業なし<span>物だけを売った時。売上も実績も通常どおりです</span></div>';
    h += '<div class="cf-chips" data-key="workType" data-drawerwt="1">';
    _draw.forEach(function (it) {
      var active = (c.workType === it.id);
      var off    = !!kind;
      var style  = active ? ('background:' + it.color + ';color:#04211d;border-color:' + it.color + ';')
                          : ('border-color:' + it.color + ';color:' + it.color + ';');
      if (off) style += 'opacity:.35;';
      h += '<button type="button" class="cf-chip' + (active ? ' active' : '') + (off ? ' cf-chip-off' : '') + '"'
         + ' data-val="' + it.id + '"' + (off ? ' disabled' : '') + _chipTitle(it.id, off ? _wtWhy(c) : '')
         + ' style="' + style + '">' + it.label + '</button>';
    });
    h += '</div>';
    if (goodsOn){
      h += '<div class="cf-other-note">この予約は「物販」です。作業タイプ・作業者・洗車・車販部門への依頼はありません。'
         + '<b>売上は通常どおり立ちます。</b>メーカー・車種は空でも入力チェックに出ません（課はどちらかに振ってください）。</div>';
    }
    h += '</div>';
  }

  h += '</div>';
  return h;
}
/* 作業タイプ（基本 or 併用可）が1つも無くなったら、付加（保証/保険/社員）は自動で外す＝単体で残さない。 */
function _clearSpecialsIfNoWork(c){
  const hasWork = !!c.workType || (Array.isArray(c.workAddons) && c.workAddons.length > 0);
  if (!hasWork && Array.isArray(c.workSpecials) && c.workSpecials.length) c.workSpecials = [];
}
/* 表示用 c.workTypes（基本＋併用の順）を同期。週/当日/PITカードの作業バッジはこれを見る。 */
function _syncWorkTypes(c){
  const ids = [];
  if (c.workType) ids.push(c.workType);
  (Array.isArray(c.workAddons) ? c.workAddons : []).forEach(a => { if (a && ids.indexOf(a) < 0) ids.push(a); });
  c.workTypes = ids;
}

function toggle(c, key, onLabel, offLabel){
  const on = !!c[key];
  return '<div class="cf-toggle" data-key="' + key + '">' +
    '<button type="button" class="cf-tg' + (on ? ' active' : '') + '" data-val="1">' + onLabel + '</button>' +
    '<button type="button" class="cf-tg' + (!on ? ' active' : '') + '" data-val="0">' + offLabel + '</button>' +
    '</div>';
}

function staffSelect(c, key){
  const div = c.division || '';   // 課が選ばれていれば、その課＋全社(課なし)のメンバーだけ出す
  // 役割で絞る：フロント担当＝フロントのみ／完TEL担当＝受付＋フロント
  const frontOnly  = (key === 'frontStaff');
  const frontOrRcv = (key === 'completeCallStaff');
  /* 🔴 v1.24.0（ゆうた指定）：予約担当だけは特別扱い。
     ＝メンバー画面で「受付」にチェックが入っている人を、1課/2課に関係なく全員出す。
     電話は課を問わず取るので、課で絞ると候補から消えてしまうため。 */
  const rcvOnly    = (key === 'reserveStaff');
  let h = '<select class="cf-input" data-key="' + key + '">';
  h += '<option value="">―</option>';
  /* v1.8.0：いま入っている担当が候補に無い場合（辞めた人・名簿外の元スタッフ・別の課）でも
     選択肢として残す＝開いただけで担当が消えてしまう事故を防ぐ。 */
  const _cur = (c[key] || '').trim();
  let _curFound = false;
  state.staff.forEach(s => {
    /* 別の課のメンバーは一覧から消す。受付課・その他・未所属の人はどの課でも出す。
       兼任（1課かつ2課）の人は両方に出る（v1.6.0） */
    if (div && !rcvOnly && !_staffInDiv(s, div)) return;        // v1.24.0 予約担当は課で絞らない
    if (frontOnly  && !s.front) return;                         // フロント担当＝フロント業務ありのみ
    if (rcvOnly    && !s.reception) return;                     // v1.24.0 予約担当＝「受付」チェックの人だけ
    if (frontOrRcv && !(s.front || s.reception)) return;        // 完TEL＝受付＋フロント（メカのみは出さない）
    const sel = c[key] === s.name ? ' selected' : '';
    if (sel) _curFound = true;
    h += '<option value="' + s.name + '"' + sel + '>' + s.name + '</option>';
  });
  if (_cur && !_curFound) {
    const _m = window.pitStaffAny ? pitStaffAny(_cur) : null;
    const _mk = _m && _m.left ? '（退職）' : (_m ? '' : '（名簿外）');
    h += '<option value="' + _cur + '" selected>' + _cur + _mk + '</option>';
  }
  h += '</select>';
  return h;
}
/* 担当の名前→その人の課。課が変わったら、別の課の担当はクリア（一覧から消える挙動に合わせる） */
/* その人がこの課の候補に出るか。1課/2課に属していない人（受付課・その他・未所属）は常に出る。 */
function _staffInDiv(s, div){
  const ds = (Array.isArray(s.divisions) && s.divisions.length) ? s.divisions : (s.division ? [s.division] : []);
  const course = ds.filter(x => x === 'div1' || x === 'div2');
  return !course.length || course.indexOf(div) >= 0;
}
function _staffDivision(name){
  const m = (state.staff || []).find(s => s.name === name);
  if (!m) return '';
  const ds = (Array.isArray(m.divisions) && m.divisions.length) ? m.divisions : (m.division ? [m.division] : []);
  const course = ds.filter(x => x === 'div1' || x === 'div2');
  return course.length === 1 ? course[0] : '';   // 兼任・受付課などは課に縛られない（v1.6.0）
}
/* v1.24.0 予約担当は課に縛られないので、課を変えても消さない（フロント担当だけ） */
function _syncStaffToDivision(c){
  ['frontStaff'].forEach(function(k){
    const d = _staffDivision(c[k]);
    if (c[k] && d && c.division && d !== c.division) c[k] = '';
  });
}

/* ===== 内容セクションのテンプレ（自由入力に1行ずつ足せる） ===== */
const CF_MENU_TPL = [
  'エンジンオイル交換', 'オイル・エレメント交換', 'タイヤ交換（4本）', 'タイヤ組替・バランス',
  'バッテリー交換', 'ブレーキパッド交換', 'ワイパーゴム交換', 'エアコンフィルター交換',
  '12ヶ月点検', '車検整備一式', '下回り点検・洗浄', 'ヘッドライト光軸調整',
  '冷却水（LLC）交換', '持ち込み部品取付', '見積り後に連絡'
];
/* テンプレ開閉（再描画せずパネルをトグル＝開いたまま連続で足せる） */
function cfMenuTplToggle(btn){
  const wrap = btn.closest('.cf-tpl');
  if (wrap) wrap.classList.toggle('open');
}
/* テンプレを内容（c.menu）に1行ずつ追記（テキストへ直接反映＝再描画なし） */
function cfMenuAddTpl(i){
  const c = state.cards.find(x => x.id === _editingCardId); if (!c) return;
  const t = CF_MENU_TPL[i]; if (!t) return;
  const ta = document.querySelector('textarea.cf-input[data-key="menu"]');
  const cur = (c.menu || '').replace(/\s+$/, '');
  c.menu = cur ? (cur + '\n' + t) : t;
  if (ta) { ta.value = c.menu; ta.focus(); }
  if (window.PitDB) PitDB.save();
}
window.cfMenuTplToggle = cfMenuTplToggle;
window.cfMenuAddTpl = cfMenuAddTpl;

/* ===== ナンバー：見た目は1BOX、クリックで「地名/分類番号/かな/ナンバー」のガイドが開く（スペース揺れ防止） ===== */
/* 地名＝陸運局（ナンバー管轄）。datalistで候補表示＝オート入力。未収録でも手入力可。
   並びは関東（地元の千葉エリア）から＝よく使う順。
   ============================================================
   🔴 v2.18.1（ゆうた報告 2026-08-28「ナンバーの候補に市原がない」）
      国土交通省の「ナンバープレート表示（地域名）」の表と**1つずつ突き合わせた**。
      ・足りなかった … **市原**（千葉・2020年のご当地）／**郡山・白河**（福島・同）
      ・入っていたが**存在しない地名** … さいたま（大宮）／栃木（正しくは「とちぎ」）／
        飯田（南信州の管轄の市）／周南（山口の管轄の市）→ **消した**
      ⚠ 存在しない地名を候補に出すと、**選べてしまう＝そのまま登録される**。
        候補は「打つ手間を省くもの」であって、**無い地名を作る所ではない**。
   🔴 ここは**全国ぶんの唯一の表**（見張り＝`test_plate_regions.mjs` が国交省の表と突き合わせる）。
      足す・消す時は必ず出どころ（国交省の表）を見てからにすること。
   ⚠ 2025年5月のご当地（十勝／日光／江戸川／安曇野／南信州／彦根）まで入っている。
   ============================================================ */
const PLATE_REGIONS = [
  // 千葉（地元）
  '野田','柏','習志野','千葉','松戸','船橋','市川','成田','袖ヶ浦','市原',
  // 東京
  '品川','練馬','足立','多摩','八王子','世田谷','杉並','板橋','江東','葛飾','江戸川',
  // 埼玉
  '大宮','川口','所沢','川越','熊谷','春日部','越谷',
  // 神奈川
  '横浜','川崎','湘南','相模',
  // 茨城・栃木・群馬
  '水戸','土浦','つくば','宇都宮','とちぎ','那須','日光','群馬','前橋','高崎',
  // 北海道
  '札幌','函館','旭川','室蘭','苫小牧','釧路','帯広','北見','知床','十勝',
  // 東北
  '青森','八戸','弘前','岩手','盛岡','平泉','宮城','仙台','秋田','山形','庄内','福島','郡山','会津','白河','いわき',
  // 甲信越・北陸
  '新潟','長岡','上越','富山','金沢','石川','福井','山梨','富士山','長野','松本','諏訪','安曇野','南信州',
  // 東海
  '岐阜','飛騨','静岡','浜松','沼津','伊豆','名古屋','尾張小牧','一宮','春日井','三河','岡崎','豊田','豊橋','三重','鈴鹿','四日市','伊勢志摩',
  // 近畿
  '滋賀','彦根','京都','大阪','なにわ','和泉','堺','神戸','姫路','奈良','飛鳥','和歌山',
  // 中国・四国
  '鳥取','島根','出雲','岡山','倉敷','広島','福山','山口','下関','徳島','香川','高松','愛媛','高知',
  // 九州・沖縄
  '福岡','北九州','久留米','筑豊','佐賀','長崎','佐世保','熊本','大分','宮崎','鹿児島','奄美','沖縄'
];
function _pe(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
/* ひらがな→カタカナ */
function _toKatakana(s){ return String(s == null ? '' : s).replace(/[ぁ-ゖ]/g, function(ch){ return String.fromCharCode(ch.charCodeAt(0) + 0x60); }); }
/* 自動フリガナ：お客様名をIMEで打つと、変換前の読み（ひらがな）を拾ってカナ欄へ。手で直せる。
   仕組み：compositionupdate で変換前の読みを掴み、compositionend で確定ぶんをカナ欄に足す。
   英字直接入力や貼り付けは拾えない＝その時はカナ欄を手入力（だから編集可）。 */
function _bindAutoKana(nameEl, kanaEl, c){
  if (!nameEl || !kanaEl) return;
  const hasKanji = function(s){ return /[㐀-䶿一-鿿豈-﫿々々]/.test(s || ''); };
  let base = kanaEl.value || '';   // 確定済みカナ（再描画後も既存値から継続）
  let comp = '';                   // 変換“前”の読み（ひらがな）だけを保持
  nameEl.addEventListener('compositionstart', function(){ base = kanaEl.value || ''; comp = ''; });
  nameEl.addEventListener('compositionupdate', function(e){
    const d = e.data || '';
    if (hasKanji(d)) return;       // ★変換後（漢字候補）は拾わない＝「小林」がカナ欄に出ない
    comp = d;                      // 変換前の読みだけ更新
    kanaEl.value = base + _toKatakana(comp);
  });
  nameEl.addEventListener('compositionend', function(){
    base = base + _toKatakana(comp); comp = '';
    kanaEl.value = base; c.kana = base;
    if (window.PitDB) PitDB.save();
  });
  // 名前を空にしたらカナも空に（打ち直し時のゴミ防止）
  nameEl.addEventListener('input', function(){ if (!nameEl.value){ base = ''; comp = ''; kanaEl.value = ''; c.kana = ''; } });
}
/* 分類番号・ナンバー(一連)＝半角数字のみ。全角数字→半角、ハイフン/文字は禁止（除去）、桁数で切る。例「55－55」→「5555」 */
function _plateDigits(s, max){
  const v = String(s == null ? '' : s)
    .replace(/[０-９]/g, function(d){ return String.fromCharCode(d.charCodeAt(0) - 0xFEE0); })
    .replace(/[^0-9]/g, '');
  return v.slice(0, max || 4);
}
/* TEL：ナンバー同様、見た目は1BOX・クリックで3枠ガイドが開く。各枠は半角数字のみ（全角→半角・ハイフン/文字不可）、
   保存は "市外-市内-番号" にハイフン自動挿入。c.tel は従来どおり1文字列＝一覧/帳票そのまま。 */
function telInput(c){
  const p = String(c.tel || '').split('-');
  const v1 = _pe(p[0] || ''), v2 = _pe(p[1] || ''), v3 = _pe(p.slice(2).join('') || '');
  /* 🟡 v1.89.0 TEL は黄（入れたほうがいい）。枠を付ける目印をこのBOXに置く。
     ⚠ v1.76.0〜v1.88.0 は赤（必須）だった。振り分けの正は `_cardMarkMisses` の表。 */
  let h = '<div class="cf-tel" data-key="tel">';
  h += '<input type="text" class="cf-input cf-tel-main" data-tel-main readonly value="' + _pe(c.tel || '') + '" placeholder="クリックして入力" autocomplete="off">';
  h += '<div class="cf-tel-guide"><div class="cf-tel-row">';
  /* 🔵 v2.35.0 電話を打っている最中にも「似た方がいます」を出す */
  h += '<input type="text" class="cf-input cf-tel-1" data-tel="1" value="' + v1 + '" inputmode="numeric" maxlength="5" placeholder="090" oninput="pitRecallHint(this,event)">';
  h += '<span class="cf-tel-sep">-</span>';
  h += '<input type="text" class="cf-input cf-tel-2" data-tel="2" value="' + v2 + '" inputmode="numeric" maxlength="4" placeholder="1234" oninput="pitRecallHint(this,event)">';
  h += '<span class="cf-tel-sep">-</span>';
  h += '<input type="text" class="cf-input cf-tel-3" data-tel="3" value="' + v3 + '" inputmode="numeric" maxlength="4" placeholder="5678" oninput="pitRecallHint(this,event)">';
  h += '</div></div></div>';
  return h;
}

/* ===== その他連絡先（複数番号＋ラベル＋優先）。代表(優先)の番号が TEL 欄＝c.tel。全件は c.contacts に保持し顧客控え・検索に乗る ===== */
function _cfEnsureContacts(c){
  if(!Array.isArray(c.contacts) || !c.contacts.length){
    c.contacts = [{ tel: c.tel || '', label: '個人携帯', primary: true }];
  }
  if(!c.contacts.some(x=>x.primary)) c.contacts[0].primary = true;
  return c.contacts;
}
function contactsBtn(c){
  const n = (Array.isArray(c.contacts) && c.contacts.length) ? c.contacts.length : (c.tel ? 1 : 0);
  const extra = n > 1 ? ('<span class="cf-ct-badge">+' + (n - 1) + '</span>') : '';
  return '<button type="button" class="cf-contacts-btn" onclick="cfContactsOpen()"><i data-ic=phone data-ics=16></i> その他連絡先' + extra + '</button>';
}
function _cfRenderContacts(c){
  let m = document.getElementById('cf-contacts-modal');
  if(!m){ m = document.createElement('div'); m.id = 'cf-contacts-modal'; m.className = 'cm-overlay'; document.body.appendChild(m); }
  let h = '<div class="cm-box"><div class="cm-head"><i data-ic=phone data-ics=16></i> 連絡先 <span class="cm-sub">「優先」の番号がカードのTEL欄に出ます</span><button class="cm-x" onclick="cfContactsClose()"><i data-ic=close data-ics=16></i></button></div><div class="cm-body">';
  c.contacts.forEach(function(ct,i){
    const p = String(ct.tel || '').split('-');
    const v1 = _pe(p[0] || ''), v2 = _pe(p[1] || ''), v3 = _pe(p.slice(2).join('') || '');
    // 番号は本体と同じ「1BOX＋クリックで3枠ガイド」方式
    h += '<div class="cf-ct-row" data-ctidx="' + i + '">'
      + '<label class="cf-ct-pri"><input type="radio" name="cf-ct-pri" ' + (ct.primary ? 'checked' : '') + ' onchange="cfContactSetPrimary(' + i + ')"> 優先</label>'
      + '<div class="cf-tel cf-ct-telw">'
      +   '<input type="text" class="cf-input cf-tel-main" readonly value="' + _pe(ct.tel || '') + '" placeholder="クリックして入力" onclick="cfContactToggle(this)">'
      +   '<div class="cf-tel-guide"><div class="cf-tel-row">'
      +     '<input class="cf-input cf-ct-1" inputmode="numeric" maxlength="5" value="' + v1 + '" placeholder="090" oninput="cfContactTel(' + i + ')">'
      +     '<span class="cf-tel-sep">-</span>'
      +     '<input class="cf-input cf-ct-2" inputmode="numeric" maxlength="4" value="' + v2 + '" placeholder="1234" oninput="cfContactTel(' + i + ')">'
      +     '<span class="cf-tel-sep">-</span>'
      +     '<input class="cf-input cf-ct-3" inputmode="numeric" maxlength="4" value="' + v3 + '" placeholder="5678" oninput="cfContactTel(' + i + ')">'
      +   '</div></div>'
      + '</div>'
      + '<input class="cf-input cf-ct-label" value="' + _pe(ct.label || '') + '" placeholder="ラベル（例 会社携帯）" oninput="cfContactLabel(' + i + ',this.value)">'
      + '<button type="button" class="cf-ct-del" onclick="cfContactDel(' + i + ')" title="削除"><i data-ic=trash data-ics=16></i></button>'
      + '</div>';
  });
  h += '</div><div class="cm-foot"><button class="cm-cancel" onclick="cfContactAdd()">＋ 連絡先を追加</button><button class="cm-save" onclick="cfContactsClose()">完了</button></div></div>';
  m.innerHTML = h;
  m.classList.add('show');
  m.onclick = function(e){ if(e.target === m) cfContactsClose(); };
}
function _cfCard(){ return state.cards.find(x=>x.id===_editingCardId); }
/* 前回入庫（＝この顧客の直近の別カード。車両ではなく顧客単位）が代車を使っていたか */
function _prevIntakeLoaner(c){
  if (!c) return false;
  const np = s => String(s || '').replace(/\s+/g, '');
  const arr = state.cards || [];
  const myName = (c.customer || '').trim();
  let plates = [];
  if (c.customerId && state.customers){
    const cust = state.customers.find(x => x.id === c.customerId);
    if (cust) plates = (cust.vehicles || []).map(v => np(v.plate)).filter(Boolean);
  }
  const others = arr.filter(x => x.id !== c.id && (
    (c.customerId && x.customerId === c.customerId) ||
    (myName && (x.customer || '').trim() === myName) ||
    (plates.length && plates.indexOf(np(x.plate)) >= 0)
  ));
  if (!others.length) return false;
  others.sort((a, b) => (((b.returnDate || b.reserveDate) || '').localeCompare((a.returnDate || a.reserveDate) || '')));
  return !!others[0].needLoaner;
}
/* この顧客で新規車両を追加：ナンバー/メーカー/車種だけクリア（人・連絡先・担当/課/区分は継承）。
   保存すると c.customerId の人に新しいナンバーの車両として upsert される。 */
/* ---- ＋ この顧客で新規車両（乗り換え／増車）＝v1.49.0 ゆうた指定 ----
   🔴 **車両ごとの欄はぜんぶ空にする。**
      ⚠ v1.48.1 までは ナンバー・メーカー・車種 しか消しておらず、
         **カルテNo.（車両ごとの番号）が前の車のまま残っていた**（ゆうた指摘）。
         車両注意（左ハンドル/MT/車高/土禁）も同じ理由で車ごとなので消す。
      ⚠ 逆に **人につくもの**（お客様名・カナ・TEL・LINE・連絡先）は消さない。
      ⚠ 担当・課・国産/輸入は「その人の担当」として引き継ぐ＝消さない
         （車種を打てば carname-pit.js が国産/輸入を入れ直す）。
   🔴 kind='trade'（乗り換え）＝**いまのナンバーの車をアーカイブしてから**空にする。
      kind='add'（増車）＝前の車はそのまま。 */
window.cfAddVehicle = function(kind){
  const c=_cfCard(); if(!c) return;
  if (window.cfVehMenuClose) cfVehMenuClose();
  const oldPlate = (c.plate||'').trim();
  const oldName  = ((c.maker?c.maker+' ':'')+(c.car||'')).trim() || oldPlate || 'いまの車';
  /* 入力し直しになる操作なので、どちらも**一度確認してから**進める（v1.49.1 ゆうた指定）。
     ⚠ アプリの中のダイアログ（UI.confirm）を使う＝ブラウザ標準の confirm は画面が止まるので使わない。 */
  const ask = (window.UI && UI.confirm)
    ? UI.confirm(kind === 'trade' ? (oldName + ' から乗り換えますか？') : ('増車として、もう1台を登録しますか？'),
        { detail: (kind === 'trade'
            ? ((oldPlate ? 'ナンバー：' + oldPlate + '\n' : '') + '・' + oldName + ' をアーカイブします（入庫の履歴は顧客詳細に残ります）\n・車の欄（ナンバー・メーカー・車種・カルテNo.・車両注意）が空になります\n・お客様の名前・TEL・LINE はそのままです')
            : (oldName + ' はそのまま残ります。\n・車の欄（ナンバー・メーカー・車種・カルテNo.・車両注意）が空になります\n・お客様の名前・TEL・LINE はそのままです')),
          ok: (kind === 'trade' ? '乗り換えで登録' : '増車で登録'), cancel: 'やめる', danger: (kind === 'trade') })
    : Promise.resolve(true);
  ask.then(function(okd){
    if (!okd) return;
    if (kind === 'trade'){
      if (!oldPlate){
        if (window.pitToast) pitToast('ナンバーが入っていないので、前の車はアーカイブできません（増車として登録します）', 'PF-6003');
      } else {
        const done = window.PitArchive ? PitArchive.archiveVehByPlate(c.customerId, oldPlate, '乗換') : false;
        if (window.pitToast) pitToast(done ? (oldName + ' をアーカイブしました。新しい車を登録してください')
                                           : '前の車はまだ顧客の控えに無いので、そのまま新しい車を登録してください');
      }
    }
    /* 🔴 v1.52.0（ゆうた指定）ここから先は **新設した「顧客・車両の登録」画面に統合**した。
       ⚠ 前は「カードの車の欄を空にして手で打ち直す」だけで、車の控えは保存時に自動で作られていた。
          そのため **都度車両変動のような車ごとの設定を入れる場所が無かった**。
       ⚠ 登録画面で保存された車を、そのままこのカードに入れて続きを書ける。
       ⚠ 登録画面が無い場合（読み込み失敗）は、今までどおり欄を空にするだけで動く。 */
    if (window.PitCustReg && c.customerId){
      PitCustReg.open({
        mode:'vehicle', custId:c.customerId,
        base:{ boardId:c.boardId||'', division:c.division||'', frontStaff:c.frontStaff||'' },
        onSaved:function(cust, veh){
          if (window.custCloseModal) custCloseModal();
          c.plate=''; c.maker=''; c.car=''; c.karteNo=''; c.drive=[];
          c.perVisit=false; c.vehId='';
          if (veh){
            c.vehId = veh.id || '';
            if (veh.perVisit){ c.perVisit=true; }
            else { c.plate=veh.plate||''; c.maker=veh.maker||''; c.car=veh.car||''; }
            if (veh.karteNo) c.karteNo=veh.karteNo;
            if (veh.boardId) c.boardId=veh.boardId;
            if (veh.division) c.division=veh.division;
            if (veh.frontStaff) c.frontStaff=veh.frontStaff;
          }
          if (window.PitDB) PitDB.save();
          renderCardForm(c);
          if (window.pitToast) pitToast(veh && veh.perVisit ? '都度車両変動で登録しました。今回の車種名を入力してください' : '新しい車を登録しました');
        }
      });
      return;
    }
    /* 車両ごとの欄をぜんぶ空に（登録画面が使えない時の逃げ道） */
    c.plate=''; c.maker=''; c.car=''; c.karteNo='';
    c.drive=[]; c.perVisit=false; c.vehId='';
    if(window.PitDB) PitDB.save();
    renderCardForm(c);
  });
};
/* ---- 2択メニューの開け閉め（右上の保存メニューと同じ作り） ---- */
function cfVehMenuClose(){
  const m=document.getElementById('cf-veh-menu'); if(!m) return;
  m.classList.remove('open');
  const b=document.getElementById('cf-veh-menu-btn'); if(b) b.setAttribute('aria-expanded','false');
}
window.cfVehMenuClose = cfVehMenuClose;
window.cfVehMenuToggle = function(e){
  if(e) e.stopPropagation();
  const m=document.getElementById('cf-veh-menu'); if(!m) return;
  const open=!m.classList.contains('open');
  m.classList.toggle('open', open);
  const b=document.getElementById('cf-veh-menu-btn'); if(b) b.setAttribute('aria-expanded', open?'true':'false');
};
document.addEventListener('click', function(e){
  const m=document.getElementById('cf-veh-menu');
  if(m && m.classList.contains('open') && !m.contains(e.target)) cfVehMenuClose();
});
document.addEventListener('keydown', function(e){ if(e.key==='Escape') cfVehMenuClose(); });
window.cfContactsOpen = function(){ const c=_cfCard(); if(!c) return; _cfEnsureContacts(c); _cfRenderContacts(c); };
window.cfContactToggle = function(el){ const w=el.closest('.cf-tel'); if(w) w.classList.toggle('open'); };
window.cfContactTel = function(i){
  const c=_cfCard(); if(!c||!c.contacts[i]) return;
  const row=document.querySelector('#cf-contacts-modal .cf-ct-row[data-ctidx="'+i+'"]'); if(!row) return;
  const b1=row.querySelector('.cf-ct-1'), b2=row.querySelector('.cf-ct-2'), b3=row.querySelector('.cf-ct-3');
  b1.value=_plateDigits(b1.value,5); b2.value=_plateDigits(b2.value,4); b3.value=_plateDigits(b3.value,4);
  const tel=[b1.value.trim(),b2.value.trim(),b3.value.trim()].filter(Boolean).join('-');
  c.contacts[i].tel=tel;
  const main=row.querySelector('.cf-tel-main'); if(main) main.value=tel;
  if(c.contacts[i].primary) c.tel=tel;
  if(window.PitDB) PitDB.save();
};
window.cfContactLabel = function(i,val){ const c=_cfCard(); if(!c||!c.contacts[i]) return; c.contacts[i].label=val; if(window.PitDB) PitDB.save(); };
window.cfContactSetPrimary = function(i){ const c=_cfCard(); if(!c||!c.contacts[i]) return; c.contacts.forEach(x=>x.primary=false); c.contacts[i].primary=true; c.tel=c.contacts[i].tel||''; if(window.PitDB) PitDB.save(); };
window.cfContactAdd = function(){ const c=_cfCard(); if(!c) return; _cfEnsureContacts(c); c.contacts.push({tel:'',label:'',primary:false}); _cfRenderContacts(c); };
window.cfContactDel = function(i){
  const c=_cfCard(); if(!c||!Array.isArray(c.contacts)) return;
  c.contacts.splice(i,1);
  if(!c.contacts.length) c.contacts=[{tel:'',label:'個人携帯',primary:true}];
  if(!c.contacts.some(x=>x.primary)){ c.contacts[0].primary=true; }
  const pri=c.contacts.find(x=>x.primary); c.tel=pri?(pri.tel||''):'';
  _cfRenderContacts(c);
};
window.cfContactsClose = function(){
  const c=_cfCard();
  if(c && Array.isArray(c.contacts)){
    // 空（番号もラベルも空）の行は捨てる
    c.contacts=c.contacts.filter(x=>(x.tel||'').trim() || (x.label||'').trim());
    if(!c.contacts.length){ if(c.tel) c.contacts=[{tel:c.tel,label:'個人携帯',primary:true}]; }
    else if(!c.contacts.some(x=>x.primary)){ c.contacts[0].primary=true; }
    const pri=(c.contacts||[]).find(x=>x.primary);
    if(pri) c.tel=pri.tel||'';
    if(window.PitDB) PitDB.save();
  }
  const m=document.getElementById('cf-contacts-modal'); if(m){ m.classList.remove('show'); m.innerHTML=''; }
  if(c) renderCardForm(c);
};
/* c.plate（"野田 300 ひ 55-55"）を4分割。保存は常にこの合成文字列＝既存の一覧/帳票はそのまま使える */
function _platePartsOf(c){
  const toks = String(c.plate || '').trim().split(/\s+/).filter(Boolean);
  return { region: toks[0] || '', cls: toks[1] || '', kana: toks[2] || '', num: toks[3] || '' };
}
function plateInput(c){
  /* 🔴 v1.52.0 都度車両変動のお客様＝**ナンバーは持たない**（ゆうた指定）。
     ナンバー欄の代わりに印を出して、「車種名を入れてください」とだけ伝える。
     ⚠ 打った車種名（c.car）は、予約カード・表紙印刷・実績ボード・履歴に**そのまま**出る。
     ⚠ 車の登録側は書き換えないので、次の予約でまた別の車種名を同じカルテNo.で入れられる。 */
  if (c && c.perVisit){
    return '<div class="cf-plate cf-plate-pv">'
         + '<div class="cf-pv-badge" title="この車両は「都度車両変動」で登録されています">'
         + '<i data-ic=swap data-ics=15></i> 都度車両変動（ナンバーなし）</div>'
         + '<div class="cf-pv-hint">今回入る車の<b>車種名</b>を下の「車種（グレード）」に入れてください。'
         + 'カルテNo.・担当・課はこのお客様で共通です。</div>'
         + '</div>';
  }
  return _plateGuideHtml(c.plate);
}
/* 🔴 v1.54.0 ナンバー入力補助の中身を、**入庫カード以外からも使える形**に切り出した。
   ⚠ 顧客・車両の登録画面（cust-reg.js）が同じものを使う＝**写しを作らない**。
      写しにすると、片方だけ直して食い違う（CarFlow のホバーで実際にやってしまっている）。 */
function _plateGuideHtml(plateStr){
  // v0.83.0「新規車両」スイッチON＝ナンバー未定の新しい車（plate に文言「新規車両」を入れる）
  const isNew = (String(plateStr || '').trim() === '新規車両');
  const p = isNew ? { region:'', cls:'', kana:'', num:'' } : _platePartsOf({ plate: plateStr });
  const c = { plate: plateStr };
  let h = '<div class="cf-plate">';
  h += '<input type="text" class="cf-input cf-plate-main" data-plate-main readonly value="' + _pe(c.plate || '') + '" placeholder="クリックして入力" autocomplete="off">';
  h += '<div class="cf-plate-guide">';
  h += '<div class="cf-plate-row">';                       // v0.83.0 既存グリッドはそのまま・右側にスイッチ列を足すための横並び
  h += '<div class="cf-plate-grid">';
  h += '<div><div class="cf-plate-l">地名（管轄）</div><input class="cf-input cf-plate-region" list="cf-plate-regions" data-plate="region" value="' + _pe(p.region) + '" placeholder="野田" autocomplete="off"></div>';
  h += '<div><div class="cf-plate-l">分類</div><input class="cf-input cf-plate-cls" data-plate="cls" value="' + _pe(p.cls) + '" placeholder="300" inputmode="numeric" maxlength="3"></div>';
  h += '<div><div class="cf-plate-l">かな</div><input class="cf-input cf-plate-kana" data-plate="kana" value="' + _pe(p.kana) + '" placeholder="ひ" maxlength="1"></div>';
  h += '<div><div class="cf-plate-l">ナンバー</div><input class="cf-input cf-plate-num" data-plate="num" value="' + _pe(p.num) + '" placeholder="5555" inputmode="numeric" maxlength="4"></div>';
  h += '</div>';
  // v0.83.0 右側＝「新規車両」スイッチ。押すとナンバー欄に「新規車両」と入る（ナンバーがまだ無い新しい車向け）
  h += '<div class="cf-plate-side">';
  h += '<button type="button" class="cf-plate-newveh' + (isNew ? ' on' : '') + '" data-plate-newveh>新規車両</button>';
  h += '<div class="cf-plate-side-hint">ナンバー未定の<br>新しい車に</div>';
  h += '</div>';
  h += '</div>';                                           // /.cf-plate-row
  h += '<datalist id="cf-plate-regions">';
  PLATE_REGIONS.forEach(function (r){ h += '<option value="' + r + '"></option>'; });
  h += '</datalist>';
  h += '</div></div>';
  return h;
}

/* 🔴 v1.54.0 ナンバー入力補助の配線。入庫カードと登録画面で**同じものを使う**。
   onChange には合成したナンバー文字列（例「野田 300 ひ 5555」）が渡る。 */
function _bindPlateGuide(plateWrap, onChange){
  if (!plateWrap) return;
  const mainEl = plateWrap.querySelector('[data-plate-main]');
  const newVehBtn = plateWrap.querySelector('[data-plate-newveh]');   // v0.83.0「新規車両」スイッチ
  const recompose = () => {
    const g = sel => { const x = plateWrap.querySelector(sel); return x ? x.value.trim() : ''; };
    const v = [g('.cf-plate-region'), g('.cf-plate-cls'), g('.cf-plate-kana'), g('.cf-plate-num')].filter(Boolean).join(' ');
    if (mainEl) mainEl.value = v;
    if (onChange) onChange(v);
  };
  plateWrap.querySelectorAll('[data-plate]').forEach(el => el.addEventListener('input', () => {
    const part = el.dataset.plate;
    if (part === 'cls') el.value = _plateDigits(el.value, 3);        // 分類＝半角数字3桁
    else if (part === 'num') el.value = _plateDigits(el.value, 4);   // ナンバー＝半角数字4桁・ハイフン/文字禁止・全角→半角
    else if (part === 'kana') el.value = el.value.slice(0, 1);       // かな＝1文字
    recompose();
    if (newVehBtn) newVehBtn.classList.remove('on');                 // v0.83.0 ナンバーを打ったら「新規車両」は自動で解除
  }));
  // v0.83.0「新規車両」スイッチ：押すと plate='新規車両'。もう一度押すと解除。
  if (newVehBtn){
    newVehBtn.addEventListener('click', () => {
      const willOn = !newVehBtn.classList.contains('on');
      newVehBtn.classList.toggle('on', willOn);
      if (willOn){
        plateWrap.querySelectorAll('[data-plate]').forEach(el => { el.value = ''; });   // 4枠はクリア
        if (mainEl) mainEl.value = '新規車両';
        if (onChange) onChange('新規車両');
        plateWrap.classList.remove('open');                          // 押したら閉じる
      } else {
        recompose();                                                 // 空の4枠から合成
      }
    });
  }
  const openGuide = () => plateWrap.classList.add('open');
  if (mainEl){
    mainEl.addEventListener('focus', openGuide);
    mainEl.addEventListener('click', () => { openGuide(); const r = plateWrap.querySelector('.cf-plate-region'); if (r) setTimeout(() => r.focus(), 0); });
  }
  // フォーカスがガイドの外へ出たら閉じる（クリック外し・Tab抜け両対応）
  plateWrap.addEventListener('focusout', (e) => { if (!plateWrap.contains(e.relatedTarget)) plateWrap.classList.remove('open'); });
}

/* 🔴 v1.54.0 登録画面（cust-reg.js）にも同じ入力補助を貸す入口。
   ⚠ 中身を写さないこと。ここを直せば両方が直る。 */
window.pitPlateGuideHtml = _plateGuideHtml;
window.pitBindPlateGuide = _bindPlateGuide;
window.pitBindAutoKanaSeg = _bindAutoKanaSeg;
window.pitPlateDigits = _plateDigits;
window.pitToKatakana = _toKatakana;

function loanerSelect(c, key){
  let h = '<select class="cf-input" data-key="' + key + '">';
  h += '<option value="">使用代車を選ぶ</option>';
  /* 🔴 v1.80.0 選べる代車は loaner-free.js の1本で決める
     （緊急車両は予約側に出さない・v0.101.5／**引退した代車も出さない**）。
     ⚠ ただし、そのカードが既に選んでいる代車は、引退していても一覧に残す
        ＝黙って選択が外れると「代車が消えた」ことに気づけないため。 */
  const _sel = (window.pitLoanerUsableList ? pitLoanerUsableList()
              : (state.loaners || []).filter(l => !l.emergency)).slice();
  if (c[key] && !_sel.some(l => l.id === c[key])){
    const cur = (state.loaners || []).find(l => l.id === c[key]);
    if (cur) _sel.unshift(cur);
  }
  _sel.forEach(l => {
    const sel = c[key] === l.id ? ' selected' : '';
    const gone = l.retired ? '（引退）' : '';
    h += '<option value="' + l.id + '"' + sel + '>' + (window.pitVehLabel ? pitVehLabel(l) : (l.name + ' ' + l.model)) + gone + '</option>';
  });
  h += '</select>';
  return h;
}

/* ✂️ v2.13.1 `paymentSelect()` を消した（ゆうた「支払いは丸ごとカット」）。
   ⚠ **定義してあるだけで、どこからも呼んでいなかった。** 支払いの行を外したので一緒に片づけた。
      呼ばれない関数を残すと、次に読む人が「まだ使う所がある」と思って調べ直す。 */

function conditionChips(c){
  const arr = c.loanerConditions || [];
  let h = '<div class="cf-chips" data-key="loanerConditions" data-multi="1">';
  state.loanerConditions.forEach(it => {
    const active = arr.indexOf(it.id) >= 0;
    h += '<button type="button" class="cf-chip' + (active ? ' active' : '') + '" data-val="' + it.id + '">' + it.label + '</button>';
  });
  h += '</div>';
  return h;
}

/* ========================================
   イベントバインド：入力即反映（自動保存）
   ======================================== */
function bindCardFormEvents(root){
  const c = state.cards.find(x => x.id === _editingCardId);
  if (!c) return;

  /* 🔴 v1.59.1（ゆうた報告）**打つたびに、画面いちばん上の見出しも書き直す。**
     ⚠ 見張りは**この1本だけ**。個々の入力欄に足して回らない（足し忘れが必ず出るため）。
        入力欄それぞれのハンドラが先に走ってカードへ値を入れ、そのあと泡が上がってここに来る。
     ⚠ 中身が変わっていない時は `pitCardTitleRefresh()` が何もしないので、置きっぱなしで軽い。 */
  ['input', 'change', 'click'].forEach(function(ev){
    root.addEventListener(ev, function(){ pitCardTitleRefresh(); });
  });

  // テキスト・select
  root.querySelectorAll('input.cf-input, textarea.cf-input, select.cf-input').forEach(el => {
    if (el.dataset.key === 'reserveDate') el.dataset.prev = el.value;   // 受付○△×ガード用に元の日付を控える
    el.addEventListener('input', () => {
      const key = el.dataset.key;
      if (!key) return;   // data-key の無い入力（ナンバー小分け等）は別ハンドラで処理
      let v = el.value;
      if (el.type === 'number') v = v === '' ? null : Number(v);
      c[key] = v;
      if (_cardCheckOn) _cardMarkMisses(c, root);   // 入力したら、その項目の赤枠はその場で外れる
      if (window.PitDB) PitDB.save();   // v0.83.1 入力を自動保存（従来は close/unload 任せで取りこぼし＝「保存されない」原因）
      /* 🆕 v1.157.0（ゆうた指定）**打っている最中に、最短入庫日と緑の帯をリニアに動かす。**
         ⚠ ここで renderCardForm を呼ばないこと（焦点が飛んで数字が打てなくなる）。 */
      if (key === 'estHoldDays' || key === 'loanerFrom' || key === 'loanerTo'){
        if (window.pitCfPlanSync) pitCfPlanSync(c);
      }
    });
    el.addEventListener('change', () => {
      const key = el.dataset.key;
      if (!key) return;
      let v = el.value;
      if (el.type === 'number') v = v === '' ? null : Number(v);
      /* 入庫日の変更は受付○△×ガードを通す（×・休＝「それでも入れますか？」・△＝一言トースト・強制はしない）
         🔵 v1.74.1 ガードがアプリ内ダイアログになった＝**答えを待ってから続きをやる**。
         ⚠ 続きは `_applyChange` 1本に切り出して、どちらの道からも同じものを通す（写しを作らない）。 */
      if (key === 'reserveDate' && window.pitIntakeGuard) {
        pitIntakeGuard(c, v, el.dataset.prev || '', function (fin) {
          if (fin !== v) el.value = fin;
          el.dataset.prev = fin;
          _applyChange(fin);
        });
        return;
      }
      _applyChange(v);

      function _applyChange(v){
      c[key] = v;
      if (window.PitDB) PitDB.save();   // v0.83.1 変更を自動保存
      /* v1.8.0：担当を選んだら「誰か（メンバーの番号）」も一緒に持つ。
         ＝結婚などで名前が変わっても、過去のカードの担当が自動でついてくる。 */
      if (key === 'frontStaff' || key === 'reserveStaff' || key === 'completeCallStaff') {
        const _m = (v && window.pitStaffByName) ? pitStaffByName(v) : null;
        c[key + 'Id'] = _m ? _m.id : '';
      }
      // 担当（フロント）を選んだら、その人の課を自動選択（→課チップ点灯）
      // v1.24.0 予約担当は課に縛られないので、選んでも課は動かさない
      if (key === 'frontStaff' && v) {
        const d = _staffDivision(v);
        if (d && c.division !== d) c.division = d;
      }
      // v0.84.0 右パネル（選んだ日の入庫/返車・担当のMHS予定・担当ハイライト）を更新するため再描画
      // v0.92.0 LINE状態・Lステップ番号の変更でも再描画（OK選択でLステップ欄を出す／リンク生成）
      if (key === 'reserveDate' || key === 'frontStaff' || key === 'reserveStaff' || key === 'lineStatus' || key === 'lstepId') { renderCardForm(c); return; }
      }
    });
  });

  // 姓名／カナ（1BOX 2セグメント）→ customer/kana を半角空白で合成＋自動フリガナ（姓→姓カナ・名→名カナ）
  (function(){
    const segs = {};
    root.querySelectorAll('.cf-nb-seg').forEach(function(el){ segs[el.dataset.name] = el; });
    const recompose = function(){
      c.sei = ((segs.sei && segs.sei.value) || '').trim();
      c.mei = ((segs.mei && segs.mei.value) || '').trim();
      c.seiKana = ((segs.seiKana && segs.seiKana.value) || '').trim();
      c.meiKana = ((segs.meiKana && segs.meiKana.value) || '').trim();
      c.customer = [c.sei, c.mei].filter(Boolean).join(' ');
      c.kana = [c.seiKana, c.meiKana].filter(Boolean).join(' ');
      if (_cardCheckOn) _cardMarkMisses(c, root);
      if (window.PitDB) PitDB.save();
    };
    ['sei', 'mei', 'seiKana', 'meiKana'].forEach(function(k){ if (segs[k]) segs[k].addEventListener('input', recompose); });
    _bindAutoKanaSeg(segs.sei, segs.seiKana, recompose);   // 姓→姓カナ
    _bindAutoKanaSeg(segs.mei, segs.meiKana, recompose);   // 名→名カナ
  })();

  // 入庫時刻：メインBOX直接入力（全角→半角）＋フォーカスで下にショートカット（AM/PM/決まり次第/未定）
  // 🔴 v1.60.0 配線も return-slot.js の pitTimeGuideBind ひとつ（返車時間の欄と共通）。ここに書き写さない。
  (function(){
    const timeWrap = root.querySelector('.cf-time');
    if (!timeWrap) return;
    if (window.pitTimeGuideBind){
      pitTimeGuideBind(timeWrap, {
        onInput:  function(v){ c.reserveTime = v; },                              // 打っている最中（保存しない）
        onCommit: function(v){ c.reserveTime = v; if (window.PitDB) PitDB.save(); } // 確定（900→09:00 に整形済み）
      });
      return;
    }
  })();

  // TEL：見た目1BOX。クリックで3枠ガイドを開く。半角数字のみ→ c.tel に "市外-市内-番号" でハイフン自動挿入。枠が埋まると次へ
  const telWrap = root.querySelector('.cf-tel');
  if (telWrap){
    const mainEl = telWrap.querySelector('[data-tel-main]');
    const tg = sel => { const x = telWrap.querySelector(sel); return x ? x.value.trim() : ''; };
    const telEls = [telWrap.querySelector('.cf-tel-1'), telWrap.querySelector('.cf-tel-2'), telWrap.querySelector('.cf-tel-3')];
    const recompose = () => {
      c.tel = [tg('.cf-tel-1'), tg('.cf-tel-2'), tg('.cf-tel-3')].filter(Boolean).join('-');
      if (mainEl) mainEl.value = c.tel;
      if (Array.isArray(c.contacts)){ const pri = c.contacts.find(x=>x.primary); if (pri) pri.tel = c.tel; }   // 代表連絡先も同期
      if (window.PitDB) PitDB.save();
    };
    telEls.forEach((el, i) => {
      if (!el) return;
      el.addEventListener('input', () => {
        const max = (i === 0) ? 5 : 4;
        el.value = _plateDigits(el.value, max);   // 全角→半角・数字以外/ハイフン除去・桁切り
        recompose();
        if (el.value.length >= max && telEls[i + 1]) telEls[i + 1].focus();
      });
    });
    const openGuide = () => telWrap.classList.add('open');
    if (mainEl){
      mainEl.addEventListener('focus', openGuide);
      mainEl.addEventListener('click', () => { openGuide(); if (telEls[0]) setTimeout(() => telEls[0].focus(), 0); });
    }
    telWrap.addEventListener('focusout', (e) => { if (!telWrap.contains(e.relatedTarget)) telWrap.classList.remove('open'); });
  }

  // ナンバー：見た目は1BOX。クリック/フォーカスでガイドを開き、4項目を入力→c.plate に合成（半角スペース1つ＝揺れ防止）
  _bindPlateGuide(root.querySelector('.cf-plate'), function(v){
    c.plate = v;
    if (window.PitDB) PitDB.save();
  });

  // v0.85.0 受付タイプ＝最大2つ選択（待/当/預）。主=dropType・副=dropType2。表示は「待or預」。
  root.querySelectorAll('.cf-chips.cf-dual').forEach(group => {
    group.querySelectorAll('.cf-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.val;
        const cur = [c.dropType, c.dropType2].filter(Boolean);
        const idx = cur.indexOf(v);
        if (idx >= 0) cur.splice(idx, 1);          // 選択中→解除（主を外したら副が主に繰り上がる）
        else if (cur.length < 2) cur.push(v);      // 未選択→追加（最大2つ）
        else cur[1] = v;                           // すでに2つ→2つ目を置き換え
        c.dropType  = cur[0] || null;
        c.dropType2 = cur[1] || null;
        // 概算（預かり日数）は主の受付タイプで計算（従来どおり）
        if (window.pitEstHold) c.estHoldDays = c.workType ? pitEstHold(c.workType, c.dropType, pitTeamKey(c)) : '';
        renderCardForm(c);
      });
    });
  });

  // チップ（単一選択）
  /* ⚠ v2.6.0 `[data-intern]`（社内区分）と `[data-other]`（その他のボタン）は**ここで拾わない**。
     　　拾うと汎用のハンドラと専用のハンドラが二重に走り、押しても元に戻ってしまう。 */
  /* ⚠ v2.51.0 `[data-drawerwt]`（その他の引き出しの物販）も**ここで拾わない**。
     同じ `data-key="workType"` を使っているので、外さないと押した時に二重に効く。 */
  root.querySelectorAll('.cf-chips:not([data-multi]):not([data-combo]):not([data-special]):not([data-intern]):not([data-other]):not([data-drawerwt]):not(.cf-dual)').forEach(group => {
    const key = group.dataset.key;
    group.querySelectorAll('.cf-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const newVal = btn.dataset.val;
        const wasActive = btn.classList.contains('active');
        if (key === 'boardId'){
          // 国産/輸入は解除なし。選ぶと課も自動選択（国→1課・輸→2課）
          c.boardId = newVal;
          c.division = (newVal === 'import') ? 'div2' : 'div1';
          _syncStaffToDivision(c);   // 別の課の担当はクリア
        } else if (wasActive){
          c[key] = null;   // 同じ値クリックで解除
        } else {
          c[key] = newVal;
          if (key === 'division') _syncStaffToDivision(c);   // 課を選んだら別の課の担当を一覧から消す＝クリア
        }
        // 作業タイプ・受付タイプを選んだら概算（日数・金額）を自動セット（後から手で直せる）
        if (key === 'workType' || key === 'dropType'){
          // 作業タイプ未選択のうちは概算 預かり日数は空欄（選んだら自動で入る）
          if (window.pitEstHold)   c.estHoldDays = c.workType ? pitEstHold(c.workType, c.dropType, pitTeamKey(c)) : '';
          if (window.pitEstAmount && (key === 'workType' || key === 'boardId') && c.workType) c.estAmount = pitEstAmount(c.workType, pitTeamKey(c));
          if (key === 'workType'){
            /* 🚙 v2.6.0 代車は相方1つだけ＝基本を選んだら併用可はおろす */
            if (window.pitInternKind && pitInternKind(c) === 'loanercar') c.workAddons = [];
            _syncWorkTypes(c); _clearSpecialsIfNoWork(c);   // 表示用バッジ列を同期＋付加の整合（v0.116.0）
          }
        }
        renderCardForm(c);
      });
    });
  });

  // 作業タイプの「併用可」チップ（追加トグル＝c.workAddons[]）
  root.querySelectorAll('.cf-chips[data-combo]').forEach(group => {
    const key = group.dataset.key;   // workAddons
    if (!Array.isArray(c[key])) c[key] = [];
    group.querySelectorAll('.cf-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.val;
        const idx = c[key].indexOf(v);
        if (idx >= 0) c[key].splice(idx, 1);
        else {
          /* 🚙 v2.6.0 代車は相方1つだけ＝ほかを全部おろしてから付ける */
          if (window.pitInternKind && pitInternKind(c) === 'loanercar'){ c[key] = []; c.workType = null; }
          c[key].push(v);
        }
        /* 📦 v2.51.0（G）物販は常に単独。ふつうの作業タイプを押したら物販は外れる（逆向きも塞ぐ） */
        if (c.workType === 'goods') c.workType = null;
        _syncWorkTypes(c);
        _clearSpecialsIfNoWork(c);   // v0.116.0 併用可も無く基本も無ければ付加を外す
        // v0.94.1 併用可は単独利用も可：主作業(workType)が無く併用可だけの時は、その先頭で概算を自動入力
        if (!c.workType){
          const eff = (c.workAddons || [])[0] || '';
          if (window.pitEstHold)   c.estHoldDays = eff ? pitEstHold(eff, c.dropType, pitTeamKey(c)) : '';
          if (window.pitEstAmount) c.estAmount   = eff ? pitEstAmount(eff, pitTeamKey(c)) : c.estAmount;
        }
        renderCardForm(c);
      });
    });
  });

  // v0.116.0 作業タイプ「特殊」チップ（保証/保険）＝c.workSpecials[]。作業タイプ（基本 or 併用可）がある時だけ付けられる（単体では選べない）。
  root.querySelectorAll('.cf-chips[data-special]').forEach(group => {
    const key = group.dataset.key;   // workSpecials
    if (!Array.isArray(c[key])) c[key] = [];
    group.querySelectorAll('.cf-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.val;
        const idx = c[key].indexOf(v);
        if (idx >= 0){
          c[key].splice(idx, 1);   // 解除はいつでも可
        } else {
          const hasWork = !!c.workType || (Array.isArray(c.workAddons) && c.workAddons.length > 0);
          if (!hasWork){
            if (window.pitToast) pitToast('保証・保険は作業タイプとセットで選んでください', 'PF-1004');
            return;   // 単体では付けない
          }
          c[key].push(v);
        }
        /* 🛡 v2.9.0 保険を付けたら**自動で売掛チェックが入る**（ゆうた指定 2026-08-25）。
           🔴 判定も書き込みも `insurance-pit.js` の1本。ここで 'insurance' と書き分けない。 */
        if (window.pitInsOnBadge) pitInsOnBadge(c);
        if (window.PitDB) PitDB.save();
        renderCardForm(c);
      });
    });
  });

  /* 🗄 v2.6.0 「その他」の引き出しを開け閉め（カードには保存しない＝画面の都合だけ） */
  {
    const ob = root.querySelector('#cf-other-btn');
    if (ob) ob.addEventListener('click', () => { _cfOtherOpen = !_cfOtherOpen; renderCardForm(c); });
  }
  /* 📦 v2.51.0（G）引き出しの作業タイプ（物販）＝**選ぶと他の作業タイプを全部おろす。** */
  root.querySelectorAll('.cf-chips[data-drawerwt]').forEach(group => {
    group.querySelectorAll('.cf-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const v = btn.dataset.val;
        if (c.workType === v){ c.workType = null; }
        else {
          c.workType   = v;
          c.workAddons = [];        /* 併用可を全部おろす（常に単独） */
          c.workSpecials = [];      /* 付加（保証・保険・社員）も外す */
          /* 洗車・車販依頼はこの予約では使わないので、印が残らないようにおろす */
          c.needWash = false; c.washNote = '';
          c.salesReq = false; c.salesReqMemo = ''; c.coatingOK = false; c.headlight = false;
          if (window.pitEstHold)   c.estHoldDays = pitEstHold(v, c.dropType, pitTeamKey(c));
          if (window.pitEstAmount) c.estAmount   = pitEstAmount(v, pitTeamKey(c));
        }
        _syncWorkTypes(c);
        if (window.PitDB) PitDB.save();
        renderCardForm(c);
      });
    });
  });

  /* 🏢 v2.6.0 社内区分チップ（中古／代車／内部）＝1つだけ。もう一度押すと外れる。
     ⚠ 付け替えの後始末（作業タイプ・付加・概算・代車を落とす）は
        **intern-pit.js の `pitInternSet` 1本**。ここに書き写さないこと。 */
  root.querySelectorAll('.cf-chips[data-intern]').forEach(group => {
    group.querySelectorAll('.cf-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const v   = btn.dataset.val;
        const now = window.pitInternKind ? pitInternKind(c) : '';
        if (window.pitInternSet) pitInternSet(c, now === v ? '' : v);
        _syncWorkTypes(c);
        _cfOtherOpen = true;
        if (window.PitDB) PitDB.save();
        renderCardForm(c);
      });
    });
  });

  // チップ（複数選択：代車条件）
  root.querySelectorAll('.cf-chips[data-multi]').forEach(group => {
    const key = group.dataset.key;
    if (!Array.isArray(c[key])) c[key] = [];
    group.querySelectorAll('.cf-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.val;
        const idx = c[key].indexOf(v);
        if (idx >= 0) c[key].splice(idx, 1);
        else c[key].push(v);
        btn.classList.toggle('active');
        if (window.PitDB) PitDB.save();   // v0.83.1 代車条件の選択を自動保存
        // 代車条件を変えたら代車ガントを並べ替え直す（条件マッチを上へ）
        if (key === 'loanerConditions' && window.cfsLgRerender) cfsLgRerender();
      });
    });
  });

  // 相談ボタン（待・当・預と同じ見た目の単独チップ・押した時だけON）
  const consultBtn = root.querySelector('#cf-consult-btn');
  if (consultBtn){
    consultBtn.addEventListener('click', () => {
      c.consult = !c.consult;
      renderCardForm(c);
    });
  }
  // マルエフ（Ⓕ＝コードレッド／クレーム等の要注意）ボタン
  const coderedBtn = root.querySelector('#cf-codered-btn');
  if (coderedBtn){
    coderedBtn.addEventListener('click', () => {
      c.codeRed = !c.codeRed;
      renderCardForm(c);
    });
  }
  // 車種固定ボタン（ある時だけ押す単独チップ）
  const fixedBtn = root.querySelector('#cf-fixed-btn');
  if (fixedBtn){
    fixedBtn.addEventListener('click', () => {
      c.loanerFixed = !c.loanerFixed;
      renderCardForm(c);
    });
  }

  // 🚙 代車ガント：空きマスをクリック→ドラッグで範囲選択→「使用代車＋貸出から/まで」に自動入力（v0.28.0）
  const lgBody = root.querySelector('#cfs-lg-body');
  if (lgBody){
    /* 🔴 v1.80.0 空きの判定は loaner-free.js の1本（代車自身の車検でも塞がる） */
    const busyAt = (lid, ds) => {
      const l = (state.loaners || []).find(x => x.id === lid);
      return window.pitLoanerBusyOn ? pitLoanerBusyOn(l, ds)
           : (state.loanerAssigns || []).some(a => a.loanerId === lid && a.fromDate <= ds && a.toDate >= ds);
    };
    const nextDs = (ds) => { const p = ds.split('-'); const d = new Date(+p[0], +p[1]-1, +p[2]); d.setDate(d.getDate()+1); return ymd(d); };
    const rangeFree = (lid, a, b) => {   // a〜b（両端含む）が全部空きか
      let cur = a;
      while (cur <= b){ if (busyAt(lid, cur)) return false; cur = nextDs(cur); }
      return true;
    };
    const paint = (drag) => {
      lgBody.querySelectorAll('td[data-lgd]').forEach(td => {
        const on = drag && td.dataset.lgl === drag.l && td.dataset.lgd >= drag.a && td.dataset.lgd <= drag.b;
        td.classList.toggle('cfs-lg-pick', on || (!drag && c.loanerId === td.dataset.lgl && c.loanerFrom && c.loanerTo && td.dataset.lgd >= c.loanerFrom && td.dataset.lgd <= c.loanerTo));
      });
    };
    let drag = null;
    lgBody.addEventListener('mousedown', (e) => {
      const td = e.target.closest('td[data-lgd]');
      if (!td) return;
      e.preventDefault();
      drag = { l: td.dataset.lgl, anchor: td.dataset.lgd, a: td.dataset.lgd, b: td.dataset.lgd };
      paint(drag);
      document.addEventListener('mouseup', () => {
        if (!drag) return;
        c.needLoaner = true;
        c.loanerId = drag.l;
        c.loanerFrom = drag.a;
        c.loanerTo = drag.b;
        // 代車の範囲ドラッグに連動（v0.101.3）：貸出開始日を入庫日に再入力＋最終貸出日までを預かり日数に＋内容メモへ返車日を自動記入
        c.reserveDate = drag.a;   // 予約日が入っていても代車開始日で入庫日を再入力
        (function(){
          /* 🔴 v1.59.0（ゆうたの決めごと）**預かり日数は「日をまたいだ数」＝泊数。当日返しは 0。**
             ⚠ ここは**両端を数えていた**ので、8/1〜8/5 の貸出で 5（本当は4泊）が入っていた＝1日多い。
                入力欄の案内（「当日仕上げは0」）とも、ダッシュボードの占有計算（入庫日＋預かり日数）とも
                食い違っていたので、**決めごとに合わせて直した。**
             ⚠ 数え方は views.js の `pitHoldDays` に一本化。**ここで組み立てない。** */
          if (window.pitHoldDays){
            var n = pitHoldDays(drag.a, drag.b);
            if (n != null) c.estHoldDays = n;
          } else {
            var pa = drag.a.split('-'), pb = drag.b.split('-');
            var da = new Date(+pa[0], +pa[1]-1, +pa[2]), db = new Date(+pb[0], +pb[1]-1, +pb[2]);
            c.estHoldDays = Math.round((db - da) / 86400000);
          }
        })();
        (function(){   // 作業内容メモに「代車による返車日M/Dまで」を自動記入（再ドラッグ時は既存の同種行を更新）
          var pb = drag.b.split('-');
          var line = '代車による返車日' + (+pb[1]) + '/' + (+pb[2]) + 'まで';
          var rest = (c.menu || '').split('\n').filter(function(ln){ return !/^代車による返車日.*まで$/.test(ln.trim()); }).join('\n').replace(/\s+$/, '');
          c.menu = rest ? (rest + '\n' + line) : line;
        })();
        drag = null;
        if (window.PitDB) PitDB.save();
        renderCardForm(c);   // 使用代車セレクト・日付欄・緑マスがすべて追従
      }, { once: true });
    });
    lgBody.addEventListener('mouseover', (e) => {
      if (!drag) return;
      const td = e.target.closest('td[data-lgd]');
      if (!td || td.dataset.lgl !== drag.l) return;   // 同じ代車の列だけ
      let a = drag.anchor, b = td.dataset.lgd;
      if (b < a){ const t = a; a = b; b = t; }
      if (rangeFree(drag.l, a, b)){ drag.a = a; drag.b = b; paint(drag); }   // 途中に貸出中があれば伸ばさない
    });

    /* 🔴 v1.35.0（ゆうた指定）日付（左端のマス）を押すと、その日の行を点線で囲う。
       同じ日をもう一度押すと消える。**データは何も変えない＝見やすくするだけ。** */
    lgBody.addEventListener('click', (e) => {
      const dtd = e.target.closest('td[data-lgrow]');
      if (!dtd) return;
      const ds = dtd.getAttribute('data-lgrow');
      window._cfsLgRowSel = (window._cfsLgRowSel === ds) ? '' : ds;
      pitLgSync(c);
    });
  }

  /* 🔴 v1.35.0（ゆうた指定）車種の見出しを押す＝その代車を使う。
     列が青い点線で囲まれ、**使用代車の欄にも自動で入る**（逆に欄で選んでも列が囲まれる）。
     ⚠ 見出しはホバーで代車の詳細カードも出る（loaner.js）。そちらは触っていない。 */
  const lgCard = root.querySelector('#cfs-lg-card');
  if (lgCard){
    lgCard.addEventListener('click', (e) => {
      const th = e.target.closest('th.cfs-lg-thpick[data-loid]');
      if (!th) return;
      const id = th.getAttribute('data-loid');
      c.needLoaner = true;
      c.loanerId = (c.loanerId === id) ? '' : id;     /* もう一度押すと選択解除 */
      const sel = root.querySelector('select[data-key="loanerId"]');
      if (sel) sel.value = c.loanerId;
      if (window.PitDB) PitDB.save();
      pitLgSync(c);
      _cardReapplyCheck(root);
    });
  }

  /* 🔴 v1.35.0 使用代車・貸出から/まで を触ったら、**打っている最中から**カレンダーの色を追従させる。
     ⚠ 値の保存は既存の input ハンドラに任せている＝ここは塗り直すだけ（保存の道を二重に作らない）。 */
  ['loanerId', 'loanerFrom', 'loanerTo'].forEach(function (k){
    const el = root.querySelector('[data-key="' + k + '"]');
    if (!el) return;
    ['input', 'change'].forEach(function (ev){
      el.addEventListener(ev, function (){ setTimeout(function (){ pitLgSync(c); }, 0); });
    });
  });

  // トグル
  root.querySelectorAll('.cf-toggle').forEach(group => {
    const key = group.dataset.key;
    group.querySelectorAll('.cf-tg').forEach(btn => {
      btn.addEventListener('click', () => {
        c[key] = btn.dataset.val === '1';
        /* 🔴 v1.35.0（ゆうた指定）入庫日が決まっている状態で「代車必要」を押したら、
           **貸出開始日に入庫日をそのまま入れる**（同日から貸す運用がほとんどのため）。
           ⚠ すでに貸出開始日が入っている時は上書きしない＝手で直した値を消さない。 */
        if (key === 'needLoaner' && c.needLoaner && c.reserveDate && !c.loanerFrom){
          c.loanerFrom = c.reserveDate;
        }
        renderCardForm(c);
      });
    });
  });

  /* v1.35.0 描き直した直後にも、代車カレンダーの選択（緑・青い点線）を乗せ直す。
     ⚠ 表の高さが決まってから＝行を埋めたあとに呼ぶ。 */
  if (window.cfsLgFill) { try { cfsLgFill(); } catch (e) {} }
  if (window.pitLgSync) { try { pitLgSync(c); } catch (e) {} }

  // 入力チェックON中なら、再描画のたびに未入力だけ赤枠を貼り直す
  // （チップ/トグルを押しても全部消えず、埋めた項目だけ赤が外れる）
  _cardReapplyCheck(root);
}

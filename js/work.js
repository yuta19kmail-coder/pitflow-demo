/* ========================================
   work.js
   Pitリスト（PIT配置図にカードがハマる）
   ----------------------------------------
   エディタ（pit-floor.js）で作った工場の平面図を読み取り専用で描画し、
   各PIT枠の固定スロットに実カード（state.cards）をはめ込む。
   ・対象＝作業工程のカード（点検待ち〜作業待ち）。bayId で枠に割り当て。
   ・未割当は下部トレイ（1課/2課に分割・通常は折りたたみ）。ドラッグで枠へ。
   ======================================== */

var WORK_STATUSES = ['check', 'estim', 'contact', 'parts', 'work'];

function _workTargets(){
  return state.cards.filter(function(c){ return WORK_STATUSES.indexOf(c.status) >= 0; });
}

/* 未割当トレイの開閉（既定＝閉じる＝PIT図を広く） */
function _pitlistTrayOpen(){
  try { return localStorage.getItem('pitlist_tray_open') === '1'; } catch (e) { return false; }
}
function togglePitlistTray(){
  try { localStorage.setItem('pitlist_tray_open', _pitlistTrayOpen() ? '' : '1'); } catch (e) {}
  renderWork();
}
window.togglePitlistTray = togglePitlistTray;

function renderWork(){
  var grid  = document.getElementById('pitlist-grid');
  var stage = document.getElementById('pitlist-stage');
  var sec   = document.getElementById('view-work');
  if (sec) sec.classList.toggle('tray-open', _pitlistTrayOpen());   // 開いてる時だけ図エリアを少し詰める
  if (!grid) return;

  var targets = _workTargets();

  // 配置図の枠が無い場合は案内
  if (!window.PitFloorView || !Array.isArray(state.bays) || state.bays.length === 0){
    grid.style.width = ''; grid.style.height = '';
    grid.innerHTML = '<div class="pitlist-nofloor">まだPIT配置図がありません。<br>設定 → <i data-ic=factory data-ics=16></i> PIT配置図を編集 から工場の平面図を作るか、保存済みの配置図を読み込んでください。</div>';
    _renderUnassigned(targets);
    return;
  }

  // 枠ごとにカードをまとめる
  var byBay = {};
  targets.forEach(function(c){ if (c.bayId){ (byBay[c.bayId] = byBay[c.bayId] || []).push(c); } });

  // 図は領域（幅・高さ）に合わせて表示。フルHD全画面で全景が収まるよう、トレイ＋余白分を引いてから高さを決める。
  // 高さはビューポート基準で算出（stageのclientHeightは内容依存で不安定なため）。
  var sr = stage.getBoundingClientRect();
  var reserve = _pitlistTrayOpen() ? 232 : 96;   // 下の未割当トレイ＋余白の確保分（畳=細い／開=2カラム）
  var availH = Math.max(220, window.innerHeight - sr.top - reserve);
  PitFloorView.render(grid, { cardsByBay: byBay, stage: stage, fit: true, minCell: 38, maxCell: 58, availH: availH });

  // 未割当（PIT枠未指定）をトレイへ
  _renderUnassigned(targets.filter(function(c){ return !c.bayId; }));
}

function _renderUnassigned(list){
  var tray = document.getElementById('pitlist-unassigned');
  if (!tray) return;
  list = list || [];
  var open = _pitlistTrayOpen();

  var head = '<div class="pitlist-tray-head" onclick="togglePitlistTray()" title="クリックで開閉">'
    + '<span class="ptl-caret">' + (open ? '<i data-ic=chevDown data-ics=15></i>' : '<i data-ic=chevRight data-ics=16></i>') + '</span>'
    + '<span><i data-ic=download data-ics=16></i> 未割当（PIT枠未指定）</span>'
    + '<span class="pitlist-tray-meta">' + list.length + ' 件' + (open ? '・ドラッグで枠へ' : '（クリックで開く）') + '</span>'
    + '</div>';

  if (!open){ tray.innerHTML = head; return; }

  // 1課（国産）＝boardId が import 以外 ／ 2課（輸入）＝import
  var c1 = list.filter(function(c){ return c.boardId !== 'import'; });
  var c2 = list.filter(function(c){ return c.boardId === 'import'; });
  function col(title, cls, arr){
    return '<div class="ptl-col ' + cls + '">'
      + '<div class="ptl-col-h">' + title + ' <span class="ptl-col-n">' + arr.length + '</span></div>'
      + '<div class="ptl-col-body" data-drop="bay" data-drop-val="">'
      + (arr.length ? arr.map(function(c){ return cardHtml(c, { compact: true }); }).join('') : '<div class="ptl-empty">なし</div>')
      + '</div></div>';
  }
  tray.innerHTML = head
    + '<div class="pitlist-tray-cols">'
    + col('1課（国産）', 'ptl-c1', c1)
    + col('2課（輸入）', 'ptl-c2', c2)
    + '</div>';
}

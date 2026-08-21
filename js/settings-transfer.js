/* ========================================
   settings-transfer.js  -  設定の引っ越し（PitFlow）
   ----------------------------------------
   ◎なにをするもの
     いまの開発用サイト（github.io）で作り込んだ「設定まわり」を、
     本番サイトへそのまま持っていくためのもの。
     ブラウザの保存はアドレスごとに別なので、本番サイトからは
     開発サイトの中身が見えない。そこで一度ファイルに書き出して読み込む。

   ◎持っていくもの（＝設定・ルール・図面）
     ・設定（予約枠・預かり日数・金額・時間・定休・置き場 など）
     ・作業タイプ／外注先
     ・PIT配置図（枠・建物・通路）
     ・入庫ルールの判定（AIの上書き）
     ・付箋の色ラベル
     ・内容テンプレ（症状ホイール）※設定の中に入っている

   ◎持っていかないもの（わざと）
     ・予約カード・顧客・代車・自社車両・貸出・実績
       → 本番は空から始める、というゆうたの決定どおり。
   ======================================== */
(function () {
  'use strict';

  var KEYS = ['settings', 'bays', 'floorPlan', 'aiVerdicts', 'boardLabels', 'inspectMarks', 'inspectMutes'];

  function payload() {
    var out = { _kind: 'pitflow-settings', _v: 1, _at: new Date().toISOString() };
    KEYS.forEach(function (k) {
      out[k] = (window.state && state[k] !== undefined) ? state[k] : null;
    });
    /* 作業タイプは state.workTypes が実行用、settings.workTypes が保存用。両方入れておく */
    out.workTypes = (window.state && state.workTypes) || null;
    return out;
  }

  /* ---- 書き出し（開発サイトで押す） ---- */
  window.pitSettingsExport = function () {
    var json = JSON.stringify(payload(), null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.href = url;
    a.download = 'PitFlow設定_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (window.showToast) showToast('設定を書き出しました');
  };

  /* ---- 読み込み（本番サイトで押す） ---- */
  window.pitSettingsImport = function (input) {
    var f = input && input.files && input.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var d;
      try { d = JSON.parse(String(r.result)); }
      catch (e) { pitAlert('このファイルは読めませんでした（中身が壊れているようです）', { code:'PF-9001' }); return; }
      if (!d || d._kind !== 'pitflow-settings') {
        pitAlert('PitFlow の設定ファイルではないようです。\n書き出しで作った「PitFlow設定_日付.json」を選んでください。', { code:'PF-9002' });
        return;
      }
      var det = '・予約カード／顧客／代車／自社車両には触りません\n'
              + '・置き換わるのは 設定・作業タイプ・外注先・PIT配置図・入庫ルールの判定・付箋の色 です';
      pitAsk('この設定で今の設定を置き換えます。よろしいですか？', { title:'設定の読み込み', ok:'置き換える', detail:det })
        .then(function (yes) { if (yes) _go(); });
      return;

      function _go(){
      KEYS.forEach(function (k) {
        if (d[k] === undefined || d[k] === null) return;
        if (k === 'settings') {
          if (window.PitDB && PitDB._mergeSettings) PitDB._mergeSettings(d[k]);
          else state.settings = d[k];
        } else {
          state[k] = d[k];
        }
      });
      if (Array.isArray(d.workTypes) && d.workTypes.length) {
        state.workTypes = d.workTypes;
        state.settings.workTypes = d.workTypes;
      }
      if (window.pitLog) pitLog('設定ファイルを読み込んだ', { kind: 'settings', label: String(d._at || '') });
      if (window.PitDB) PitDB.save(true);
      pitAlert('設定を読み込みました。画面を作り直します。');
      location.reload();
      }
    };
    r.readAsText(f, 'utf-8');
  };

  /* ---- 設定画面に出すカード ---- */
  window.pitTransferCardHtml = function () {
    var cloud = !!window.PIT_CLOUD;
    var h = '<div class="ps-card"><div class="ps-h"><i data-ic=upload data-ics=16></i> 設定の引っ越し</div>';
    h += '<div class="ps-hint" style="margin-bottom:12px">'
       + '設定・作業タイプ・外注先・PIT配置図・入庫ルールの判定・付箋の色を、ファイルにして別のサイトへ移します。'
       + '<b>予約カード・顧客・代車・自社車両は入りません。</b>'
       + '</div>';
    h += '<div class="ps-transfer-btns">';
    h += '<button class="ps-tbtn" onclick="pitSettingsExport()"><i data-ic=download data-ics=15></i> いまの設定を書き出す</button>';
    h += '<label class="ps-tbtn"><i data-ic=upload data-ics=15></i> 設定ファイルを読み込む'
       + '<input type="file" accept="application/json,.json" style="display:none" onchange="pitSettingsImport(this)"></label>';
    h += '</div>';
    h += '<div class="ps-hint" style="margin-top:10px">'
       + (cloud
          ? '本番サイトです。開発用サイトで書き出したファイルをここで読み込めば、今までの設定がそのまま入ります。'
          : 'この端末だけのサイトです。本番サイトへ移す時は、ここで書き出したファイルを本番側で読み込んでください。')
       + '</div>';
    h += '</div>';
    return h;
  };
})();

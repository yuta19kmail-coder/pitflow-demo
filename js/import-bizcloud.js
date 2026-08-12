/* ========================================
   import-bizcloud.js  -  bizcloud 顧客JSONの取込（テスト用・localStorageのみ）
   ----------------------------------------
   ・bizcloud から書き出した「顧客車両_bizcloud_*.json」（人＋vehicles[] ネスト）を
     ユーザーがファイル選択 → state.customers に全置き換え → PitDB.save()（localStorageのみ）。
   ・本番DB(Firestore)には一切送らない（PitDBは現状ローカル専用）。
   ・実顧客の個人情報を含むため、JSONはリポジトリに置かず「手元ファイルから取込」方式。
   ======================================== */
(function () {
  function rid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function toMs(v) { if (v == null || v === '') return 0; var t = +new Date(v); return isNaN(t) ? 0 : t; }
  // メーカー/車種の表記ゆれ対策：全角英数→半角、全角スペース→半角、前後空白を除去（ＭＩＮＩ→MINI 等）。
  function normText(s) {
    if (s == null) return s;
    var t = String(s);
    if (t.normalize) t = t.normalize('NFKC');   // 全角英数字・記号→半角
    return t.replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
  }

  window.pitImportCustomersFromFile = function () {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var arr;
        try { arr = JSON.parse(r.result); } catch (e) { pitAlert('JSONの読み込みに失敗しました：' + e.message); return; }
        if (!Array.isArray(arr)) { pitAlert('JSONの形式が配列ではありません。'); return; }
        /* 🔵 v1.75.0 聞くのはアプリ内ダイアログ（pitAsk）＝答えは後から返る。
           ⚠ 取り込みの本体は **_go に切り出して** そこから呼ぶ（.then の中に本文を写さない）。 */
        pitAsk('顧客 ' + arr.length + ' 件を取り込みます。よろしいですか？',
               { title:'顧客データの取り込み', ok:'取り込む',
                 detail:'今の顧客控え（' + ((state.customers || []).length) + '件）は全置き換えされます。\n※この端末のブラウザ内だけに反映・本番には送りません。' })
          .then(function (yes) { if (yes) _go(); });
        return;

        function _go(){
        // ★容量対策：JSONの全フィールドを丸ごと持たず、PitFlowが使う項目だけに絞って取り込む（localStorage節約）。
        var out = arr.map(function (c) {
          var contacts = (Array.isArray(c.contacts) ? c.contacts : []).map(function (ct) {
            return { tel: (ct.tel || '').trim(), label: (ct.label || '').trim(), primary: !!ct.primary };
          }).filter(function (ct) { return ct.tel || ct.label; });
          if (contacts.length && !contacts.some(function (x) { return x.primary; })) contacts[0].primary = true;
          var vehicles = (Array.isArray(c.vehicles) ? c.vehicles : []).map(function (v) {
            return {
              id: 'v_bl_' + (v.mgtNo != null ? v.mgtNo : rid('')),
              plate: (v.plate || '').trim(),
              maker: normText(v.maker || ''),         // ＭＩＮＩ→MINI 等の表記ゆれ統一
              car: normText(v.car || ''),
              boardId: v.boardId || '',
              division: v.division || '',
              frontStaff: (v.frontStaff || '').trim(),
              karteNo: (v.karteNo || '').trim(),     // カルテNo（車輌管理No）を保持
              mgtNo: (v.mgtNo != null ? v.mgtNo : null), // 内部管理番号（再同期用キー）
              updatedAt: toMs(v.updatedAt) || Date.now(),
            };
          });
          var lastVisit = vehicles.reduce(function (m, v) { return Math.max(m, v.updatedAt || 0); }, 0);
          return {
            id: 'cu_bl_' + (c.code != null ? c.code : rid('')),
            name: (c.name || '').trim(),
            kana: (c.kana || '').trim(),
            contacts: contacts,
            lineStatus: c.lineStatus || '',           // LINE状態（人単位）
            lstepId: (c.lstepId != null ? String(c.lstepId).trim() : ''), // Lステップ番号
            vehicles: vehicles,
            updatedAt: toMs(c.updatedAt) || lastVisit || Date.now(),
          };
        });

        state.customers = out;
        if (window.PitDB) PitDB.save(true);   // localStorage のみ
        if (window.renderCustomers) renderCustomers();
        var st = document.getElementById('ps-import-status');
        if (st) st.textContent = '取込済 ' + out.length + ' 件';
        var veh = out.reduce(function (n, c) { return n + (c.vehicles ? c.vehicles.length : 0); }, 0);
        if (window.toast) toast('顧客 '+ out.length + '件／車両 '+ veh + '台を取り込みました（この端末のみ）');
        else pitAlert('取り込み完了：顧客 ' + out.length + ' 件／車両 ' + veh + ' 台');
        }
      };
      r.readAsText(f, 'utf-8');
    };
    inp.click();
  };
})();

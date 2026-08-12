/* ========================================
   mhs-pit.js  -  MHS の予定を読む（新規予約の「担当の予定」）  PitFlow v1.22.0
   ----------------------------------------
   ◎なにをするもの
     新規予約カードで**フロント担当を選ぶと、その人の入庫日の予定**が出る。
     「その日その人がつかまるか」を、予約を入れる前に見るためのもの。

   ◎どこから読むか
     companies/kobayashi_motors/appSummaries/mhsDigest-YYYY-MM
     ＝ MHS が **展開まで済ませて配ってくれる**「日×人」の一覧。
       { days: { '2026-08-10': { '<メンバーID>': [ {t,ty,l}, … ] } } }

   🔴 なぜ PitFlow で展開しないのか
     繰り返し・期間・ルーティン・当番・休日振替の計算は **MHS にしかない知識**。
     こちらに同じ計算を持つと、片方を直した時に必ずずれる。**読むだけにしてある。**

   ⚠ 配っているのは「MHSを開いている人」。誰も開かない日が続くと古くなるので、
      **最終更新（updatedAt）を画面に出す**。古ければ画面から分かる。
   ⚠ 🔒非公開の予定は MHS 側で除いてある（こちらには届かない）。
   ⚠ ルールの変更は不要（appSummaries は既に許可済みのコレクション）。
   ======================================== */
(function () {
  'use strict';

  var _cache = {};      // { 'YYYY-MM': { days:{…}, updatedAt: ms } }
  var _unsubs = {};     // 購読中の月
  var _wanted = {};     // 欲しがった月（重複購読しない）

  function _co(){
    if (!window.fb || !window.fb.db || !window.fb.currentCompanyId) return null;
    return window.fb.db.collection('companies').doc(window.fb.currentCompanyId).collection('appSummaries');
  }
  function _ymOf(dateStr){ return String(dateStr || '').slice(0, 7); }

  /* その月を購読する（1回だけ）。届いたら、開いている画面を描き直す。 */
  function want(ym){
    if (!ym || _wanted[ym]) return;
    var co = _co();
    if (!co) return;                       /* ログイン前・サンプルモードは何もしない */
    _wanted[ym] = 1;
    try {
      _unsubs[ym] = co.doc('mhsDigest-' + ym).onSnapshot(function (d){
        if (!d.exists){ _cache[ym] = { days:{}, updatedAt:0, missing:true }; _redraw(); return; }
        var v = d.data() || {};
        var at = 0;
        try { at = (v.updatedAt && v.updatedAt.toMillis) ? v.updatedAt.toMillis() : 0; } catch(e){}
        _cache[ym] = { days: v.days || {}, updatedAt: at, missing:false };
        _redraw();
      }, function (err){
        console.warn('[mhs-pit] ' + ym + ' の予定を読めませんでした', err);
        _cache[ym] = { days:{}, updatedAt:0, error:true };
        _redraw();
      });
    } catch(e){ console.warn('[mhs-pit] 購読に失敗', e); }
  }

  /* 予定が届いたら、いま開いているカードだけ描き直す（画面全体は触らない）。
     ⚠ 描き直しの入口は card-detail.js の window.pitCardRepaint()。
        入力中の値は c（カード）側に随時入っているので、描き直しで消えることはない。 */
  var _rt = null;
  function _redraw(){
    clearTimeout(_rt);
    _rt = setTimeout(function (){
      try { if (window.pitCardRepaint) window.pitCardRepaint(); } catch(e){}
    }, 150);
  }

  /* 名前 → 名簿のその人。PitFlow の担当は「名前の文字」で持っているので、名簿で引き直す。
     ⚠ 通称・本名のどちらでも引けるように pitStaffAny → pitStaffByName の順で当たる。 */
  function _staffOf(staffName){
    var n = String(staffName || '').trim();
    if (!n) return null;
    var s = null;
    try { if (window.pitStaffAny)    s = pitStaffAny(n); } catch(e){}
    try { if (!s && window.pitStaffByName) s = pitStaffByName(n); } catch(e){}
    if (!s && window.state && state.staff){
      s = state.staff.find(function (x){ return x && (x.name === n || (x.aliases || []).indexOf(n) >= 0); });
    }
    return s || null;
  }

  /* 🔴 v1.29.0 ここが「予定が出ない」の原因だった。
     MHS が配る「日×人」のキーは **CoreMembers のドキュメントID**（MHS の `memberById(...).id`）。
     いっぽう PitFlow の `state.staff[].id` は **CoreFlow名簿（portalMembers）のID**で、**別物**。
     CoreMembers 側のIDは `state.staff[].cmId` に入っているので、**cmId を先に見る**。
     ⚠ 順番を変えないこと（cmId → id）。CoreMembers に居ない人は cmId が空なので id で当たってみる。
     ⚠ MHS 側は無改造で直る＝配っているデータは正しく、こちらの引き方だけが違っていた。 */
  function _keysOf(s){
    var out = [];
    if (s && s.cmId) out.push(String(s.cmId));
    if (s && s.id && out.indexOf(String(s.id)) < 0) out.push(String(s.id));
    return out;
  }
  /* 逆引き：MHS のキー（CoreMembers ID または portalMembers ID）→ 名簿のその人 */
  function _staffByKey(key){
    var k = String(key || '');
    if (!k) return null;
    var list = (window.state && state.staff) || [];
    return list.find(function (x){ return x && String(x.cmId || '') === k; })
        || list.find(function (x){ return x && String(x.id || '') === k; })
        || null;
  }

  /* 🔌 card-detail.js が呼ぶフック。{t, type, label} の配列を返す（無ければ空） */
  window.pitMhsSchedule = function (staffName, dateStr){
    var ym = _ymOf(dateStr);
    if (!ym) return [];
    want(ym);                                   /* まだ読んでいない月ならここで購読を始める */
    var box = _cache[ym];
    if (!box) return [];                        /* 届くまでは空（届いたら描き直す） */
    var me = _staffOf(staffName);
    if (!me) return [];
    var day = box.days && box.days[dateStr];
    if (!day) return [];
    var list = [];
    _keysOf(me).some(function (k){
      if (day[k] && day[k].length){ list = day[k]; return true; }
      return false;
    });
    /* 🔴 v1.29.0（ゆうた指定）**当番は出さない**。**休みは下の「休み欄」にアバターで出す**ので、
       ここ（時間つきの行）からは省く。MHS 側のデータは触っていない＝出さないだけ。 */
    list = list.filter(function (x){ return x && x.ty !== 'duty' && x.ty !== 'off'; });
    /* card-detail.js が知っているキー名（t / type / label）に詰め替える */
    return list.map(function (x){
      return { t: x.t || '', type: _uiType(x.ty), label: x.l || '' };
    }).sort(function (a, b){
      var A = a.t || '~', B = b.t || '~';       /* 時刻なしは後ろ */
      return A < B ? -1 : (A > B ? 1 : 0);
    });
  };

  /* MHS の種別 → card-detail.js のアイコン（mtg / out / routine ほか）。
     ⚠ v1.29.0 で当番・休みは行として出さなくなったが、種別の対応表はそのまま残してある
        （将来また出したくなった時のため／知らない種別で崩れないように）。
     知らない種別が来ても崩れないよう、既定は mtg（社内予定）に寄せる。 */
  function _uiType(ty){
    if (ty === 'out')     return 'out';
    if (ty === 'off')     return 'off';
    if (ty === 'duty')    return 'duty';
    if (ty === 'routine') return 'routine';
    return 'mtg';
  }

  /* 🔌 その日「休み」の人ぜんぶ（MHS の休み欄と同じ顔ぶれ）。card-detail.js がアバターで並べる。
     ⚠ 担当ひとりではなく**その日休みの人全員**＝誰に振り替えられるかが一目で分かる。
     ⚠ 並びは名簿（state.staff）の順。名簿に居ない人（退職者など）は後ろ。 */
  window.pitMhsOff = function (dateStr){
    var ym = _ymOf(dateStr);
    if (!ym) return [];
    want(ym);
    var box = _cache[ym];
    if (!box) return [];
    var day = (box.days && box.days[dateStr]) || null;
    if (!day) return [];
    var out = [];
    Object.keys(day).forEach(function (id){
      var arr = day[id] || [];
      var hit = null;
      for (var i = 0; i < arr.length; i++){ if (arr[i] && arr[i].ty === 'off'){ hit = arr[i]; break; } }
      if (!hit) return;
      var m = _staffByKey(id);
      if (!m) return;                                    /* 名簿に居ない人（照合できなかった分）は出さない */
      out.push({ id: m.id, name: m.name || '', photo: m.photo || '', label: hit.l || '休み' });
    });
    var order = {};
    ((window.state && state.staff) || []).forEach(function (s, i){ if (s) order[s.id] = i; });
    out.sort(function (a, b){
      var A = (order[a.id] == null) ? 1e9 : order[a.id];
      var B = (order[b.id] == null) ? 1e9 : order[b.id];
      return A - B;
    });
    return out;
  };

  /* 画面に出す「この予定はいつ時点のものか」。card-detail.js が使う。 */
  window.pitMhsStatus = function (dateStr){
    var ym = _ymOf(dateStr);
    if (!ym) return null;
    want(ym);
    var box = _cache[ym];
    if (!box) return { state:'loading' };
    if (box.error)   return { state:'error' };
    if (box.missing) return { state:'none' };
    var at = box.updatedAt || 0;
    var days = at ? Math.floor((Date.now() - at) / 86400000) : null;
    return { state:'ok', updatedAt:at, staleDays:days };
  };

  console.log('[mhs-pit] ready（MHSが配る appSummaries/mhsDigest-YYYY-MM を読みます）');
})();

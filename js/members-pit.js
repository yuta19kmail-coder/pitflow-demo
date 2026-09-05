/* ========================================
   members-pit.js  -  メンバー（PitFlow）
   ----------------------------------------
   ◎考え方
     ・「誰が居るか」は CoreFlow の名簿（portalMembers）が唯一の正。
       名前・写真・在籍・並び順は CoreMembers → CoreFlow で管理する。ここでは直せない。
     ・**部署（1課／2課／受付課／その他）は CoreMembers が正**。PitFlow では直せない＝表示だけ。
       CoreMembers の「主所属・課・兼任（subDeptIds）」を読んで、PitFlow の4つに自動で振り分ける。
       兼任の人は複数の課に同時に入る（付箋の「1課ぜんぶ」等でも両方に出る）。
     ・PitFlow 側で持つのは **できること3つ（フロント・受付・メカ）だけ**。
       保存先は companies/kobayashi_motors/pitSettings/staffProps。
     ⚠ v1.4.0：「区分（スタッフ/幹部/メカのみ）」を廃止（幹部は何の動きにも効いていなかった）。
     ⚠ v1.6.0：部署の手動設定も廃止。人と組織の真実は CoreMembers に一本化。
     ⚠ v1.10.0：担当が「小林モータース」（＝自社）になっている分の受け皿を1件だけ用意。
       人ではないので CoreMembers には置かず、PitFlow の中だけの固定メンバー。課を持たないので
       1課・2課どちらの予約でも候補に出る。
     ⚠ v1.9.3：**並び順は CoreMembers の「一覧」タブと同じ＝入社日が古い順**
       （入社日なしは後ろ・同じなら本名の五十音順）。
     ⚠ v1.9.0：**メンバー一覧は CoreMembers の全員**（ログインしない人も含む）。
       ログインできる人（CoreFlowの名簿にいて PitFlow が使える人）には「ログイン」の印を付ける。
       ＝ログインしないアルバイト・回送要員も、担当や付箋で名前を選べる。
     ⚠ v1.7.0：画面に出す名前は CoreMembers の「表示名（通称）」に揃える。
       本名でも引けるように別名（aliases）を持たせてあるので、
       整備ソフト由来の担当（本名）や昔のカードもちゃんと結びつく。
     ・この2つを合わせて state.staff を作る。state.staff の形はいままでと同じなので、
       担当セレクト・付箋・ダッシュボードなど既存の画面はそのまま動く。

   ◎大事なところ
     ・カードに入っている担当は「名前の文字」で持っている（昔からの作り）。
       名簿から作り直しても、名前が同じなら過去のカードはそのまま繋がる。
     ・サンプルモード（github.io・デモ版）では名簿を読まない＝いままでのサンプル名簿のまま。
   ======================================== */
(function () {
  'use strict';

  var PROPS_DOC = 'staffProps';
  var _props = {};        // { memberId: {front, reception, mech} }
  var _members = [];      // portalMembers の生データ（PitFlow が使える人だけ）
  var _unsub = null;
  var _coreMembers = [];  // CoreMembers の社員名簿（在籍中）
  var _coreDepts = [];    // CoreMembers の組織（部・課）
  /* v1.8.0：退職者は「消える」のではなく在籍フラグが落ちるだけ（CoreMembers＝status:'left'／CoreFlow＝active:false）。
     捨てずにここへ寄せておく＝付箋やカードに残った名前がちゃんと出せる。MHS と同じ考え方。 */
  var _former = {};       // { id: {id,name,realName,aliases,left:true,leftAt,photo} }
  var _unsubCM = null, _unsubCD = null;
  var _coreLocs = [];     /* CoreMembers の場所マスター（陸運局・部品商など）。v1.119.0 */
  var _unsubLoc = null;
  var _coreLeft = [];     // CoreMembers の退職者（退職日つき）
  var _portalAll = [];    // CoreFlow の名簿（在籍中ぜんぶ）
  var SELF_ID = 'pit_self', SELF_NAME = '小林モータース';   /* 自社そのものを担当にする時の受け皿 */

  /* PitFlow の中での部署の分け方。CoreMembers の部署名から自動で振り分ける。
     ⚠ ここが「1課/2課/受付課/その他」の唯一の定義。増やす時はここに足す。 */
  var PIT_DIVS = [
    { id: 'div1',   label: '1課',   test: /(^|[^0-9０-９])(1|１|一)\s*課/ },
    { id: 'div2',   label: '2課',   test: /(^|[^0-9０-９])(2|２|二)\s*課/ },
    { id: 'recept', label: '受付課', test: /受付/ },
    { id: 'other',  label: 'その他', test: null }
  ];
  window.PIT_DIVS = PIT_DIVS;
  window.pitDivLabel = function (id) {
    var d = PIT_DIVS.find(function (x) { return x.id === id; });
    return d ? d.label : '';
  };

  /* 新しく名簿に載った人の初期値。
     ⚠ ここを「全部オフ」にすると担当の候補に出てこなくて気づけないので、
       まずは出るようにしておいて、メンバー画面で絞ってもらう。 */
  function defaultProps() {
    return { front: true, reception: true, mech: false };
  }

  /* 保存済みの値を読む。
     ⚠ v1.3.0 までは「区分（role）」で持っていたので、古い保存はここで新しい形に読み替える。
        role==='mech' だった人 → メカにチェック／フロント・受付はオフ。 */
  function propsOf(id) {
    var p = _props[id];
    if (!p) return (id === SELF_ID) ? { front: true, reception: false, mech: false } : defaultProps();
    var d = defaultProps();
    var oldMech = (p.mech === undefined && p.role === 'mech');
    return {
      front:     oldMech ? false : ((p.front     !== undefined) ? !!p.front     : d.front),
      reception: oldMech ? false : ((p.reception !== undefined) ? !!p.reception : d.reception),
      mech:      (p.mech !== undefined) ? !!p.mech : oldMech
    };
  }

  /* ---- CoreMembers（人と組織の真実）から部署を割り出す ---- */
  function deptById(id) {
    if (!id) return null;
    return _coreDepts.find(function (d) { return d.id === id; }) || null;
  }
  /* 部署名 → PitFlow の4分類。親（部）の名前もたどって判定する。 */
  function bucketOfDept(id, seen) {
    var d = deptById(id);
    if (!d) return null;
    seen = seen || {};
    if (seen[id]) return null;
    seen[id] = 1;
    var name = String(d.name || '');
    for (var i = 0; i < PIT_DIVS.length; i++) {
      var t = PIT_DIVS[i].test;
      if (t && t.test(name)) return PIT_DIVS[i].id;
    }
    return d.parentId ? bucketOfDept(d.parentId, seen) : null;
  }
  /* 主所属を 部(deptId)/課(sectionId) に読み替える（CoreMembers・MHS と同じ規則）。
     主所属に課が入っていた場合は、部＝その親／課＝その課 として扱う。 */
  function deptIdsOf(cm) {
    var pid = (cm && cm.primaryDeptId) || '', sid = (cm && cm.sectionDeptId) || '';
    var pd = deptById(pid);
    if (pd && pd.parentId) { if (!sid) sid = pid; pid = pd.parentId; }
    return { deptId: pid, sectionId: sid };
  }
  function deptOrder(id) {
    var d = deptById(id);
    return (d && typeof d.order === 'number') ? d.order : 1e9;
  }

  /* portalMember → CoreMembers の社員（portalMemberId で照合。無ければ名前で照合） */
  function coreOf(m) {
    var hit = _coreMembers.find(function (c) { return c.portalMemberId && c.portalMemberId === m.id; });
    if (hit) return hit;
    var k = keyOf(m.name);
    return k ? (_coreMembers.find(function (c) { return keyOf(c.name) === k || keyOf(c.dispName) === k; }) || null) : null;
  }
  /* その人の部署（兼任ぶんも全部）。返り値＝{ divisions:['div1',...], names:['整備1課',...] } */
  function divisionsOf(m, cm) {
    if (cm === undefined) cm = coreOf(m);
    if (!cm) return { divisions: [], names: [] };
    var ids = [];
    if (cm.sectionDeptId) ids.push(cm.sectionDeptId);
    if (cm.primaryDeptId) ids.push(cm.primaryDeptId);
    (cm.subDeptIds || []).forEach(function (x) { ids.push(x); });
    var divs = [], names = [];
    ids.forEach(function (id) {
      var d = deptById(id);
      if (d && d.name && names.indexOf(d.name) < 0) names.push(d.name);
      var b = bucketOfDept(id);
      if (b && divs.indexOf(b) < 0) divs.push(b);
    });
    if (!divs.length && names.length) divs.push('other');   // 部署はあるが1課/2課/受付でない＝その他
    return { divisions: divs, names: names };
  }

  /* 退職者の一覧を作る。CoreFlow で在籍なしにした人＋CoreMembers で退職にした人。 */
  var _formerSrc = [];
  function rebuildFormer() {
    var out = {};
    /* ① CoreMembers 側の退職者（退職日つき） */
    _coreLeft.forEach(function (cm) {
      var id = cm.portalMemberId || ('cm_' + cm.id);
      var disp = String(cm.dispName || '').trim() || String(cm.name || '').trim() || '(名前なし)';
      out[id] = { id: id, name: disp, realName: String(cm.name || '').trim(),
                  lastName: String(cm.lastName || '').trim(), dispName: String(cm.dispName || '').trim(),
                  aliases: [cm.name, cm.dispName].filter(Boolean).map(String),
                  left: true, leftAt: cm.leftAt || '', photo: cm.photo || '',
                  divisions: [], deptNames: [], front: false, reception: false, mech: false };
    });
    /* ② CoreFlow 側で在籍なしにした人（CoreMembers に無ければこちらの名前で） */
    _formerSrc.forEach(function (m) {
      if (out[m.id]) { if (!out[m.id].photo) out[m.id].photo = m.photo || ''; return; }
      out[m.id] = { id: m.id, name: m.name || '(名前なし)', realName: m.name || '',
                    aliases: [m.name, m.gname].filter(Boolean).map(String),
                    left: true, leftAt: '', photo: m.photo || '',
                    divisions: [], deptNames: [], front: false, reception: false, mech: false };
    });
    _former = out;
    window.PIT_FORMER = out;
  }

  /* CoreMembers（全員）＋ CoreFlow のログイン情報 ＋ PitFlow属性 → state.staff を作り直す。
     ⚠ v1.9.0：一覧の元は **CoreMembers の在籍者ぜんぶ**。
        ログインしない人（アルバイト・回送要員）も、担当や付箋で名前を選べるようにするため。 */
  function rebuildStaff() {
    var portalById = {}, portalByKey = {};
    _portalAll.forEach(function (p) {
      portalById[p.id] = p;
      var k = keyOf(p.name); if (k) portalByKey[k] = p;
    });

    var rows = [];
    var usedPortal = {};

    _coreMembers.forEach(function (cm) {
      var pm = (cm.portalMemberId && portalById[cm.portalMemberId])
            || portalByKey[keyOf(cm.dispName)] || portalByKey[keyOf(cm.name)] || null;
      if (pm) usedPortal[pm.id] = 1;
      var id = (pm && pm.id) || ('cm_' + cm.id);
      var disp = String(cm.dispName || '').trim() || String(cm.name || '').trim() || (pm && pm.name) || '(名前なし)';
      var dv = divisionsOf(pm || { id: id, name: cm.name }, cm);
      rows.push({
        joinedAt: String(cm.joinedAt || ''),   /* 並びに使う（CoreMembers の「一覧」＝入社日が古い順） */
        id: id,
        cmId: cm.id,
        name: disp,
        realName: String(cm.name || '').trim() || (pm && pm.name) || '',
        /* 🔴 v1.31.0 表紙印刷などで「苗字だけ」を出すために、CoreMembers の
           **姓（lastName）** と **呼び名＝優先表示名（dispName）** をそのまま持っておく。
           ⚠ name（＝画面に出る名前）は今までどおり dispName 優先のフルネーム扱い。ここは別枠。 */
        lastName: String(cm.lastName || '').trim(),
        dispName: String(cm.dispName || '').trim(),
        aliases: [cm.name, cm.dispName, pm && pm.name, pm && pm.gname].filter(Boolean).map(String),
        canLogin: !!(pm && pm._usable),
        divisions: dv.divisions,
        division: dv.divisions[0] || '',
        deptNames: dv.names,
        photo: (pm && pm.photo) || cm.photo || '',
        email: (pm && pm.email) || '',
        sort: (typeof cm.sortOrder === 'number') ? cm.sortOrder : 1e9
      });
    });

    /* CoreMembers に居ないのに PitFlow が使える人（紐付け漏れ）も落とさない */
    _members.forEach(function (pm) {
      if (usedPortal[pm.id]) return;
      rows.push({
        id: pm.id, cmId: '', name: pm.name || '(名前なし)', realName: pm.name || '',
        lastName: '', dispName: '',            /* CoreMembers に居ない人は姓・呼び名を持たない */
        aliases: [pm.name, pm.gname].filter(Boolean).map(String),
        canLogin: true, divisions: [], division: '', deptNames: [],
        photo: pm.photo || '', email: pm.email || '',
        joinedAt: '',
        sort: 1e9   /* CoreMembers に居ない人は末尾（並びは CoreMembers が正） */
      });
    });

    /* v1.10.0：自社そのものを担当にすることがある（整備ソフト側の都合で「小林モータース」が
       受付担当として入ってくる）。人ではないので CoreMembers には置かず、PitFlow の中だけの
       固定メンバーとして最後に足す。1課・2課どちらの予約でも候補に出る（課を持たない）。 */
    var selfP = propsOf(SELF_ID);
    rows.push({
      id: SELF_ID, cmId: '', isSelf: true,
      name: SELF_NAME, realName: SELF_NAME,
      lastName: '', dispName: '',              /* 自社（人ではない）は姓を持たない＝そのまま出す */
      aliases: ['小林モータース', '小林モータース 株式会社', '小林モータース株式会社', '(株)小林モータース', 'コバモ'],
      canLogin: false, divisions: [], division: '', deptNames: [],
      photo: '', email: '', joinedAt: '', sort: 1e9,
      front: (selfP.front !== undefined) ? !!selfP.front : true,
      reception: !!selfP.reception, mech: !!selfP.mech
    });

    /* 並びは CoreMembers の「一覧」タブと同じ＝**入社日が古い順**。
       入社日が入っていない人は後ろ。同じ日・未入力どうしは本名の五十音順。
       （CoreMembers の _cmpJoined と同じ規則） */
    rows.sort(function (a, b) {
      if (!!a.isSelf !== !!b.isSelf) return a.isSelf ? 1 : -1;   /* 自社は必ず最後 */
      var aj = a.joinedAt || '', bj = b.joinedAt || '';
      if (aj && bj) { if (aj < bj) return -1; if (aj > bj) return 1; }
      else if (aj && !bj) return -1;
      else if (!aj && bj) return 1;
      return String(a.realName || a.name || '').localeCompare(String(b.realName || b.name || ''), 'ja');
    });

    window.state.staff = rows.map(function (r) {
      var p = propsOf(r.id);
      r.front = !!p.front; r.reception = !!p.reception; r.mech = !!p.mech;
      return r;
    });

    window.PIT_MEMBERS_READY = true;
    /* 名簿が変わったら、お客様データの担当名も今の名前にそろえる（番号が入っている分だけ） */
    try { if (window.pitSyncCustomerStaffNames) window.pitSyncCustomerStaffNames(); } catch (e) { console.warn('[members] 担当名の追従でエラー', e); }
    if (window.pitRenderTopUser) { try { pitRenderTopUser(); } catch (e) {} }
    if (window.state && state.currentView === 'members') renderMembers();
  }
  window.pitRebuildStaff = rebuildStaff;

  /* =======================================================
     v1.5.0：お客様データの「担当者」をメンバーに結びつける
     -------------------------------------------------------
     ◎考え方
       これまで担当は「名前の文字」だけで持っていた（昔からの作り）。
       そこに **メンバーの番号（frontStaffId / picId）** を添えておく。
       名前の文字はそのまま残すので、既存の画面・絞り込み・印刷は無改修で動く。
       名簿が読めたら、番号を頼りに **名前の文字を今の名前へ自動で直す**
       ＝ CoreFlow で改名しても、お客様データの担当がズレない。
     ======================================================= */
  var VARIANT = { '﨑': '崎', '髙': '高', '冨': '富', '濵': '浜', '濱': '浜', '邊': '辺', '邉': '辺', '齋': '斎', '齊': '斉', '曻': '昇', '德': '徳', '瀨': '瀬' };
  function keyOf(name) {
    var t = String(name == null ? '' : name);
    try { t = t.normalize('NFKC'); } catch (e) {}
    t = t.replace(/[\s\u3000]/g, '');
    return t.replace(/[﨑髙冨濵濱邊邉齋齊曻德瀨]/g, function (c) { return VARIANT[c] || c; });
  }
  window.pitStaffKey = keyOf;

  window.pitStaffById = function (id) {
    if (!id) return null;
    return ((window.state && state.staff) || []).find(function (s) { return s.id === id; })
        || _former[id] || null;
  };
  /* 在籍中＋退職者。名前を出したいだけの時はこちらを使う。 */
  window.pitStaffAny = function (idOrName) {
    return window.pitStaffById(idOrName) || window.pitStaffByName(idOrName) || null;
  };
  window.pitIsFormer = function (id) { return !!(id && _former[id]); };
  window.pitFormerList = function () { return Object.keys(_former).map(function (k) { return _former[k]; }); };
  /* その名前が「いま在籍している人」かどうか（カードの担当候補の出し分けに使う） */
  window.pitStaffActiveByName = function (name) {
    var k = keyOf(name);
    if (!k) return null;
    var list = (window.state && state.staff) || [];
    return list.find(function (s) { return keyOf(s.name) === k; })
        || list.find(function (s) { return (s.aliases || []).some(function (a) { return keyOf(a) === k; }); })
        || null;
  };
  window.pitStaffByName = function (name) {
    var k = keyOf(name);
    if (!k) return null;
    var list = (window.state && state.staff) || [];
    var f = Object.keys(_former).map(function (x) { return _former[x]; });
    return list.find(function (s) { return keyOf(s.name) === k; })
        || list.find(function (s) { return (s.aliases || []).some(function (a) { return keyOf(a) === k; }); })
        || f.find(function (s) { return keyOf(s.name) === k; })
        || f.find(function (s) { return (s.aliases || []).some(function (a) { return keyOf(a) === k; }); })
        || null;
  };

  /* お客様データとカードの担当名を、番号を頼りに今の名前へ直す。直した件数を返す。 */
  window.pitSyncCustomerStaffNames = function (save) {
    var list = (window.state && state.customers) || [];
    var n = 0;
    /* v1.8.0：予約カードの担当も追従させる（改名しても過去カードがズレない） */
    ((window.state && state.cards) || []).forEach(function (c) {
      ['frontStaff', 'reserveStaff', 'completeCallStaff'].forEach(function (k) {
        var id = c[k + 'Id'];
        var m = id ? window.pitStaffById(id) : null;
        if (m && c[k] !== m.name) { c[k] = m.name; n++; }
      });
      /* ✅ v2.73.0 チェック担当も改名に追従させる（入れた人が改名しても別人にならない） */
      [['inspectors', 'inspectorIds'], ['mechanics', 'mechanicIds'],
       ['checkers', 'checkerIds']].forEach(function (pair) {
        var names = c[pair[0]], ids = c[pair[1]];
        if (!Array.isArray(names) || !Array.isArray(ids)) return;
        for (var i = 0; i < names.length && i < ids.length; i++) {
          var mm = ids[i] ? window.pitStaffById(ids[i]) : null;
          if (mm && names[i] !== mm.name) { names[i] = mm.name; n++; }
        }
      });
    });
    list.forEach(function (c) {
      var m = c.picId ? window.pitStaffById(c.picId) : null;
      if (m && c.pic !== m.name) { c.pic = m.name; n++; }
      (c.vehicles || []).forEach(function (v) {
        var vm = v.frontStaffId ? window.pitStaffById(v.frontStaffId) : null;
        if (vm && v.frontStaff !== vm.name) { v.frontStaff = vm.name; n++; }
      });
    });
    if (n) {
      console.log('[members] 担当の名前を', n, '箇所そろえました（お客様＋カード）');
      if (save !== false && window.PitDB && window.PitDB._loaded !== false) PitDB.save();
    }
    return n;
  };

  /* ---- 読み込み（本番モード） ---- */
  function loadProps() {
    return window.fb.company().collection('pitSettings').doc(PROPS_DOC).get()
      .then(function (d) { _props = (d.exists && (d.data() || {}).props) || {}; })
      .catch(function (e) { console.warn('[members] PitFlow属性の読込に失敗（既定で続けます）', e); _props = {}; });
  }

  /* CoreMembers（社員と組織）を購読。変わったら部署の振り分けもやり直す。 */
  function watchCore() {
    var base = window.fb.company();
    if (!_unsubCD) {
      _unsubCD = base.collection('coreDepts').onSnapshot(function (snap) {
        var a = []; snap.forEach(function (d) { var x = d.data() || {}; x.id = d.id; a.push(x); });
        _coreDepts = a;
        console.log('[members] CoreMembers の組織', a.length, '件');
        rebuildStaff();
      }, function (e) { console.warn('[members] 組織(coreDepts)の購読に失敗（部署なしで続けます）', e); });
    }
    if (!_unsubCM) {
      _unsubCM = base.collection('coreMembers').onSnapshot(function (snap) {
        var a = [], left = [];
        snap.forEach(function (d) {
          var x = d.data() || {}; x.id = d.id;
          if (x.status === 'left' || x.active === false) { left.push(x); return; }   /* 退職＝控える */
          a.push(x);
        });
        _coreMembers = a; _coreLeft = left;
        console.log('[members] CoreMembers の社員', a.length, '人／退職', left.length, '人');
        rebuildFormer();
        rebuildStaff();
      }, function (e) { console.warn('[members] 社員(coreMembers)の購読に失敗（部署なしで続けます）', e); });
    }
    /* 🔴 v1.119.0 **場所マスター（CoreMembers の「場所」）**も購読する（2026-08-18・ゆうた指定）。
       車検予定で「どこの陸運局へ行くか」を選ぶための一覧。
       ⚠ **PitFlow では作れない・直せない。CoreMembers が正。** ここは読むだけ。 */
    if (!_unsubLoc) {
      _unsubLoc = base.collection('coreLocations').onSnapshot(function (snap) {
        var a = []; snap.forEach(function (d) { var x = d.data() || {}; x.id = d.id; a.push(x); });
        _coreLocs = a;
        console.log('[members] CoreMembers の場所', a.length, '件（うち陸運局', pitRikuunList().length, '件）');
        if (window.renderShaken && window.state && state.currentView === 'shakencal') renderShaken();
      }, function (e) { console.warn('[members] 場所(coreLocations)の購読に失敗（陸運局は選べません）', e); });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     📍 場所マスター（CoreMembers）＝ここが PitFlow 側の窓口。**物差しは1本**
     ------------------------------------------------------------------
     🔴 「陸運支局のバッジが付いているもの」＝場所のカテゴリ。
        鍵は `rikuun` 固定だが、CoreMembers の設定でカテゴリ名を作り直せるので、
        **鍵が `rikuun` か、名札に「陸運」が入っていれば陸運局**として拾う（取りこぼさない側）。
     ⚠ 「有効」のチェックが外れている場所は出さない。
     ⚠ 並びは CoreMembers と同じ考え方＝**よく使う → 並び順 → 名前**。
     ══════════════════════════════════════════════════════════════════ */
  function _locCatLabel(key) {
    var cats = (window.state && state.settings && state.settings.locCats) || null;
    if (Array.isArray(cats)) {
      var h = cats.find(function (c) { return c && c.key === key; });
      if (h) return String(h.label || '');
    }
    return key === 'rikuun' ? '陸運局' : '';
  }
  function pitIsRikuunLoc(l) {
    if (!l || l.active === false) return false;
    if (l.category === 'rikuun') return true;
    return /陸運/.test(_locCatLabel(l.category) || '');
  }
  /* サンプル・デモ版は CoreMembers を読まない（名簿と同じ扱い）。
     ⚠ ここが空だと車検予定で陸運局が1つも選べず「壊れている」ように見えるので、見本を置く。
     ⚠ **本番では絶対に使われない**（`PIT_CLOUD` が立つと購読した中身で上書きされる）。 */
  var SAMPLE_RIKUUN = [
    { id: 'sample_rik_noda',  name: '野田自動車検査登録事務所', category: 'rikuun', frequent: true,  order: 0, active: true },
    { id: 'sample_rik_chiba', name: '千葉運輸支局',             category: 'rikuun', frequent: false, order: 1, active: true },
    { id: 'sample_rik_narsh', name: '習志野自動車検査登録事務所', category: 'rikuun', frequent: false, order: 2, active: true }
  ];
  /* 陸運局の一覧（車検予定の「どこへ行くか」の選択肢） */
  /* 🔴 v1.160.0 絞り込みと並びは **pit-share.js の `pitRikuunFrom` 1本**。
     ＝ MHS も同じ関数に自分の場所の表を渡すので、**どちらの画面でも同じ順・同じ中身**になる。
     ⚠ ここでやるのは「どの表を渡すか」だけ（本番＝購読した中身／サンプル＝見本）。 */
  function pitRikuunList() {
    var src = (!window.PIT_CLOUD && !_coreLocs.length) ? SAMPLE_RIKUUN : _coreLocs;
    if (window.pitRikuunFrom) return pitRikuunFrom(src, _locCatLabel);
    return src.filter(pitIsRikuunLoc);
  }
  /* 場所の名前を引く。⚠ 消された・名前が変わった時に備えて、呼ぶ側は写しを後ろ盾に持つこと。 */
  function pitLocName(id) {
    if (!id) return '';
    var src = (!window.PIT_CLOUD && !_coreLocs.length) ? SAMPLE_RIKUUN : _coreLocs;
    var h = src.find(function (l) { return l.id === id; });
    return h ? String(h.name || '') : '';
  }
  /* 🔴 v1.175.0 場所マスターを**そのまま**外へ出す（予定依頼の「行き先」で全部の場所から選ぶため）。
     ⚠ 陸運局だけに絞るのは pitRikuunList。用途が違うので混ぜない。 */
  function pitLocList() {
    var src = (!window.PIT_CLOUD && !_coreLocs.length) ? SAMPLE_RIKUUN : _coreLocs;
    return (src || []).slice();
  }
  window.pitLocList     = pitLocList;
  window.pitIsRikuunLoc = pitIsRikuunLoc;
  window.pitRikuunList  = pitRikuunList;
  window.pitLocName     = pitLocName;

  function watchMembers() {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
    _unsub = window.fb.company().collection('portalMembers')
      .onSnapshot(function (snap) {
        var out = [], gone = [], all = [];
        snap.forEach(function (doc) {
          var m = doc.data() || {}; m.id = doc.id;
          var usable = (m.master === true) || !!(m.pitflow && m.pitflow.on === true);
          if (m.active === false) { gone.push(m); return; }   /* 退職＝消さずに控える */
          m._usable = usable;
          all.push(m);
          if (usable) out.push(m);
        });
        _members = out;      /* PitFlow にログインできる人 */
        _portalAll = all;    /* 在籍している人ぜんぶ（ログインの有無を見るため） */
        _formerSrc = gone;
        rebuildFormer();
        console.log('[members] CoreFlowの名簿から', out.length, '人');
        rebuildStaff();
      }, function (e) {
        console.error('[members] 名簿の購読に失敗', e);
      });
  }

  /* auth-pit.js から呼ばれる（ログイン直後） */
  window.pitOnLogin = function (member, user) {
    loadProps().then(function () {
      watchMembers();
      watchCore();
      /* 保存のクラウド接続（db-pit.js 側で用意する。まだ無ければ何もしない） */
      if (window.PitDB && typeof PitDB.connectCloud === 'function') {
        try { PitDB.connectCloud(user, member); } catch (e) { console.error('[members] クラウド接続でエラー', e); }
      }
    });
  };
  window.pitOnLogout = function () {
    if (_unsub) { try { _unsub(); } catch (e) {} _unsub = null; }
    if (_unsubCM) { try { _unsubCM(); } catch (e) {} _unsubCM = null; }
    if (_unsubCD) { try { _unsubCD(); } catch (e) {} _unsubCD = null; }
    if (window.PitDB && typeof PitDB.disconnectCloud === 'function') {
      try { PitDB.disconnectCloud(); } catch (e) {}
    }
  };

  /* ---- 保存（PitFlow属性だけ） ---- */
  function saveProps() {
    if (!window.PIT_CLOUD) { if (window.PitDB) PitDB.save(); return Promise.resolve(true); }
    return window.fb.company().collection('pitSettings').doc(PROPS_DOC)
      .set({ props: _props, updatedAt: window.fb.serverTimestamp() }, { merge: true })
      .then(function () { return true; })
      .catch(function (e) {
        console.error('[members] 保存に失敗', e);
        if (window.showToast) showToast('メンバーの設定を保存できませんでした', 'PF-9040');
        return false;
      });
  }

  /* =======================================================
     メンバー画面
     ======================================================= */


  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderMembers() {
    var box = document.getElementById('members-body');
    if (!box) return;
    var cloud = !!window.PIT_CLOUD;
    var canEdit = !cloud || (window.pitIsAdmin && pitIsAdmin());
    /* 🔴 v1.51.0（ゆうた指定）：**「小林モータース」はアカウントではない**。
       人ではなく「整備ソフト側で担当が『小林モータース』になっている分の受け皿」なので、
       **メンバー一覧（＝アカウントの一覧）には出さない**。
       ⚠ フロント担当・予約担当・完TEL担当の候補には**今までどおり出る**（そこでは必要）。
       ⚠ 会社としてのアカウントは「コバモ」が別に CoreMembers に居るので、そちらが出る。 */
    var list = ((window.state && state.staff) || []).filter(function (s) { return !s.isSelf; });

    var h = '';

    h += '<div class="mb-note">'
       + '<span class="mb-note-ic"><i data-ic=users data-ics=18></i></span>'
       + '<div><b>人と組織は CoreMembers が元</b>です（名前・表示名・所属・在籍）。'
       + 'ここで直すのは「PitFlow の中でできること」（フロント・受付・メカ）だけ。'
       + '<b>部署は CoreMembers の所属から自動</b>で入ります（兼任もそのまま反映）。'
       + '<b>ログインしない人も全員ここに出ます</b>（担当や付箋で名前を選べます）。'
       + '「ログイン」の印が付いている人だけ、PitFlow を開けます（権限は CoreFlow 側）。'
       + '人の追加や退職の反映は CoreFlow 側でお願いします。'
       + '<br>※「小林モータース」は<b>人ではないのでここには出しません</b>（整備ソフト側で担当が'
       + '「小林モータース」になっている分の受け皿として、フロント担当などの候補にだけ出ます）。</div>'
       + '<a class="mb-openportal" href="https://coreflow.kobayashi-motors.com" target="_blank" rel="noopener">'
       + '<i data-ic=external data-ics=15></i> CoreFlowのメンバー管理を開く</a>'
       + '</div>';

    if (!cloud) {
      h += '<div class="mb-warn"><i data-ic=info data-ics=15></i> いまはサンプルの名簿です。本番のアドレスで開くと CoreFlow の実メンバーになります。</div>';
    }
    /* v1.8.0：気づけるように、あぶない状態を先に出す */
    if (cloud) {
      var warn = [];
      var nameCount = {};
      list.forEach(function (x) { var k = keyOf(x.name); nameCount[k] = (nameCount[k] || 0) + 1; });
      var dup = list.filter(function (x) { return nameCount[keyOf(x.name)] > 1; }).map(function (x) { return x.name; });
      if (dup.length) warn.push('<b>同じ名前の人がいます</b>：' + esc(Array.from(new Set(dup)).join('、')) +
        '。整備ソフトの担当者を結びつける時に取り違えます。CoreMembers の表示名を変えて区別してください。');
      var noCm = list.filter(function (x) { return !x.cmId && !x.isSelf; }).map(function (x) { return x.name; });
      if (noCm.length) warn.push('<b>CoreMembers に居ません</b>：' + esc(noCm.join('、')) +
        '。CoreFlow のアカウントだけある状態です。CoreMembers に社員として登録し、「ログインアカウント」を紐付けてください。');
      var noCore = list.filter(function (x) { return x.cmId && !x.isSelf && (!x.deptNames || !x.deptNames.length); }).map(function (x) { return x.name; });
      if (noCore.length) warn.push('<b>部署が入っていません</b>：' + esc(noCore.join('、')) +
        '。CoreMembers で所属を設定してください。');
      var other = list.filter(function (x) { return (x.divisions || []).length === 1 && x.divisions[0] === 'other'; }).map(function (x) { return x.name; });
      if (other.length) warn.push('「その他」になっている人：' + esc(other.join('、')) +
        '。1課・2課・受付の人がここに入っていたら、CoreMembers の部署名を確認してください（名前に「1課」等が入っていないと判定できません）。');
      if (warn.length) {
        h += '<div class="mb-warn mb-warn-check"><i data-ic=warn data-ics=15></i><div>' + warn.join('<br>') + '</div></div>';
      }
    }
    if (cloud && !canEdit) {
      h += '<div class="mb-warn"><i data-ic=lock data-ics=15></i> 見るだけの権限です。変更できるのは PitFlow の役割が「管理」の人だけです。</div>';
    }

    h += '<div class="mb-table-wrap"><table class="mb-table"><thead><tr>'
       + '<th class="mb-c-name">名前<small>（ログイン可否）</small></th><th class="mb-c-div">部署<small>（CoreMembers）</small></th>'
       + '<th class="mb-c-ck">フロント</th><th class="mb-c-ck">受付</th><th class="mb-c-ck">メカ</th>'
       + '</tr></thead><tbody>';

    if (!list.length) {
      h += '<tr><td colspan="5" class="mb-empty">メンバーがいません。CoreMembers に社員が登録されているか確認してください。</td></tr>';
    }

    list.forEach(function (s) {
      var dis = canEdit ? '' : ' disabled';
      /* 部署は CoreMembers から。見るだけ（兼任は並べて出す） */
      var dv = (s.divisions && s.divisions.length)
        ? s.divisions.map(function (id) { return '<span class="mb-div">' + esc(window.pitDivLabel(id)) + '</span>'; }).join('')
        : (s.isSelf ? '<span class="mb-div">1課・2課 共通</span>' : '<span class="mb-div is-none">未所属</span>');
      h += '<tr data-mid="' + esc(s.id) + '">'
        + '<td class="mb-c-name"><span class="mb-av">' + (s.photo ? '<img src="' + esc(s.photo) + '" alt="">' : esc((s.name || '？').slice(0, 2))) + '</span>'
        + '<span class="mb-nm">' + esc(s.name)
        + ((s.realName && s.realName !== s.name) ? '<small class="mb-real">' + esc(s.realName) + '</small>' : '')
        + '</span>'
        + (s.isSelf ? '<span class="mb-login is-self" title="人ではなく自社そのもの。整備ソフト側で担当が「小林モータース」になっている分の受け皿です">自社</span>'
           : s.canLogin ? '<span class="mb-login" title="CoreFlow のアカウントがあり、PitFlow を使えます">ログイン可</span>'
                        : '<span class="mb-login is-off" title="PitFlow は開けません（担当や付箋で名前は選べます）">非ログイン</span>')
        + '</td>'
        + '<td class="mb-c-div" title="' + esc((s.deptNames || []).join('／')) + '">' + dv + '</td>'
        + '<td class="mb-c-ck"><input type="checkbox"' + (s.front ? ' checked' : '') + dis
        + ' onchange="pitMbSet(\'' + esc(s.id) + '\',\'front\',this.checked)"></td>'
        + '<td class="mb-c-ck"><input type="checkbox"' + (s.reception ? ' checked' : '') + dis
        + ' onchange="pitMbSet(\'' + esc(s.id) + '\',\'reception\',this.checked)"></td>'
        + '<td class="mb-c-ck"><input type="checkbox"' + (s.mech ? ' checked' : '') + dis
        + ' onchange="pitMbSet(\'' + esc(s.id) + '\',\'mech\',this.checked)"></td>'
        + '</tr>';
    });

    h += '</tbody></table></div>';

    /* v1.8.0：辞めた人。消えていないことを見せる＝付箋やカードに残った名前もちゃんと出る。 */
    var former = (window.pitFormerList ? window.pitFormerList() : []);
    if (cloud && former.length) {
      h += '<div class="mb-former"><div class="mb-former-h"><i data-ic=history data-ics=15></i> 退職した人（' + former.length + '人）</div>'
         + '<div class="mb-former-b">'
         + former.sort(function (a, b) { return String(b.leftAt || '').localeCompare(String(a.leftAt || '')); })
                .map(function (f) { return '<span class="mb-former-i">' + esc(f.name) + (f.leftAt ? '<small>' + esc(f.leftAt) + '</small>' : '') + '</span>'; }).join('')
         + '</div><div class="mb-former-n">名前は消えません。付箋やカード・実績に残った担当はこの名前で表示され、'
         + '新しい担当の候補には出ません。戻ってきた時は CoreFlow で在籍に戻せば元どおりです。</div></div>';
    }
    h += '<div class="mb-hint">'
       + '<b>部署</b>は <b>CoreMembers の所属から自動</b>です（ここでは直せません）。'
       + '兼任の人は<b>両方に入ります</b>。1課・2課はカードの課での絞り込みと、付箋の「1課ぜんぶ」「2課ぜんぶ」に使われます。'
       + '<b>受付課</b>・<b>その他</b>の人は、どの課の予約でも候補に出ます。部署を直すときは CoreMembers で。<br>'
       + '<b>フロント</b>＝予約カードのフロント欄に出る人。<b>受付</b>＝予約担当（電話を取る人）に出る人'
       + '（<b>予約担当だけは課で絞りません。チェックが入っている人は全員出ます</b>）。'
       + '<b>メカ</b>＝整備タブの点検担当者・整備担当者に出る人。<br>'
       + '3つとも自由に組み合わせられます（フロントもやるメカ、受付もやるフロント、など）。'
       + '使える／管理などの権限は CoreFlow 側で決めます。'
       + '</div>';

    box.innerHTML = h;
    if (window.icoBoot) icoBoot(box);
  }
  window.renderMembers = renderMembers;

  /* 1項目ずつその場で保存（保存ボタンなし） */
  window.pitMbSet = function (id, key, val) {
    if (!_props[id]) _props[id] = defaultProps();
    _props[id][key] = val;
    delete _props[id].role;   /* v1.4.0：古い「区分」は保存し直さない */

    if (!window.PIT_CLOUD) {
      /* サンプルモードは state.staff を直接いじって、いつもの保存に乗せる */
      var s = (state.staff || []).find(function (x) { return x.id === id; });
      if (s) { s[key] = val; }
      if (window.PitDB) PitDB.save();
      renderMembers();
      return;
    }
    rebuildStaff();
    var _who = (_members.find(function (m) { return m.id === id; }) || {}).name || id;
    var _lb = { front: 'フロント', reception: '受付', mech: 'メカ' }[key] || key;
    if (window.pitLog) pitLog('メンバー設定を変更（' + _lb + '）', { kind: 'member', label: _who + ' → ' + val });
    saveProps().then(function (ok) {
      if (ok && window.showToast) showToast('メンバーの設定を保存しました');
    });
  };
})();

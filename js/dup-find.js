/* ========================================
   dup-find.js ── 🔎 ダブりを洗い出す（PitFlow v2.37.0）
   ----------------------------------------
   ◎なぜ要るか（2026-08-30・ゆうた指定）
     v2.34〜v2.36 で**これから増える分**は止めた（ナンバーが分かった時に聞く／打っている最中に候補）。
     でも**すでに貯まっている分**は残る。まとめる道具（車・お客様）は作ったが、
     **どれをまとめればいいか探す手段が無い**。これがその「見つける側」。

   ◎出すもの（強い順）
     ① 🔴 **同じ車体番号の車が2台以上** … **100%ダブり**。車体番号は一生変わらない番号なので言い切れる
        （伝票の突合＝クォーターチェックが入れる。だから予約入力時の鍵にはならないが、あとから効く）
     ② ⚠ **同じ人が「ナンバーなし」と「本物のナンバー」を持っている** … 疑わしい。人が見て決める
        （車種まで同じなら、ほぼ黒）
     ③ ⚠ **同じ電話番号／同じカナ の人が2人以上** … 人のダブりの候補。顧客の統合の受け皿

   ◎決めごと
     🔴 **ここは読むだけ。1文字も書かない。** 直すのは「まとめる」窓の方（そちらに確認の窓がある）
     🔴 数だけ出して終わりにしない。**どれとどれか**を名指しして、そのまま**まとめる窓へ飛ばす**
     ⚠ 都度車両変動・アーカイブ済み・統合で吸収済みは相手にしない
   ======================================== */
(function (w, d) {
  'use strict';

  function t(x){ return String(x == null ? '' : x).trim(); }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function norm(s){ return String(s==null?'':s).replace(/\s+/g,'').replace(/[ァ-ヶ]/g,function(ch){ return String.fromCharCode(ch.charCodeAt(0)-0x60); }).toLowerCase(); }
  function custs(){ return (w.state && state.customers) || []; }
  function realPlate(p){ return w.pitIsRealPlate ? pitIsRealPlate(p) : !!t(p); }
  function disp(c){ return (w.pitCustDispName ? pitCustDispName(c) : ((c&&c.name)||(c&&c.kana)||'')) || '(無名)'; }
  function vehName(v){ return (((v.maker?v.maker+' ':'')+(v.car||'')).trim()) || '—'; }
  function plateOf(v){ return t(v.plate) || (v.perVisit?'都度車両変動':'ナンバーなし'); }

  /* ================================================================
     🙅 特例で外すお客様（2026-08-30・ゆうた指定）
     ----------------------------------------------------------------
     🗣「**ANDRZEJ SCHMIDT／株式会社 Japan Campers だけはもう増えないし、特例的に除外して**
     　　（レンタカー屋さんでほんとにこの状態）」
     ＝ ナンバーなしの車や同じ車体番号が並ぶのが**本当の姿**なので、毎回上に出ても邪魔なだけ。
     ⚠ **洗い出しから外すだけ。**まとめる窓からは今までどおり触れる（隠すのではなく、探さないだけ）。
     ⚠ 増えたら `state.settings.dupSkip`（名前の配列）に足せば、ここを触らずに増やせる。
     ================================================================ */
  var 特例 = ['ANDRZEJ SCHMIDT', '株式会社 Japan Campers', '小林モータース株式会社'];
  function 外す名簿(){
    var a = 特例.slice();
    var add = (w.state && state.settings && state.settings.dupSkip) || [];
    if(Array.isArray(add)) a = a.concat(add);
    return a.map(norm).filter(Boolean);
  }
  function 外す(c){
    var ng = 外す名簿();
    return ng.indexOf(norm(c && c.name)) >= 0 || ng.indexOf(norm(c && c.kana)) >= 0;
  }
  w.pitDupSkipped = 外す;
  function 生きた客(){
    return custs().filter(function(c){
      if(!c) return false;
      if(w.pitCustMerged && pitCustMerged(c)) return false;
      if(w.PitArchive && PitArchive.custArchived && PitArchive.custArchived(c)) return false;
      if(外す(c)) return false;                       /* 🙅 特例で外す（レンタカー屋さん等） */
      return true;
    });
  }
  function 生きた車(c){
    return ((c&&c.vehicles)||[]).filter(function(v){
      if(!v || v.perVisit || v.mergedInto) return false;
      return !(w.PitArchive ? PitArchive.vehSelfArchived(v) : v.archived);
    });
  }

  /* ================================================================
     ✅ 「これでOK」＝もう出さない印（2026-08-30・ゆうた指定）
     ----------------------------------------------------------------
     🗣「展開した時に **これでOK ボタンもほしい。次から出てこないように**」
     ◎どこに持つか＝**関わっているお客様のレコードに `dupOk`（合図の並び）**。
        設定に貯めると際限なく増えるが、お客様に付ければ**その人と一緒に消える・一緒に動く**。
     🔴 **これは印を付けるだけ。**車も人もカードも1文字も触らない（直すのは「まとめる」窓の方）。
     🔴 **取り消せる**＝「OKにしたもの」タブから戻せる（これも決めごと）。
     ================================================================ */
  function 合図(kind, ids){ return kind + ':' + ids.slice().sort().join('+'); }
  function OK済み(key, 客ら){ return 客ら.some(function(c){ return ((c&&c.dupOk)||[]).indexOf(key) >= 0; }); }
  function OKにする(key, ids, 戻す){
    ids.forEach(function(id){
      var c = custs().find(function(x){ return x && x.id===id; }); if(!c) return;
      if(!Array.isArray(c.dupOk)) c.dupOk = [];
      var i = c.dupOk.indexOf(key);
      if(戻す){ if(i>=0) c.dupOk.splice(i,1); }
      else    { if(i<0)  c.dupOk.push(key); }
      c.updatedAt = Date.now();
    });
    if(w.PitDB) PitDB.save();
    if(w.pitOpLog) try{ pitOpLog(戻す?'ダブりの「OK」を取り消し':'ダブりを「これでOK」にした', key); }catch(e){}
  }

  /* =====================================================================
     探す（画面を持たない＝見張りから直接たたける・**中身は1文字も触らない**）
     ===================================================================== */
  function scan(){
    var 客 = 生きた客();
    var 車体 = {}, out = { 車体番号:[], ナンバーなし:[], 人:[] };

    客.forEach(function(c){
      var vs = 生きた車(c);
      /* ① 車体番号 */
      vs.forEach(function(v){
        var k = norm(v.vin); if(!k) return;
        (車体[k] = 車体[k] || []).push({ 客:c, 車:v });
      });
      /* ② 同じ人の中で「ナンバーなし」と「本物のナンバー」 */
      var なし = vs.filter(function(v){ return !realPlate(v.plate); });
      var 本物 = vs.filter(function(v){ return  realPlate(v.plate); });
      なし.forEach(function(a){
        本物.forEach(function(b){
          var 同車種 = norm(String(a.maker||'')+String(a.car||'')) === norm(String(b.maker||'')+String(b.car||''));
          var key1 = 合図('pl', [c.id, a.id, b.id]);
          out.ナンバーなし.push({ 客:c, なし:a, 本物:b, 同車種:同車種, 度:(同車種?'ほぼ黒':'疑わしい'),
                                  ids:[c.id], key:key1, ok:OK済み(key1, [c]) });
        });
      });
    });
    Object.keys(車体).forEach(function(k){
      var a = 車体[k];
      if(a.length < 2) return;
      var ids0 = []; a.forEach(function(x){ if(ids0.indexOf(x.客.id)<0) ids0.push(x.客.id); });
      var key0 = 合図('vin', [norm(a[0].車.vin)]);
      out.車体番号.push({ vin:t(a[0].車.vin), 件:a, 同じ人:a.every(function(x){ return x.客.id===a[0].客.id; }),
                          ids:ids0, key:key0, ok:OK済み(key0, a.map(function(x){ return x.客; })) });
    });
    /* ③ 人の候補＝同じ電話 or 同じカナ */
    var byTel = {}, byKana = {};
    客.forEach(function(c){
      (c.contacts||[]).forEach(function(ct){
        var k = norm(ct.tel); if(k.length<8) return;
        (byTel[k] = byTel[k] || []); if(byTel[k].indexOf(c)<0) byTel[k].push(c);
      });
      var kn = norm(c.kana); if(kn.length>=2){ (byKana[kn] = byKana[kn] || []).push(c); }
    });
    var 出した = {};
    Object.keys(byTel).forEach(function(k){
      var a = byTel[k]; if(a.length<2) return;
      var key2 = 合図('cu', a.map(function(c){ return c.id; }));
      out.人.push({ 理由:'同じ電話番号', 値:a[0].contacts.map(function(x){ return t(x.tel); }).filter(function(x){ return norm(x)===k; })[0]||k,
                    客:a, ids:a.map(function(c){ return c.id; }), key:key2, ok:OK済み(key2, a) });
      a.forEach(function(c){ 出した[c.id]=1; });
    });
    Object.keys(byKana).forEach(function(k){
      var a = byKana[k]; if(a.length<2) return;
      if(a.every(function(c){ return 出した[c.id]; })) return;   /* 電話で出したものは重ねない */
      var key3 = 合図('cu', a.map(function(c){ return c.id; }));
      out.人.push({ 理由:'同じカナ', 値:t(a[0].kana), 客:a, ids:a.map(function(c){ return c.id; }), key:key3, ok:OK済み(key3, a) });
    });
    /* 強い順・見やすい順にそろえる */
    out.ナンバーなし.sort(function(a,b){ return (b.同車種?1:0)-(a.同車種?1:0); });
    return out;
  }

  /* =====================================================================
     画面（読むだけ。直すのは「まとめる」窓）
     ===================================================================== */
  var _tab = 'vin';
  var _開 = '';        /* いま開いている行の目印 */

  /* 押した行の下に、顧客の中身をそのまま出す（まとめる窓と同じカード＝写しを作らない） */
  function _展開(ids, key, ok){
    if(!w.PitCustMerge || !PitCustMerge.カード) return '';
    var cs = ids.map(function(id){ return custs().find(function(c){ return c && c.id===id; }); }).filter(Boolean);
    if(!cs.length) return '';
    return '<div class="df-open"><div class="df-cards' + (cs.length>1?' two':'') + '">'
         + cs.map(function(c){ return PitCustMerge.カード(c); }).join('') + '</div>'
         + '<div class="df-okrow">'
         + (ok
             ? '<span class="df-okmsg">✅ 「これでOK」にしてあります（一覧には出ません）</span>'
               + '<button class="df-ok back" onclick="PitDupFind.ok(\'' + esc(key) + '\',\'' + esc(ids.join(',')) + '\',1)">やっぱり出す</button>'
             : '<span class="df-okmsg">見た結果、ダブりではない／このままでよい時は右のボタンを押してください。<b>次からこの組は出ません。</b>あとから戻せます。</span>'
               + '<button class="df-ok" onclick="PitDupFind.ok(\'' + esc(key) + '\',\'' + esc(ids.join(',')) + '\',0)">これでOK（もう出さない）</button>')
         + '</div></div>';
  }
  function _行(key, tag, 見出し, 中身, ボタン, ids, key2, ok){
    var 開 = (_開 === key);
    return '<div class="df-item' + (開?' open':'') + (ok?' okd':'') + '">'
      + '<div class="df-row" onclick="PitDupFind.toggle(\'' + esc(key) + '\')" title="押すと中身を見られます">'
      + '<div class="df-main"><div class="df-t">' + tag + 見出し + '</div><div class="df-sub">' + 中身 + '</div></div>'
      + '<span class="df-chev">' + (開?'▲':'▼') + '</span>' + ボタン + '</div>'
      + (開 ? _展開(ids, key2, ok) : '') + '</div>';
  }
  function _rowsHtml(R){
    var h = '';
    /* ✅ 「OKにしたもの」＝3種類をまとめて出す（ここから戻せる） */
    if(_tab === 'ok'){
      var 全 = R.車体番号.concat(R.ナンバーなし, R.人).filter(function(x){ return x.ok; });
      if(!全.length) return '<div class="df-none">「これでOK」にしたものはまだありません。</div>';
      R.車体番号.forEach(function(x, i){
        if(!x.ok) return;
        h += _行('vin'+i, '<span class="df-tag ng">100%ダブり</span>', '車体番号 <b>' + esc(x.vin) + '</b>',
          x.件.map(function(k){ return esc(disp(k.客)) + ' 様　' + esc(plateOf(k.車)) + '（' + esc(vehName(k.車)) + '）'; }).join('　／　'),
          '', x.ids, x.key, true);
      });
      R.ナンバーなし.forEach(function(x, i){
        if(!x.ok) return;
        h += _行('pl'+i, '<span class="df-tag' + (x.同車種?' warn':'') + '">' + esc(x.度) + '</span>', esc(disp(x.客)) + ' 様',
          'ナンバーなし（' + esc(vehName(x.なし)) + '）　と　' + esc(plateOf(x.本物)) + '（' + esc(vehName(x.本物)) + '）',
          '', [x.客.id], x.key, true);
      });
      R.人.forEach(function(x, i){
        if(!x.ok) return;
        h += _行('cu'+i, '<span class="df-tag">' + esc(x.理由) + '</span>', '<b>' + esc(x.値) + '</b>',
          x.客.map(function(c){ return esc(disp(c)) + ' 様（車 ' + 生きた車(c).length + '台）'; }).join('　／　'),
          '', x.ids, x.key, true);
      });
      return h;
    }
    if(_tab === 'vin'){
      if(!R.車体番号.length) return '<div class="df-none">同じ車体番号の車はありません。<br><span>車体番号は伝票の突合（クォーターチェック）で入ります。入っている車が少ないうちは、ここも少なく出ます。</span></div>';
      R.車体番号.forEach(function(x, i){
        if(!!x.ok !== (_tab==='ok')) return;
        var ids = x.ids;
        h += _行('vin'+i, '<span class="df-tag ng">100%ダブり</span>', '車体番号 <b>' + esc(x.vin) + '</b>',
          x.件.map(function(k){ return esc(disp(k.客)) + ' 様　' + esc(plateOf(k.車)) + '（' + esc(vehName(k.車)) + '）'; }).join('　／　'),
          (x.同じ人
            ? '<button class="df-go" onclick="event.stopPropagation();PitDupFind.toVeh(\'' + esc(ids[0]) + '\')">車をまとめる</button>'
            : '<button class="df-go" onclick="event.stopPropagation();PitDupFind.toCust(\'' + esc(ids[0]) + '\',\'' + esc(ids[1]) + '\')">お客様をまとめる</button>'),
          ids, x.key, x.ok);
      });
      return h;
    }
    if(_tab === 'plate'){
      if(!R.ナンバーなし.length) return '<div class="df-none">「ナンバーなし」と本物のナンバーを両方持っているお客様はいません。</div>';
      R.ナンバーなし.forEach(function(x, i){
        if(!!x.ok !== (_tab==='ok')) return;
        h += _行('pl'+i, '<span class="df-tag' + (x.同車種?' warn':'') + '">' + esc(x.度) + '</span>', esc(disp(x.客)) + ' 様',
          'ナンバーなし（' + esc(vehName(x.なし)) + '）　と　' + esc(plateOf(x.本物)) + '（' + esc(vehName(x.本物)) + '）'
            + (x.同車種?'　＝ <b>車種まで同じ</b>':''),
          '<button class="df-go" onclick="event.stopPropagation();PitDupFind.toVeh(\'' + esc(x.客.id) + '\')">車をまとめる</button>',
          [x.客.id], x.key, x.ok);
      });
      return h;
    }
    if(!R.人.length) return '<div class="df-none">同じ電話番号・同じカナのお客様はいません。</div>';
    R.人.forEach(function(x, i){
      if(!!x.ok !== (_tab==='ok')) return;
      h += _行('cu'+i, '<span class="df-tag">' + esc(x.理由) + '</span>', '<b>' + esc(x.値) + '</b>',
        x.客.map(function(c){ return esc(disp(c)) + ' 様（車 ' + 生きた車(c).length + '台）'; }).join('　／　'),
        '<button class="df-go" onclick="event.stopPropagation();PitDupFind.toCust(\'' + esc(x.客[0].id) + '\',\'' + esc(x.客[1].id) + '\')">お客様をまとめる</button>',
        x.ids, x.key, x.ok);
    });
    return h;
  }

  function open(tab){
    if(tab) _tab = tab;
    var R = scan();
    var 生 = function(a){ return a.filter(function(x){ return !x.ok; }).length; };
    var 数 = { vin:生(R.車体番号), plate:生(R.ナンバーなし), cust:生(R.人),
               ok:R.車体番号.concat(R.ナンバーなし, R.人).filter(function(x){ return x.ok; }).length };
    var h = '<div class="cm-head"><i data-ic=search data-ics=16></i> ダブりを洗い出す'
          + '<span class="cm-sub">読むだけ。直すのは「まとめる」窓で</span>'
          + '<button class="cm-x" onclick="custCloseModal()"><i data-ic=close data-ics=16></i></button></div>';
    h += '<div class="cm-body">';
    h += '<div class="df-tabs">'
       + '<button class="df-tab' + (_tab==='vin'?' on':'') + '" onclick="PitDupFind.tab(\'vin\')">同じ車体番号 <b>' + 数.vin + '</b></button>'
       + '<button class="df-tab' + (_tab==='plate'?' on':'') + '" onclick="PitDupFind.tab(\'plate\')">ナンバーなしと重なり <b>' + 数.plate + '</b></button>'
       + '<button class="df-tab' + (_tab==='cust'?' on':'') + '" onclick="PitDupFind.tab(\'cust\')">同じ電話・同じカナ <b>' + 数.cust + '</b></button>'
       + '<button class="df-tab ok' + (_tab==='ok'?' on':'') + '" onclick="PitDupFind.tab(\'ok\')">✅ OKにしたもの <b>' + 数.ok + '</b></button>'
       + '</div>';
    h += '<div class="vm-note">'
       + (_tab==='vin' ? '<b>車体番号は一生変わらない番号</b>です。それが同じ車が2台ある＝<b>まちがいなくダブり</b>。ここは迷わず片づけて大丈夫です。'
       : (_tab==='plate' ? '「ナンバーなし」で作られた車が残っています。<b>車種まで同じならほぼ黒</b>。ただし<b>本当に増車</b>のこともあるので、中身を見てから。'
       : (_tab==='cust' ? '<b>同じ電話番号・同じカナ</b>のお客様です。<b>ご家族・同姓同名は別の方</b>なので、中身を見てから決めてください。'
       : '一度見て「<b>これでOK</b>」にしたものです。ふだんの一覧には出ません。<b>やっぱり出す</b>を押せば戻ります。')))
       + '</div>';
    h += '<div class="df-list">' + _rowsHtml(R) + '</div>';
    /* 🙅 外している人がいることは、黙らずに書いておく */
    var 外し = custs().filter(function(c){ return c && 外す(c); });
    if(外し.length) h += '<div class="df-skip">🙅 洗い出しから外しているお客様：<b>'
      + 外し.map(function(c){ return esc(disp(c)); }).join('／') + '</b>　（レンタカー等で、この姿が本当の状態のため。まとめる窓からは今までどおり触れます）</div>';
    h += '</div><div class="cm-foot"><button class="cm-cancel" onclick="custCloseModal()">閉じる</button></div>';
    if(w.custShowModal) custShowModal(h, 'vm-box df-box');
  }

  w.PitDupFind = {
    open: open, scan: scan, 外す: 外す,
    tab:    function(v){ _tab = v; _開 = ''; open(); },
    /* ✅ これでOK／やっぱり出す（印を付けるだけ。中身は触らない） */
    ok:     function(key, ids, 戻す){
      OKにする(key, String(ids||'').split(',').filter(Boolean), !!Number(戻す));
      if(w.pitToast) pitToast(Number(戻す)?'一覧に戻しました':'次からは出しません');
      _開 = ''; open();
    },
    toggle: function(k){ _開 = (_開===k?'':k); open(); },
    toVeh:  function(custId){ if(w.PitVehMerge) PitVehMerge.open(custId); },
    toCust: function(a, b){ if(w.PitCustMerge) PitCustMerge.open(a, b); }
  };
})(window, document);

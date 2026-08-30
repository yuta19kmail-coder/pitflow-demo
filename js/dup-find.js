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

  function 生きた客(){
    return custs().filter(function(c){
      if(!c) return false;
      if(w.pitCustMerged && pitCustMerged(c)) return false;
      if(w.PitArchive && PitArchive.custArchived && PitArchive.custArchived(c)) return false;
      return true;
    });
  }
  function 生きた車(c){
    return ((c&&c.vehicles)||[]).filter(function(v){
      if(!v || v.perVisit || v.mergedInto) return false;
      return !(w.PitArchive ? PitArchive.vehSelfArchived(v) : v.archived);
    });
  }

  /* =====================================================================
     探す（画面を持たない＝見張りから直接たたける・**1文字も書かない**）
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
          out.ナンバーなし.push({ 客:c, なし:a, 本物:b, 同車種:同車種, 度:(同車種?'ほぼ黒':'疑わしい') });
        });
      });
    });
    Object.keys(車体).forEach(function(k){
      var a = 車体[k];
      if(a.length < 2) return;
      out.車体番号.push({ vin:t(a[0].車.vin), 件:a, 同じ人:a.every(function(x){ return x.客.id===a[0].客.id; }) });
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
      out.人.push({ 理由:'同じ電話番号', 値:a[0].contacts.map(function(x){ return t(x.tel); }).filter(function(x){ return norm(x)===k; })[0]||k, 客:a });
      a.forEach(function(c){ 出した[c.id]=1; });
    });
    Object.keys(byKana).forEach(function(k){
      var a = byKana[k]; if(a.length<2) return;
      if(a.every(function(c){ return 出した[c.id]; })) return;   /* 電話で出したものは重ねない */
      out.人.push({ 理由:'同じカナ', 値:t(a[0].kana), 客:a });
    });
    /* 強い順・見やすい順にそろえる */
    out.ナンバーなし.sort(function(a,b){ return (b.同車種?1:0)-(a.同車種?1:0); });
    return out;
  }

  /* =====================================================================
     画面（読むだけ。直すのは「まとめる」窓）
     ===================================================================== */
  var _tab = 'vin';

  function _rowsHtml(R){
    var h = '';
    if(_tab === 'vin'){
      if(!R.車体番号.length) return '<div class="df-none">同じ車体番号の車はありません。<br><span>車体番号は伝票の突合（クォーターチェック）で入ります。入っている車が少ないうちは、ここも少なく出ます。</span></div>';
      R.車体番号.slice(0,50).forEach(function(x){
        h += '<div class="df-row"><div class="df-main"><div class="df-t"><span class="df-tag ng">100%ダブり</span>車体番号 <b>' + esc(x.vin) + '</b></div>'
           + '<div class="df-sub">' + x.件.map(function(i){
               return esc(disp(i.客)) + ' 様　' + esc(plateOf(i.車)) + '（' + esc(vehName(i.車)) + '）';
             }).join('　／　') + '</div></div>'
           + (x.同じ人
               ? '<button class="df-go" onclick="PitDupFind.toVeh(\'' + esc(x.件[0].客.id) + '\')">車をまとめる</button>'
               : '<button class="df-go" onclick="PitDupFind.toCust(\'' + esc(x.件[0].客.id) + '\',\'' + esc(x.件[1].客.id) + '\')">お客様をまとめる</button>')
           + '</div>';
      });
      return h;
    }
    if(_tab === 'plate'){
      if(!R.ナンバーなし.length) return '<div class="df-none">「ナンバーなし」と本物のナンバーを両方持っているお客様はいません。</div>';
      R.ナンバーなし.slice(0,50).forEach(function(x){
        h += '<div class="df-row"><div class="df-main"><div class="df-t">'
           + '<span class="df-tag' + (x.同車種?' warn':'') + '">' + esc(x.度) + '</span>' + esc(disp(x.客)) + ' 様</div>'
           + '<div class="df-sub">ナンバーなし（' + esc(vehName(x.なし)) + '）　と　' + esc(plateOf(x.本物)) + '（' + esc(vehName(x.本物)) + '）'
           + (x.同車種?'　＝ <b>車種まで同じ</b>':'') + '</div></div>'
           + '<button class="df-go" onclick="PitDupFind.toVeh(\'' + esc(x.客.id) + '\')">車をまとめる</button></div>';
      });
      return h;
    }
    if(!R.人.length) return '<div class="df-none">同じ電話番号・同じカナのお客様はいません。</div>';
    R.人.slice(0,50).forEach(function(x){
      h += '<div class="df-row"><div class="df-main"><div class="df-t"><span class="df-tag">' + esc(x.理由) + '</span><b>' + esc(x.値) + '</b></div>'
         + '<div class="df-sub">' + x.客.map(function(c){
             return esc(disp(c)) + ' 様（車 ' + 生きた車(c).length + '台）';
           }).join('　／　') + '</div></div>'
         + '<button class="df-go" onclick="PitDupFind.toCust(\'' + esc(x.客[0].id) + '\',\'' + esc(x.客[1].id) + '\')">お客様をまとめる</button></div>';
    });
    return h;
  }

  function open(tab){
    if(tab) _tab = tab;
    var R = scan();
    var 数 = { vin:R.車体番号.length, plate:R.ナンバーなし.length, cust:R.人.length };
    var h = '<div class="cm-head"><i data-ic=search data-ics=16></i> ダブりを洗い出す'
          + '<span class="cm-sub">読むだけ。直すのは「まとめる」窓で</span>'
          + '<button class="cm-x" onclick="custCloseModal()"><i data-ic=close data-ics=16></i></button></div>';
    h += '<div class="cm-body">';
    h += '<div class="df-tabs">'
       + '<button class="df-tab' + (_tab==='vin'?' on':'') + '" onclick="PitDupFind.tab(\'vin\')">同じ車体番号 <b>' + 数.vin + '</b></button>'
       + '<button class="df-tab' + (_tab==='plate'?' on':'') + '" onclick="PitDupFind.tab(\'plate\')">ナンバーなしと重なり <b>' + 数.plate + '</b></button>'
       + '<button class="df-tab' + (_tab==='cust'?' on':'') + '" onclick="PitDupFind.tab(\'cust\')">同じ電話・同じカナ <b>' + 数.cust + '</b></button>'
       + '</div>';
    h += '<div class="vm-note">'
       + (_tab==='vin' ? '<b>車体番号は一生変わらない番号</b>です。それが同じ車が2台ある＝<b>まちがいなくダブり</b>。ここは迷わず片づけて大丈夫です。'
       : (_tab==='plate' ? '「ナンバーなし」で作られた車が残っています。<b>車種まで同じならほぼ黒</b>。ただし<b>本当に増車</b>のこともあるので、中身を見てから。'
       : '<b>同じ電話番号・同じカナ</b>のお客様です。<b>ご家族・同姓同名は別の方</b>なので、中身を見てから決めてください。'))
       + '</div>';
    h += '<div class="df-list">' + _rowsHtml(R) + '</div>';
    h += '</div><div class="cm-foot"><button class="cm-cancel" onclick="custCloseModal()">閉じる</button></div>';
    if(w.custShowModal) custShowModal(h, 'vm-box df-box');
  }

  w.PitDupFind = {
    open: open, scan: scan,
    tab:    function(v){ _tab = v; open(); },
    toVeh:  function(custId){ if(w.PitVehMerge) PitVehMerge.open(custId); },
    toCust: function(a, b){ if(w.PitCustMerge) PitCustMerge.open(a, b); }
  };
})(window, document);

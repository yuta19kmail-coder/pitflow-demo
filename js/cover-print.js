/* ========================================
   cover-print.js  -  カルテ「表紙」印刷（v0.113.0・トークン差し込み方式）
   ----------------------------------------
   ◎背景（ゆうた）：紙の顧客カルテ一式をクリアファイルで運用。予約確定で「表紙」を印刷、返車でバラす。
   ◎方針（2026-07-17 転換）：ゆうたが作った実様式SVG `images/様式_お客様情報.svg`（A4横・{{token}}入り）を
     そのまま下地にして、カードの値を {{token}} 文字列置換で流し込む。元様式に完全一致。
     ・A4横 1枚＝左:表紙（お客様情報データ）／中央:各ボックス／右:罫線メモ／中央に折り線。
     ・作業タイプの「バッジ」と「早割スタンプ」は SVGには枠を作らず “コード側” で重ねる：
        - バッジ＝車種名の下の空きに、総数で自動サイズ＋自動折り返し（黒角丸・白太字）。
        - 早割スタンプ＝images/早期割スタンプ.svg を earlyDiscount の時だけ重ねる（位置は STAMP 定数で調整可）。
   公開：window.pitPrintCover(cardId) / window.pitBuildCoverDoc(card, {formUri,stampUri,noPrint})
   ======================================== */
(function () {
  'use strict';

  /* ---- テンプレSVGファイル名（ゆうたの最終版が来たらここだけ差し替え） ---- */
  var ASSET_V   = '5';   // 様式SVGを差し替えたら上げる（キャッシュ更新）
  var FORM_SVG  = 'images/様式_お客様情報.svg?v=' + ASSET_V;
  var STAMP_SVG = 'images/早期割スタンプ.svg?v=' + ASSET_V;

  /* ---- 作業バッジ（SVG userspace）＝フルサイズ→入りきらなければ縮小→下限で2段目に折り返し ---- */
  var BADGE = { x0: 19.2, x1: 244.2, yTop: 99.2, gap: 8, lineGap: 7, full: 21.8, min: 16 };
  /* ---- 🔴 v1.40.0（ゆうた指定）代車ありの時、「代車管理費」の四角にチェックを入れて印刷する ----
     ⚠ 様式SVGの中の**7.82×7.82 の小さい四角**（x271.82 y235.66・代車ブロックの中）がその欄。
        文字はアウトライン化されていて探せないので、**座標で決め打ち**している。
        様式SVGを差し替えたら、この座標も見直すこと。
     ⚠ 金額（¥2,200 税込）は様式に印刷済み＝こちらは**チェックだけ**重ねる。 */
  var LOANER_FEE_BOX = { x: 271.82, y: 235.66, w: 7.82 };

  /* ---- 早割スタンプの位置＆大きさ（userspace／モック調整反映 2026-07-17） ---- */
  var STAMP = { x: 34.1, y: 170.8, w: 78 };   // 高さはアスペクト比(720:370)から自動
  /* ---- 名前・車種：中央そろえ＋はみ出したら自動縮小（userspace） ----
     範囲＝左 x12.3 〜 「様」手前 x286（「様」はアウトラインで x292〜301）。名前と車種で中央軸を揃える。 */
  var NAME_C = { cx: 150, maxW: 272, fs: 25 };
  var VEH_C  = { cx: 150, maxW: 272, makerFs: 14, carFs: 20, gap: 10 };
  /* ---- ナンバー（地名小＋番号大）をナンバーボックス中央にまとめて配置 ---- */
  var NUM_C  = { cx: 334.8, maxW: 150, gap: 6 };
  /* ---- 左の記入罫線（この上に カルテNo→連絡先→LINE→空行→予約内容 を自動記載） ---- */
  var LEFT_LINES = [164.3,189.8,215.3,240.7,266.2,291.6,317.1,342.5,367.9,393.4,418.8,444.3,469.7,495.1,520.6];
  /* ---- 左の罫線メモ（依頼の中身）----
     🔴 v1.32.0（ゆうた指定）文字を少し小さく（13→11.5）＋**幅からはみ出す行は自動で折り返す**。
     ⚠ 罫線の実寸＝様式SVGの線が x12.37〜240.4。書き始め 28 なので使える幅は約 212。
        右端ぎりぎりだと詰まって見えるので **208** で折り返す。
     ⚠ 折り返した2行目以降は少し右に下げる（MEMO_IND）＝どこからが続きか分かるように。 */
  var MEMO_X = 28, MEMO_FS = 11.5;   // 書き始めを全角スペース1個ぶん右へ
  var MEMO_W = 208, MEMO_IND = 10;   // 折り返す幅／続き行の下げ幅
  /* ---- フロント／予約担当：セルからはみ出す長い苗字はフォント縮小（中央そろえ維持） ---- */
  var FIT_BOX = { 'pcv-front': 48, 'pcv-resStaff': 48, 'pcv-time': 88 };

  /* ================= ヘルパー ================= */
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  var DOW = ['日','月','火','水','木','金','土'];
  function parseISO(s){ if(!s) return null; var p=String(s).split('-'); if(p.length<3) return null; var d=new Date(+p[0],+p[1]-1,+p[2]); return isNaN(d)?null:d; }
  function moN(s){ var d=parseISO(s); return d?(d.getMonth()+1):''; }
  function dayN(s){ var d=parseISO(s); return d?d.getDate():''; }
  function md(s){ var d=parseISO(s); return d?((d.getMonth()+1)+'/'+d.getDate()):''; }
  function dows(s){ var d=parseISO(s); return d?DOW[d.getDay()]:''; }
  function master(arr, id){ var m=(arr||[]).find(function(x){return x.id===id;}); return m?m.label:''; }
  /* 🔴 v1.26.0（ゆうた指定）表紙は通し番号を出さず、**素直に車種名**（アクア など）を書く。
     アプリの画面側は今までどおり「代車5」等の呼び名のまま＝ここは表紙だけの決めごと。
     ⚠ 車種が登録されていない代車だけ、呼び名（代車5）で代替する＝空にすると何を貸したか分からなくなるため。 */
  function loanerName(id){
    var l=((window.state&&state.loaners)||[]).find(function(x){return x.id===id;});
    if (!l) return '';
    return String(l.model==null?'':l.model).trim() || String(l.name==null?'':l.name).trim();
  }

  var DROP_FULL = { wait:'待ち', sameDay:'当日返し', drop:'預かり' };
  function courseLabel(c){
    if (c.division==='div2' || c.boardId==='import') return '2課';
    if (c.division==='div1' || c.boardId) return '1課';
    return '';
  }
  function repeatLabel(c){ return c.repeat==='repeater' ? 'リピーター' : '初回'; }

  function workTypeIds(c){
    return (Array.isArray(c.workTypes)&&c.workTypes.length) ? c.workTypes : (c.workType?[c.workType]:[]);
  }
  function isShaken(c){ return workTypeIds(c).indexOf('shaken')>=0; }
  /* 作業バッジ（該当の作業タイプ＋見積相談。早期割はバッジに含めない＝別スタンプ） */
  function workBadges(c){
    var labels = workTypeIds(c).map(function(id){ return master((window.state&&state.workTypes)||[], id); }).filter(Boolean);
    if (c.consult) labels.push('見積相談');
    return labels;
  }
  /* 特殊バッジ（保証/保険）＝印刷にも出す。既存バッジと同じ扱いだが、色は反転＝黒字・黒枠のアウトライン（v0.116.0） */
  function specialBadges(c){
    var ids = Array.isArray(c.workSpecials) ? c.workSpecials : [];
    return ids.map(function(id){ return (window.pitSpecialLabel ? pitSpecialLabel(id) : ''); }).filter(Boolean);
  }
  /* バッジは全部「車検バッジと同じ大きさ」で固定（scale 0.64 と合わせて実効 ≒21.8px）。
     入りきらなければレイアウト側で2段目に自動折り返し。 */
  function badgeFs(n){ return 34; }

  /* ナンバー分割：最後の塊＝数字(plateB)、残り＝地名+分類+かな(plateA)。
     plateB が3桁以上の数字なら末尾2桁の前にハイフン（1234→12-34 / 123→1-23）。 */
  function plateNum(b){
    b = String(b||'');
    return /^\d{3,}$/.test(b) ? (b.slice(0,-2) + '-' + b.slice(-2)) : b;
  }
  function splitPlate(plate){
    var toks = String(plate||'').trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return { a:'', b:'' };
    var b = toks.pop();
    return { a: toks.join(' '), b: plateNum(b) };
  }
  /* メーカー表示の省略（メルセデス・ベンツ → ベンツ） */
  function makerDisp(mk){
    mk = String(mk||'');
    if (/メルセデス|ベンツ|Mercedes/i.test(mk)) return 'ベンツ';
    return mk;
  }
  function loanerVal(c){
    if (!c.needLoaner) return '無';
    var name = loanerName(c.loanerId);
    return '有' + (name ? '（'+name+'）' : '');
  }
  function loanerSpanVal(c){
    if (!c.needLoaner) return '';
    return (c.loanerFrom||c.loanerTo) ? ((md(c.loanerFrom)||'')+' 〜 '+(md(c.loanerTo)||'')) : '';
  }
  function loanerCondVal(c){
    if (!c.needLoaner) return '';
    var conds = (Array.isArray(c.loanerConditions)?c.loanerConditions:[]).map(function(id){ return master((window.state&&state.loanerConditions)||[], id); }).filter(Boolean);
    var other = (c.loanerOther||'').trim();
    if (other) conds.push(other);
    return conds.join('・');
  }
  function feeVal(c){
    if (!c.feeAmount) return '';
    var n = Number(c.feeAmount);
    return isNaN(n) ? '' : n.toLocaleString();
  }
  /* その他連絡先（代表以外で番号あり）／Lステップ番号の抽出 */
  function extraTels(c){
    var cs = Array.isArray(c.contacts) ? c.contacts : [];
    return cs.filter(function(x){ return !x.primary && (x.tel||'').trim(); })
             .map(function(x){ return { label:(x.label||'').trim(), tel:(x.tel||'').trim() }; });
  }
  function lstepNo(raw){ raw=String(raw==null?'':raw).trim(); var m=raw.match(/member=(\d+)/); if(m) return m[1]; if(/^\d+$/.test(raw)) return raw; return raw; }
  /* 罫線メモの中身：カルテNo → その他連絡先 → LINE → （空行）→ 予約内容(menu) */
  function memoRows(c){
    var rows = [];
    if ((c.karteNo||'').toString().trim()) rows.push('カルテNo：'+c.karteNo);
    extraTels(c).forEach(function(t){ rows.push('TEL '+(t.label?t.label+' ':'')+t.tel); });
    if ((c.lineStatus||'')==='ok' && (c.lstepId||'').toString().trim()) rows.push('LINE：'+lstepNo(c.lstepId));
    var body = String(c.menu||'').split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);
    if (rows.length && body.length) rows.push(null);   // 連絡先ブロックと予約内容の間を1行空ける
    body.forEach(function(m){ rows.push(m); });
    return rows;
  }

  /* ================= トークン → 値 ================= */
  function tokenMap(c){
    var pl = splitPlate(c.plate);
    return {
      name:       (window.pitCustName ? pitCustName(c) : c.customer) || '',   /* v1.25.0 漢字が空ならカナをお名前欄に */
      maker:      makerDisp(c.maker),
      car:        c.car || '',
      m:          moN(c.reserveDate),
      d:          dayN(c.reserveDate),
      dow:        dows(c.reserveDate),
      time:       c.reserveTime || '',
      tel:        c.tel || '',
      plateA:     pl.a,
      plateB:     pl.b,
      repeat:     repeatLabel(c),
      drop:       DROP_FULL[c.dropType] || '',
      loaner:     loanerVal(c),
      loanerSpan: loanerSpanVal(c),
      loanerCond: loanerCondVal(c),
      fee:        feeVal(c),
      course:     courseLabel(c),
      /* 🔴 v1.31.0 担当は**苗字だけ**（CoreMembers の呼び名／姓があればそちら優先）＝ state.js の共通関数 */
      front:      (window.pitStaffPrintName ? pitStaffPrintName(c.frontStaff) : (c.frontStaff || '')),
      resStaff:   (window.pitStaffPrintName ? pitStaffPrintName(c.reserveStaff) : (c.reserveStaff || '')),
      bm:         moN(c.bookedAt),
      bd:         dayN(c.bookedAt),
      bdow:       dows(c.bookedAt)
    };
  }

  /* 全体のフォントを Yu Gothic 系に固定（テンプレでフォント未指定＝継承の英数字が
     ブラウザ既定の明朝にフォールバックして今までと違って見えるのを防ぐ。
     クラスで明示指定された文字はそのまま＝Yu Gothic 系で統一） */
  var FONT_STACK = "'Yu Gothic','YuGothic','Hiragino Kaku Gothic ProN','Meiryo',sans-serif";
  function ensureFont(svg){
    return svg.replace(/<svg\b([^>]*)>/, function(m, attrs){
      if (/style\s*=/.test(attrs)){
        return '<svg'+attrs.replace(/style\s*=\s*"([^"]*)"/, function(_,v){ return 'style="font-family:'+FONT_STACK+';'+v+'"'; })+'>';
      }
      return '<svg'+attrs+' style="font-family:'+FONT_STACK+'">';
    });
  }

  /* {{token}} を値で置換（XMLエスケープ） */
  function fillTokens(svg, map){
    return svg.replace(/\{\{([a-zA-Z]+)\}\}/g, function(_, k){
      return esc(map.hasOwnProperty(k) ? map[k] : '');
    });
  }

  /* お客様名・メーカー・車種の <text> に id を付与（センタリング＋自動縮小用・置換前に実施） */
  function tagCenterEls(rawSvg){
    var s = rawSvg;
    s = s.replace(/<text\b((?:(?!<\/text>)[\s\S])*?\{\{name\}\})/,  function(m,rest){ return '<text id="pcv-name"'+rest; });
    s = s.replace(/<text\b((?:(?!<\/text>)[\s\S])*?\{\{maker\}\})/, function(m,rest){ return '<text id="pcv-maker"'+rest; });
    s = s.replace(/<text\b((?:(?!<\/text>)[\s\S])*?\{\{car\}\})/,   function(m,rest){ return '<text id="pcv-car"'+rest; });
    s = s.replace(/<text\b((?:(?!<\/text>)[\s\S])*?\{\{plateA\}\})/,function(m,rest){ return '<text id="pcv-plateA"'+rest; });
    s = s.replace(/<text\b((?:(?!<\/text>)[\s\S])*?\{\{plateB\}\})/,function(m,rest){ return '<text id="pcv-plateB"'+rest; });
    s = s.replace(/<text\b((?:(?!<\/text>)[\s\S])*?\{\{front\}\})/,  function(m,rest){ return '<text id="pcv-front"'+rest; });
    s = s.replace(/<text\b((?:(?!<\/text>)[\s\S])*?\{\{resStaff\}\})/,function(m,rest){ return '<text id="pcv-resStaff"'+rest; });
    /* 🔴 v1.33.0 時間欄は「10:00」だけでなく「朝一」「決まり次第」などの**文字がそのまま入る**。
       入庫日ボックス（x316.6〜414.0）からはみ出さないよう、入り切らない時だけ字を小さくする。 */
    s = s.replace(/<text\b((?:(?!<\/text>)[\s\S])*?\{\{time\}\})/,  function(m,rest){ return '<text id="pcv-time"'+rest; });
    return s;
  }

  /* バッジ用プレースホルダ <g> を </svg> 直前に注入（実配置は印刷doc内のスクリプトが実施） */
  function injectBadgePlaceholder(svg, badges){
    if (!badges.length) return svg;
    var g = '<g id="pcv-badges" data-full="'+BADGE.full+'" data-min="'+BADGE.min+'" '
          + 'data-x0="'+BADGE.x0+'" data-x1="'+BADGE.x1+'" data-ytop="'+BADGE.yTop+'" '
          + 'data-gap="'+BADGE.gap+'" data-linegap="'+BADGE.lineGap+'" '
          + 'data-labels="'+esc(JSON.stringify(badges))+'"></g>';
    return svg.replace(/<\/svg>\s*$/, g+'</svg>');
  }

  /* 罫線メモ用プレースホルダ <g>（実配置は印刷doc内スクリプト＝バッジの下から書き始め） */
  function injectMemoPlaceholder(svg, c){
    var rows = memoRows(c);
    if (!rows.length) return svg;
    var g = '<g id="pcv-memo" data-x="'+MEMO_X+'" data-fs="'+MEMO_FS+'" '
          + 'data-w="'+MEMO_W+'" data-ind="'+MEMO_IND+'" '
          + 'data-rows="'+esc(JSON.stringify(rows))+'" data-lines="'+esc(JSON.stringify(LEFT_LINES))+'"></g>';
    return svg.replace(/<\/svg>\s*$/, g+'</svg>');
  }

  /* v1.40.0 代車管理費のチェック（レ点）を注入。代車ありの時だけ。 */
  function injectLoanerFeeCheck(svg, c){
    if (!c || !c.needLoaner) return svg;
    var b = LOANER_FEE_BOX, x = b.x, y = b.y, w = b.w;
    var dpath = 'M' + (x + w * 0.18) + ' ' + (y + w * 0.52)
              + ' L' + (x + w * 0.42) + ' ' + (y + w * 0.78)
              + ' L' + (x + w * 0.86) + ' ' + (y + w * 0.16);
    return svg.replace(/<\/svg>\s*$/,
      '<path id="pcv-loanerfee" d="' + dpath + '" fill="none" stroke="#111" stroke-width="1.4" '
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>');
  }

  /* 早割スタンプ <image> を </svg> 直前に注入 */
  function injectStamp(svg, stampUri){
    if (!stampUri) return svg;
    var h = STAMP.w * (370/720);   // 早期割スタンプ.svg の viewBox=720x370
    var img = '<image id="pcv-stamp" href="'+stampUri+'" xlink:href="'+stampUri+'" '
            + 'x="'+STAMP.x+'" y="'+STAMP.y+'" width="'+STAMP.w+'" height="'+h.toFixed(1)+'" '
            + 'preserveAspectRatio="xMidYMid meet"/>';
    return svg.replace(/<\/svg>\s*$/, img+'</svg>');
  }

  /* ================= 印刷HTMLの組み立て ================= */
  var CSS = ''
    + '@page{ size:A4 landscape; margin:0; }'
    + '*{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }'
    + 'html,body{ margin:0; padding:0; background:#fff; }'
    + '.pcv-sheet{ position:relative; width:297mm; height:210mm; background:#fff; overflow:hidden; }'
    + '.pcv-sheet svg{ display:block; width:297mm; height:210mm; }'
    + '@media screen{ body{ background:#5a5f66; padding:16px; } .pcv-sheet{ box-shadow:0 8px 34px rgba(0,0,0,.5); margin:0 auto; } }'
    + '@media print{ html,body{ background:#fff !important; padding:0 !important; } .pcv-sheet{ box-shadow:none !important; margin:0 !important; } }';

  /* onload：①名前/車種の自動縮小 ②バッジ自動配置 ③印刷 */
  function layoutScript(noPrint){
    return '(function(){'
      + 'var NS="http://www.w3.org/2000/svg";'
      + 'function ty(el){var m=(el.getAttribute("transform")||"").match(/translate\\(\\s*[-\\d.]+[ ,]+([-\\d.]+)/);return m?parseFloat(m[1]):0;}'
      + 'function centerName(cx,maxW,fs){var el=document.getElementById("pcv-name");if(!el||!el.getComputedTextLength)return;'
        + 'el.setAttribute("text-anchor","middle");el.style.fontSize=fs+"px";'
        + 'if(el.querySelectorAll)el.querySelectorAll("tspan").forEach(function(sp){sp.style.fontSize="";});'
        + 'el.setAttribute("transform","translate("+cx+" "+ty(el)+")");'
        + 'var f=fs,g=0;while(el.getComputedTextLength()>maxW&&f>7&&g<160){f-=0.5;el.style.fontSize=f+"px";g++;}}'
      + 'function centerVeh(cx,maxW,mkFs,crFs,gap){var mk=document.getElementById("pcv-maker"),cr=document.getElementById("pcv-car");'
        + 'if(!cr||!cr.getComputedTextLength)return;var mkY=mk?ty(mk):0,crY=ty(cr);'
        + 'if(mk){mk.setAttribute("text-anchor","start");mk.style.fontSize=mkFs+"px";}cr.setAttribute("text-anchor","start");cr.style.fontSize=crFs+"px";'
        + 'function mw(){return mk?mk.getComputedTextLength():0;}function cw(){return cr.getComputedTextLength();}'
        + 'function g2(){return mw()>0?gap:0;}function tot(){return mw()+g2()+cw();}'
        + 'var t=tot();if(t>maxW&&t>0){var sc=maxW/t;if(mk)mk.style.fontSize=(mkFs*sc)+"px";cr.style.fontSize=(crFs*sc)+"px";t=tot();}'
        + 'var sx=cx-t/2;if(mk)mk.setAttribute("transform","translate("+sx+" "+mkY+")");'
        + 'cr.setAttribute("transform","translate("+(sx+mw()+g2())+" "+crY+")");}'
      + 'function fitBox(id,maxW){var el=document.getElementById(id);if(!el||!el.getComputedTextLength)return;'
        + 'var f=parseFloat(getComputedStyle(el).fontSize)||13;el.style.fontSize=f+"px";var g=0;'
        + 'while(el.getComputedTextLength()>maxW&&f>6&&g<120){f-=0.5;el.style.fontSize=f+"px";g++;}}'
      + 'function centerPlate(cx,maxW,gap){var a=document.getElementById("pcv-plateA"),b=document.getElementById("pcv-plateB");'
        + 'if(!b||!b.getComputedTextLength)return;var aY=a?ty(a):0,bY=ty(b);'
        + 'if(a)a.setAttribute("text-anchor","start");b.setAttribute("text-anchor","start");'
        + 'function aw(){return a?a.getComputedTextLength():0;}function bw(){return b.getComputedTextLength();}'
        + 'function g2(){return aw()>0?gap:0;}function tot(){return aw()+g2()+bw();}'
        + 'var t=tot();var af=a?(parseFloat(getComputedStyle(a).fontSize)||14):14,bf=parseFloat(getComputedStyle(b).fontSize)||17;'
        + 'if(t>maxW&&t>0){var sc=maxW/t;if(a)a.style.fontSize=(af*sc)+"px";b.style.fontSize=(bf*sc)+"px";t=tot();}'
        + 'var sx=cx-t/2;if(a)a.setAttribute("transform","translate("+sx+" "+aY+")");'
        + 'b.setAttribute("transform","translate("+(sx+aw()+g2())+" "+bY+")");}'
      + 'function badges(){var g=document.getElementById("pcv-badges");if(!g)return;'
        + 'var labels;try{labels=JSON.parse(g.getAttribute("data-labels")||"[]");}catch(e){labels=[];}'
        + 'if(!labels.length)return;'
        + 'var full=+g.getAttribute("data-full"),min=+g.getAttribute("data-min"),X0=+g.getAttribute("data-x0"),X1=+g.getAttribute("data-x1"),'
        + 'yTop=+g.getAttribute("data-ytop"),gap=+g.getAttribute("data-gap"),lineGap=+g.getAttribute("data-linegap");'
        + 'var FONT="\'Yu Gothic\',\'Hiragino Kaku Gothic ProN\',\'Meiryo\',sans-serif",AW=X1-X0;'
        + 'function mk(lb,fs,ol){var t=document.createElementNS(NS,"text");t.setAttribute("font-size",fs);t.setAttribute("font-weight","700");t.setAttribute("font-family",FONT);t.setAttribute("fill",ol?"#111":"#fff");t.textContent=lb;return t;}'
        /* フルサイズで各バッジ幅を計測 */
        + 'var meas=labels.map(function(it){var t=mk(it.t,full,it.o);g.appendChild(t);var w=t.getComputedTextLength();g.removeChild(t);return w;});'
        /* 1段に収まる最大フォント（full→min）。min でも収まらなければ min で折り返し */
        + 'var fs=min;for(var s=full;s>=min;s-=0.5){var total=0;for(var i=0;i<meas.length;i++){if(i)total+=gap;total+=meas[i]*(s/full)+s;}if(total<=AW){fs=s;break;}}'
        + 'var padX=fs*0.5,padY=fs*0.32,rowH=fs+padY*2,rx=fs*0.28;'
        + 'var x=X0,y=yTop;'
        + 'labels.forEach(function(it){'
          + 'var t=mk(it.t,fs,it.o);g.appendChild(t);'
          + 'var w=t.getComputedTextLength(),bw=w+padX*2;'
          + 'if(x>X0&&x+bw>X1){x=X0;y+=rowH+lineGap;}'
          + 'var r=document.createElementNS(NS,"rect");'
          + 'r.setAttribute("x",x);r.setAttribute("y",y);r.setAttribute("width",bw);r.setAttribute("height",rowH);'
          + 'r.setAttribute("rx",rx);r.setAttribute("ry",rx);'
          + 'if(it.o){r.setAttribute("fill","none");r.setAttribute("stroke","#111");r.setAttribute("stroke-width",Math.max(1,fs*0.08));}else{r.setAttribute("fill","#111");}'
          + 'g.insertBefore(r,t);'
          + 't.setAttribute("x",x+padX);t.setAttribute("y",y+rowH/2);'
          + 't.setAttribute("dominant-baseline","central");t.setAttribute("text-anchor","start");'
          + 'x+=bw+gap;'
        + '});}'
      /* 罫線メモ＝v1.32.0：幅からはみ出す行は自動で折り返す。罫線が足りない分は「…ほか◯行」で知らせる。 */
      + 'function memo(){var g=document.getElementById("pcv-memo");if(!g)return;'
        + 'var rows,lines;try{rows=JSON.parse(g.getAttribute("data-rows")||"[]");lines=JSON.parse(g.getAttribute("data-lines")||"[]");}catch(e){return;}'
        + 'var mx=+g.getAttribute("data-x"),fs=+g.getAttribute("data-fs");'
        + 'var mw=+g.getAttribute("data-w")||208,ind=+g.getAttribute("data-ind")||0;'
        /* 幅を測るための見えない文字（同じ書体・同じ大きさ）。最後に消す。 */
        + 'var meas=document.createElementNS(NS,"text");meas.setAttribute("font-size",fs);'
        + 'meas.setAttribute("font-weight","700");meas.setAttribute("visibility","hidden");g.appendChild(meas);'
        + 'var W=function(s){meas.textContent=s;return meas.getComputedTextLength();};'
        /* 行頭に来てほしくない字（句読点・閉じカッコ・伸ばし棒・小書き） */
        + 'var NOHEAD="、。，．）」』】〉》〕｝!?！？・ーぁぃぅぇぉっゃゅょァィゥェォッャュョ";'
        + 'var lay=function(txt){var out=[],s=String(txt),first=true;'
          + 'while(s.length){var w=first?mw:(mw-ind),x=first?mx:(mx+ind);'
            + 'if(W(s)<=w){out.push({t:s,x:x});break;}'
            + 'var lo=1,hi=s.length;while(lo<hi){var mid=(lo+hi+1)>>1;if(W(s.slice(0,mid))<=w)lo=mid;else hi=mid-1;}'
            /* 行頭禁則は**追い出し**（区切りを左へ戻す）。右へ送ると幅からはみ出すため。 */
            + 'var n=lo;while(n>1&&NOHEAD.indexOf(s.charAt(n))>=0)n--;if(n<1)n=1;'
            + 'out.push({t:s.slice(0,n),x:x});s=s.slice(n);first=false;}'
          + 'return out;};'
        /* バッジの下端を求めて、その下の罫線から書き始める */
        + 'var bottom=90;["pcv-badges","pcv-stamp"].forEach(function(id){var el=document.getElementById(id);if(el&&el.getBBox){try{var bb=el.getBBox();if(bb.x<300){bottom=Math.max(bottom,bb.y+bb.height);}}catch(e){}}});'
        + 'var li=0;while(li<lines.length&&lines[li]<bottom+fs+4)li++;'
        /* まず全部を「実際に描く行」へ展開してから、入る本数と見比べる */
        + 'var plan=[];rows.forEach(function(txt){if(txt==null){plan.push({t:"",x:mx});return;}'
          + 'lay(txt).forEach(function(o){plan.push(o);});});'
        + 'var avail=lines.length-li;'
        + 'if(plan.length>avail){var keep=avail-1;if(keep<0)keep=0;var rest=plan.length-keep;'
          + 'plan=plan.slice(0,keep);if(avail>0)plan.push({t:"…ほか "+rest+"行",x:mx});}'
        + 'plan.forEach(function(o){if(li>=lines.length)return;if(!o.t){li++;return;}'
          + 'var t=document.createElementNS(NS,"text");t.setAttribute("x",o.x);t.setAttribute("y",lines[li]-3);'
          + 't.setAttribute("font-size",fs);t.setAttribute("font-weight","700");t.setAttribute("fill","#111");'
          + 't.textContent=o.t;g.appendChild(t);li++;});'
        + 'g.removeChild(meas);}'
      + 'function run(){try{centerName('+NAME_C.cx+','+NAME_C.maxW+','+NAME_C.fs+');centerVeh('+VEH_C.cx+','+VEH_C.maxW+','+VEH_C.makerFs+','+VEH_C.carFs+','+VEH_C.gap+');centerPlate('+NUM_C.cx+','+NUM_C.maxW+','+NUM_C.gap+');fitBox("pcv-front",'+FIT_BOX['pcv-front']+');fitBox("pcv-resStaff",'+FIT_BOX['pcv-resStaff']+');fitBox("pcv-time",'+FIT_BOX['pcv-time']+');badges();memo();}catch(e){}'
        + (noPrint?'' : 'setTimeout(function(){try{window.focus();window.print();}catch(e){}},250);')
        + '}'
      + 'if(document.readyState==="complete")run();else window.addEventListener("load",run);'
      + '})();';
  }

  function buildDoc(c, opts){
    opts = opts || {};
    var raw = String(opts.formSvg || '');
    raw = ensureFont(raw);
    raw = tagCenterEls(raw);
    var svg = fillTokens(raw, tokenMap(c));
    // 既存バッジ（黒塗り・白抜き）＋特殊バッジ（保証/保険＝黒字・黒枠のアウトライン）を1列に流し込む v0.116.0
    var badges = workBadges(c).map(function(t){ return {t:t,o:0}; })
                 .concat(specialBadges(c).map(function(t){ return {t:t,o:1}; }));
    svg = injectBadgePlaceholder(svg, badges);
    svg = injectMemoPlaceholder(svg, c);
    svg = injectLoanerFeeCheck(svg, c);   /* v1.40.0 代車ありなら管理費の四角にチェック */
    if (c.earlyDiscount && opts.stampUri) svg = injectStamp(svg, opts.stampUri);

    var vmark = opts.vmark ? '<div style="position:fixed;top:6px;left:8px;z-index:9999;background:#e11d48;color:#fff;font:700 12px/1.3 sans-serif;padding:3px 9px;border-radius:5px" data-noprint="1">'+esc(opts.vmark)+'</div><style>@media print{[data-noprint]{display:none!important}}</style>' : '';
    return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>表紙 '+esc((window.pitCustName?pitCustName(c):c.customer)||'')+'様</title><style>'+CSS+'</style></head><body>'
      + vmark
      + '<div class="pcv-sheet">' + svg + '</div>'
      + '<script>' + layoutScript(!!opts.noPrint) + '<\/script>'
      + '</body></html>';
  }
  window.pitBuildCoverDoc = buildDoc;

  /* ================= 資産の取得（初回だけfetch・以後キャッシュ） ================= */
  var _cache = null;
  function assetUrl(rel){ try{ return new URL(rel, document.baseURI).href; }catch(e){ return rel; } }
  function toDataUri(txt){ return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(txt))); }
  function ensureAssets(){
    if (_cache) return Promise.resolve(_cache);
    return Promise.all([
      fetch(assetUrl(FORM_SVG),  {cache:'force-cache'}).then(function(r){return r.text();}),
      fetch(assetUrl(STAMP_SVG), {cache:'force-cache'}).then(function(r){return r.text();})
    ]).then(function(a){ _cache = { formSvg:a[0], stampUri:toDataUri(a[1]) }; return _cache; });
  }

  /* 中間の表示タブは開かず、非表示iframeに描いてブラウザの印刷ダイアログだけを直接出す。
     印刷後（またはキャンセル後）にiframeを片付ける。 */
  function openAndPrint(doc){
    var old = document.getElementById('pit-cover-iframe');
    if (old) old.remove();
    var f = document.createElement('iframe');
    f.id = 'pit-cover-iframe';
    f.setAttribute('aria-hidden','true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(f);
    var d = f.contentWindow.document;
    d.open(); d.write(doc); d.close();
    // 印刷ダイアログを閉じた後にiframeを撤去（doc側onloadがprintを呼ぶ）
    try { f.contentWindow.onafterprint = function(){ setTimeout(function(){ try{ f.remove(); }catch(e){} }, 100); }; } catch(e){}
  }

  window.pitPrintCover = function(cardId){
    var c = ((window.state&&state.cards)||[]).find(function(x){ return x.id === cardId; });
    if (!c){ if(window.pitToast) pitToast('カードが見つかりません'); return; }
    ensureAssets().then(function(a){
      openAndPrint(buildDoc(c, { formSvg:a.formSvg, stampUri:a.stampUri }));
    }).catch(function(err){
      if (window.pitToast) pitToast('表紙テンプレートを読み込めませんでした');
      try{ console.error('[cover-print]', err); }catch(e){}
    });
  };
})();

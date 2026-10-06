/* ========================================
   sales-print.js  -  売上ビューのPDF出力（PitFlow v0.106.0）
   ・完全ベクター：jsPDF のプリミティブ描画（文字＝ベクター・選択/検索可）で A4縦1枚ぴったりに収める
   ・日本語＝TTFフォントを埋め込み（初回のみCDNから取得しキャッシュ）
   ・データは sales.js の window.svReportModel()（現在のタブ/期間/ビュー）
   ・フォント取得やjsPDFが使えない時は高精細ラスター(html2canvas)へ自動フォールバック
   ======================================== */
(function(){
  'use strict';
  function two(n){ return (n<10?'0':'')+n; }
  function nowTxt(){ var d=new Date(); return (d.getMonth()+1)+'/'+d.getDate()+' '+two(d.getHours())+':'+two(d.getMinutes()); }
  function fileBase(){ var m=(window.svReportModel?window.svReportModel():{title:'売上',period:''}); return ('売上_'+(m.title||'')+'_'+(m.period||'')).replace(/[\\\/:*?"<>|\s（）()〜]/g,'-'); }

  function loadScript(src){ return new Promise(function(res,rej){ var el=document.createElement('script'); el.src=src; el.onload=res; el.onerror=function(){rej(new Error('load '+src));}; document.head.appendChild(el); }); }
  function ensureJsPDF(){ return (window.jspdf&&window.jspdf.jsPDF)?Promise.resolve():loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'); }
  function ensureH2C(){ return window.html2canvas?Promise.resolve():loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'); }

  /* 日本語フォント（最初に取れたものを使用。取得後はキャッシュ）
     🔴🔴 v2.119.0（ゆうた報告 2026-09-15「売り上げサマリーのPDFが文字化けしてなんも見えない」）
     ◎正体＝前の取り先（minoryorg の NotoSansCJKjp-Regular.ttf）は、名前は .ttf でも**中身は OpenType（CFF）**だった。
       jsPDF は **TrueType（glyf）しか扱えない**ので、エラーを出さずに字が化けた（PDFは20KB・中の字は記号の並び）。
       しかも取れてしまうので、下の「写真で作る」逃げ道にも回らなかった。3つ目の取り先は404だった。
     ◎今＝**PitFlow の中に置いた BIZ UDPゴシック（TrueType・SIL OFL 1.1・fonts/OFL.txt）** を最初に読む。外の置き場は予備。
     🔴 取れたフォントが **TrueType でなければ使わない**（先頭4バイトで見る）＝化けたPDFを黙って出さず、写真で作る方へ回す。 */
  var FONT_URLS=[
    'fonts/BIZUDPGothic-Regular.ttf',
    'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/bizudpgothic/BIZUDPGothic-Regular.ttf',
    'https://raw.githubusercontent.com/google/fonts/main/ofl/bizudpgothic/BIZUDPGothic-Regular.ttf'
  ];
  function ab2b64(buf){ var bytes=new Uint8Array(buf), bin='', CH=0x8000; for(var i=0;i<bytes.length;i+=CH){ bin+=String.fromCharCode.apply(null, bytes.subarray(i,i+CH)); } return btoa(bin); }
  /* jsPDF が扱える TrueType か（0x00010000 または 'true'）。'OTTO'＝CFF は扱えない */
  function isTrueType(buf){
    var v=new DataView(buf); if(buf.byteLength<12) return false;
    var tag=v.getUint32(0);
    return tag===0x00010000 || tag===0x74727565;
  }
  function loadJPFont(){
    if(window.__svJPFont) return Promise.resolve(window.__svJPFont);
    var i=0;
    function trynext(){
      if(i>=FONT_URLS.length) return Promise.reject(new Error('jp font unavailable'));
      var url=FONT_URLS[i++];
      return fetch(url).then(function(r){ if(!r.ok) throw new Error('http'); return r.arrayBuffer(); })
        .then(function(b){
          if(b.byteLength<100000) throw new Error('too small');
          if(!isTrueType(b)) throw new Error('not TrueType');
          window.__svJPFont=ab2b64(b); return window.__svJPFont;
        })
        .catch(function(e){ console.warn('[sales-print] フォントを使えない:', url, e && e.message); return trynext(); });
    }
    return trynext();
  }

  // ===== A4ベクター描画（1枚に自動フィット・縮小のみ） =====
  function drawReport(pdf, model){
    var PW=210,PH=297,mL=12,mT=12,mR=12,mB=12, W=PW-mL-mR, availH=PH-mT-mB;
    var m={ titleH:10, kpiH:16, secTitleH:7, rowH:5.4, headH:5.8, gap:4.5, barsH:44 };
    function secH(sec){ if(sec.type==='table') return m.secTitleH + m.headH + sec.rows.length*m.rowH + m.gap; if(sec.type==='bars') return m.secTitleH + m.barsH + m.gap; return m.secTitleH+m.gap; }
    /* 🆕 v2.148.0 添え書き（model.note）も紙に出す。行数は幅で折り返して数える */
    pdf.setFont('JP','normal'); pdf.setFontSize(7.2);
    var noteLines = model.note ? pdf.splitTextToSize(String(model.note), W) : [];
    var reqH=m.titleH + ((model.kpis&&model.kpis.length)?m.kpiH:0) + model.sections.reduce(function(a,s){return a+secH(s);},0) + (noteLines.length ? noteLines.length*3.4+2 : 0);
    var sc=Math.min(1, availH/reqH);
    var y=mT;
    pdf.setFont('JP','normal');
    // タイトル
    pdf.setFontSize(15*sc); pdf.setTextColor(20,20,20); pdf.text(String(model.title||''), mL, y+6*sc);
    pdf.setFontSize(9*sc); pdf.setTextColor(90,90,90); pdf.text((model.period||'')+' ／ 小林モータース ／ 出力 '+nowTxt(), PW-mR, y+6*sc, {align:'right'});
    pdf.setDrawColor(31,122,77); pdf.setLineWidth(0.5*sc); pdf.line(mL, y+m.titleH*sc-1*sc, PW-mR, y+m.titleH*sc-1*sc);
    y+=m.titleH*sc;
    // KPI
    if(model.kpis&&model.kpis.length){ var n=model.kpis.length, gx=3*sc, bw=(W-(n-1)*gx)/n, bh=(m.kpiH-2)*sc;
      model.kpis.forEach(function(k,ix){ var x=mL+ix*(bw+gx); pdf.setFillColor(244,246,248); pdf.setDrawColor(212,216,222); pdf.setLineWidth(0.2); pdf.roundedRect(x,y,bw,bh,1.5*sc,1.5*sc,'FD'); pdf.setTextColor(110,115,122); pdf.setFontSize(7.5*sc); pdf.text(String(k.label),x+3*sc,y+6*sc); pdf.setTextColor(20,20,20); pdf.setFontSize(13*sc); pdf.text(String(k.value),x+3*sc,y+13.5*sc); });
      y+=m.kpiH*sc;
    }
    // セクション
    model.sections.forEach(function(sec){
      pdf.setTextColor(30,30,30); pdf.setFontSize(10.5*sc); pdf.text(String(sec.title||''), mL, y+5*sc); y+=m.secTitleH*sc;
      if(sec.type==='table') y=drawTable(pdf,sec,mL,y,W,sc,m);
      else if(sec.type==='bars') y=drawBars(pdf,sec,mL,y,W,sc,m);
      y+=m.gap*sc;
    });
    if (noteLines.length){ pdf.setFontSize(7.2*sc); pdf.setTextColor(90,90,90); noteLines.forEach(function(L2,ix){ pdf.text(L2, mL, y+3*sc+ix*3.4*sc); }); }
  }
  function drawTable(pdf,sec,x,y,W,sc,m){
    var wts=sec.align.map(function(a,i){ return i===0?2.4:1; }); var tw=wts.reduce(function(a,b){return a+b;},0); var ws=wts.map(function(w){return w/tw*W;});
    pdf.setFillColor(236,239,242); pdf.rect(x,y,W,m.headH*sc,'F'); pdf.setTextColor(88,94,100); pdf.setFontSize(7.6*sc);
    var cx=x; sec.head.forEach(function(hh,i){ var a=sec.align[i]||'l'; pdf.text(String(hh), a==='r'?cx+ws[i]-1.6*sc:cx+1.6*sc, y+m.headH*sc-1.8*sc, {align:a==='r'?'right':'left'}); cx+=ws[i]; });
    y+=m.headH*sc;
    pdf.setFontSize(8.4*sc);
    sec.rows.forEach(function(r,ri){ if(ri%2===1){ pdf.setFillColor(248,249,250); pdf.rect(x,y,W,m.rowH*sc,'F'); } pdf.setTextColor(25,25,25); var cx2=x; r.forEach(function(cell,i){ var a=sec.align[i]||'l'; pdf.text(String(cell), a==='r'?cx2+ws[i]-1.6*sc:cx2+1.6*sc, y+m.rowH*sc-1.6*sc, {align:a==='r'?'right':'left'}); cx2+=ws[i]; }); pdf.setDrawColor(228,231,234); pdf.setLineWidth(0.1); pdf.line(x,y+m.rowH*sc,x+W,y+m.rowH*sc); y+=m.rowH*sc; });
    return y;
  }
  function drawBars(pdf,sec,x,y,W,sc,m){
    var H=m.barsH*sc, n=sec.items.length, gap=2*sc, bw=(W-(n-1)*gap)/n, maxV=sec.max||Math.max.apply(null,sec.items.map(function(i){return i.value;}))||1, base=y+H-6*sc, top=y+2*sc;
    pdf.setDrawColor(215,219,224); pdf.setLineWidth(0.2); pdf.line(x,base,x+W,base);
    sec.items.forEach(function(it,i){ var bx=x+i*(bw+gap); var bh=(base-top)*(it.value/maxV); if(bh<0)bh=0; pdf.setFillColor(29,185,122); pdf.rect(bx,base-bh,bw,bh,'F'); pdf.setFontSize(6.4*sc); pdf.setTextColor(120,120,120); pdf.text(String(it.label),bx+bw/2,base+4*sc,{align:'center'}); });
    return y+H;
  }

  /* ===================================================================
     🎨 v2.120.0（ゆうた指定 2026-09-15「サマリー画面のようなインフォグラフィックな感じがいい」）
     売上サマリー（当月）は、画面と同じ並びで A4縦1枚に描く（ベクター・文字は選べる）。
       ① 数字の帯（実績／着地見込み／本日ペース）＋確度別の積み上げ帯（最低・最高の印）
       ② 日次の進捗（実績の面・着地予測の点線・最低／最高ペースの破線・今日の線）
       ③ 確度別カード（目標＋6区分）　④ 1課・2課＝積み上げの階段（v2.124.0〜メイン。フロント別はやめた）
     🔴 数字・色・区分は sales.js が渡す材料（model.infographic）だけを使う。ここで数え直さない。
     ⚠ 紙なので下地は明るい色。確度の色は画面と同じ。
     =================================================================== */
  function hexRgb(hex){ var h=String(hex||'#000000').replace('#',''); if(h.length===3) h=h.split('').map(function(c){return c+c;}).join(''); var n=parseInt(h,16)||0; return [(n>>16)&255,(n>>8)&255,n&255]; }
  function tint(hex, a){ var c=hexRgb(hex); return [Math.round(255-(255-c[0])*a),Math.round(255-(255-c[1])*a),Math.round(255-(255-c[2])*a)]; }
  /* 紙（白地）で文字にする時だけ少し濃くする（実績待の黄緑は白地だと薄い） */
  function deep(hex){ var c=hexRgb(hex); return [Math.round(c[0]*0.72),Math.round(c[1]*0.72),Math.round(c[2]*0.72)]; }
  function F(pdf,c){ pdf.setFillColor(c[0],c[1],c[2]); }
  function D(pdf,c){ pdf.setDrawColor(c[0],c[1],c[2]); }
  function T(pdf,c){ pdf.setTextColor(c[0],c[1],c[2]); }
  function dashOn(pdf,arr){ try{ pdf.setLineDashPattern(arr||[],0); }catch(e){} }
  function MAN(n){ return window.svMan ? svMan(n) : (Math.round(n/1000)/10)+'万'; }
  var INK=[28,34,31], MUTED=[98,108,103], FAINT=[150,158,154], RULE=[222,228,224], PANEL=[247,249,248], GREEN=hexRgb('#1db97a');

  function drawInfographic(pdf, model){
    var I=model.infographic, PW=210, L=12, R=198, W=R-L;
    pdf.setFont('JP','normal');

    /* ── 見出し ── */
    T(pdf,INK); pdf.setFontSize(17); pdf.text(String(model.title||'売上サマリー'), L, 19);
    T(pdf,MUTED); pdf.setFontSize(8.5); pdf.text((model.period||'')+' ／ 小林モータース ／ 出力 '+nowTxt(), R, 19, {align:'right'});
    D(pdf,GREEN); pdf.setLineWidth(0.6); pdf.line(L, 22.5, R, 22.5);

    /* ── ① 数字の帯 ── */
    var y=26, heroH=47;
    F(pdf,PANEL); D(pdf,RULE); pdf.setLineWidth(0.25); pdf.roundedRect(L, y, W, heroH, 2, 2, 'FD');
    var c1=L+5, c2=L+66;
    T(pdf,MUTED); pdf.setFontSize(7.5); pdf.text('実績（返車済み）', c1, y+6.5);
    T(pdf,GREEN); pdf.setFontSize(23); pdf.text(MAN(I.actual), c1, y+17.5);
    T(pdf,MUTED); pdf.setFontSize(7); pdf.text('目標 '+MAN(I.min)+'〜'+MAN(I.max)+' ／ 達成率 '+(I.min>0?Math.round(I.actual/I.min*100):0)+'%（最低比）', c1, y+23.5);
    var landC = I.landing>=I.min ? GREEN : hexRgb('#e08a0b');
    T(pdf,MUTED); pdf.setFontSize(7.5); pdf.text('着地見込み（実績＋パイプライン）', c2, y+6.5);
    T(pdf,landC); pdf.setFontSize(23); pdf.text(MAN(I.landing), c2, y+17.5);
    pdf.setFontSize(7); var sx=c2;
    T(pdf,MUTED); pdf.text('実績見込み（実績＋実績待）', sx, y+23.5); sx+=pdf.getTextWidth('実績見込み（実績＋実績待）')+1.2;
    T(pdf,deep(I.tiers[1].color)); pdf.text(MAN(I.nearSure), sx, y+23.5); sx+=pdf.getTextWidth(MAN(I.nearSure))+4;
    T(pdf,MUTED); pdf.text('確度高（＋確定）', sx, y+23.5); sx+=pdf.getTextWidth('確度高（＋確定）')+1.2;
    T(pdf,hexRgb('#2563eb')); pdf.text(MAN(I.committed), sx, y+23.5);
    if (I.isThis && I.todayIdx>0){
      var lv = I.pacePct>=100 ? '#1db97a' : (I.pacePct>=85 ? '#e08a0b' : '#d9443a');
      var bx=R-44, bw=39, by=y+3.5, bh=22;
      F(pdf,tint(lv,0.10)); D(pdf,hexRgb(lv)); pdf.setLineWidth(0.35); pdf.roundedRect(bx, by, bw, bh, 1.6, 1.6, 'FD');
      T(pdf,MUTED); pdf.setFontSize(7); pdf.text('本日ペース', bx+bw/2, by+5, {align:'center'});
      T(pdf,hexRgb(lv)); pdf.setFontSize(17); pdf.text(I.pacePct+'%', bx+bw/2, by+13.5, {align:'center'});
      T(pdf,MUTED); pdf.setFontSize(6.2); pdf.text(MAN(I.actual)+' ／ 目安 '+MAN(I.paceTarget), bx+bw/2, by+19, {align:'center'});
    }
    /* 積み上げ帯 */
    var barX=L+5, barW=W-10, barY=y+29, barH=6.5, scale=Math.max(I.max, I.landing, 1)*1.02;
    F(pdf,[232,236,234]); pdf.roundedRect(barX, barY, barW, barH, 1.5, 1.5, 'F');
    var xx=barX;
    I.tiers.forEach(function(tt){ if(!(tt.sum>0)) return; var ww=barW*tt.sum/scale; F(pdf,hexRgb(tt.color)); pdf.rect(xx, barY, Math.max(0,ww), barH, 'F'); xx+=ww; });
    [{v:I.min,c:[90,98,94],lb:'最低 '+MAN(I.min)},{v:I.max,c:hexRgb('#d99a06'),lb:'最高 '+MAN(I.max)}].forEach(function(mk){
      var mx=barX+barW*mk.v/scale; D(pdf,mk.c); pdf.setLineWidth(0.6); pdf.line(mx, barY-2, mx, barY+barH+2);
      T(pdf,mk.c); pdf.setFontSize(6.5); pdf.text(mk.lb, Math.min(mx, R-6), barY+barH+6, {align:'center'});
    });
    y += heroH + 3;
    /* 🆕 v2.145.0 保険・社員の参考を同じ行に並べる（行を増やさない＝下の課別を押し出さない） */
    var _refLine = [I.refNoCount ? '参考：'+I.refNoCount+'（売上には入っていません）' : '', I.refText||''].filter(Boolean).join('　／　');
    if (_refLine){ T(pdf,MUTED); pdf.setFontSize(6.8); pdf.text(_refLine, L+1, y+2.5); y += 5; }

    /* ── ② 日次の進捗 ── */
    var chH=62;   /* v2.124.0 74→62：課別をメインにするため、その分を課別へ回した */
    D(pdf,RULE); pdf.setLineWidth(0.25); pdf.roundedRect(L, y, W, chH, 2, 2, 'S');
    T(pdf,INK); pdf.setFontSize(9.5); pdf.text('日次の進捗（返車＝実績の累計）', L+4, y+6.5);
    /* 凡例 */
    var lgx=R-4, lgy=y+6; pdf.setFontSize(6.5);
    [['最高ペース','#d99a06',[1.4,1]],['最低ペース','#7a86a8',[1.4,1]],['着地予測','#1db97a',[0.5,0.9]],['実績累計','#1db97a',null]].forEach(function(lg){
      var tw=pdf.getTextWidth(lg[0]); lgx-=tw; T(pdf,MUTED); pdf.text(lg[0], lgx, lgy);
      lgx-=7; D(pdf,hexRgb(lg[1])); pdf.setLineWidth(lg[2]?0.5:0.9); dashOn(pdf,lg[2]); pdf.line(lgx, lgy-1.1, lgx+5.5, lgy-1.1); dashOn(pdf,[]); lgx-=3.5;
    });
    var gx0=L+17, gx1=R-5, gy0=y+11, gy1=y+chH-9, N=I.lastDay||30, cum=I.cum||[];
    var yHi=Math.max(I.max, I.landing, cum[N]||0, I.min, 1)*1.08;
    function X(dd){ return gx0+(gx1-gx0)*(N<=1?0:(dd-1)/(N-1)); }
    function Y(v){ return gy1-(gy1-gy0)*(v/yHi); }
    [0, I.min, I.max].forEach(function(v){ D(pdf,RULE); pdf.setLineWidth(0.2); pdf.line(gx0, Y(v), gx1, Y(v)); T(pdf,FAINT); pdf.setFontSize(6.5); pdf.text(MAN(v), gx0-2, Y(v)+1.1, {align:'right'}); });
    function pace(v,dd){ return N<=1 ? v : v*(dd-1)/(N-1); }
    D(pdf,hexRgb('#d99a06')); pdf.setLineWidth(0.45); dashOn(pdf,[1.4,1]); pdf.line(X(1), Y(pace(I.max,1)), X(N), Y(pace(I.max,N)));
    D(pdf,hexRgb('#7a86a8')); pdf.line(X(1), Y(pace(I.min,1)), X(N), Y(pace(I.min,N))); dashOn(pdf,[]);
    var ti=I.todayIdx||0;
    if (ti>=1){
      var last=Math.min(ti,N);
      /* 実績の面（薄い緑）＝台形を1日ずつ */
      F(pdf,tint('#1db97a',0.18));
      for (var k=1;k<last;k++){
        var xa=X(k), xb=X(k+1), ya=Y(cum[k]||0), yb=Y(cum[k+1]||0);
        pdf.lines([[xb-xa,yb-ya],[0,gy1-yb],[xa-xb,0]], xa, ya, [1,1], 'F', true);
      }
      D(pdf,GREEN); pdf.setLineWidth(0.8);
      for (k=1;k<last;k++) pdf.line(X(k), Y(cum[k]||0), X(k+1), Y(cum[k+1]||0));
      if (ti<N){ D(pdf,GREEN); pdf.setLineWidth(0.55); dashOn(pdf,[0.5,0.9]); pdf.line(X(ti), Y(cum[ti]||0), X(N), Y(I.landing)); dashOn(pdf,[]); }
      D(pdf,[160,168,164]); pdf.setLineWidth(0.25); dashOn(pdf,[0.6,0.8]); pdf.line(X(last), gy0, X(last), gy1); dashOn(pdf,[]);
      F(pdf,GREEN); pdf.circle(X(last), Y(cum[last]||0), 0.9, 'F');
      T(pdf,GREEN); pdf.setFontSize(6.5); pdf.text(MAN(cum[last]||0), X(last)-1.6, Y(cum[last]||0)-2, {align:'right'});   /* 点の左上＝着地予測の点線と重ねない */
    }
    var step=Math.max(1, Math.ceil(N/8)); T(pdf,FAINT); pdf.setFontSize(6.5);
    for (var dd=1; dd<=N; dd+=step){ pdf.text(String(dd), X(dd), gy1+4.5, {align:'center'}); }
    if ((N-1)%step!==0) pdf.text(String(N), X(N), gy1+4.5, {align:'center'});
    y += chH + 4;

    /* ── ③ 確度別カード（目標＋6区分） ── */
    var cards=[{label:'目標',color:'#d99a06',big:MAN(I.min)+'〜',big2:MAN(I.max),cnt:''}].concat(I.tiers.map(function(tt){ return {label:tt.label,color:tt.color,big:MAN(tt.sum),cnt:tt.count+'台'}; }));
    var cg=2.2, cw=(W-cg*(cards.length-1))/cards.length, chh=21;
    cards.forEach(function(cd, i){
      var cx=L+i*(cw+cg);
      F(pdf,[255,255,255]); D(pdf,RULE); pdf.setLineWidth(0.25); pdf.roundedRect(cx, y, cw, chh, 1.4, 1.4, 'FD');
      F(pdf,hexRgb(cd.color)); pdf.rect(cx, y, cw, 1.3, 'F');
      F(pdf,hexRgb(cd.color)); pdf.circle(cx+3, y+5.6, 0.9, 'F');
      T(pdf,INK); pdf.setFontSize(7); pdf.text(cd.label, cx+5, y+6.4);
      if (cd.cnt){ T(pdf,FAINT); pdf.setFontSize(6); pdf.text(cd.cnt, cx+cw-2, y+6.4, {align:'right'}); }
      T(pdf,INK); pdf.setFontSize(cd.big2 ? 9 : 11.5);
      pdf.text(cd.big, cx+2.6, y+(cd.big2?12.5:14.5));
      if (cd.big2) pdf.text(cd.big2, cx+2.6, y+17.5);
    });
    y += chh + 4;

    /* ── ④ 課別＝この紙のメイン ──
       🆕 v2.124.0（ゆうた指定 2026-09-26「PDFはフロントごと要らない。それぞれの課の数字をメインに」）
       画面の課別と同じ「積み上げの階段」：実績 → ＋実績待（ほぼ確実）→ ＋確定（確度高）→ … → ＋予測（着地）
       帯の縦線＝課の目標（最低＝濃い実線／最高＝黄の点線）。物差しは1課・2課で共通（長さで比べられる）。 */
    var bgap=4, bw2=(W-bgap)/2, bh2=Math.max(96, 287-y);
    var cScale=Math.max.apply(null, I.courses.map(function(co){ return Math.max(co.max, co.landing); }).concat([1]))*1.06;
    var MINC=[70,78,74], MAXC=hexRgb('#d99a06');
    function cbar(x0, w0, yy, hh, co, upTo, hi){
      F(pdf,[232,236,234]); pdf.roundedRect(x0, yy, w0, hh, Math.min(1.2,hh/2), Math.min(1.2,hh/2), 'F');
      var xx2=x0;
      co.tiers.forEach(function(tt, k){ if (k>upTo || !(tt.sum>0)) return; var ww=w0*tt.sum/cScale;
        F(pdf, (hi<0 || hi===k) ? hexRgb(tt.color) : tint(tt.color,0.3)); pdf.rect(xx2, yy, Math.max(0,ww), hh, 'F'); xx2+=ww; });
      var ext=Math.max(1, hh*0.35);
      D(pdf,MINC); pdf.setLineWidth(0.45); var m1=x0+w0*co.min/cScale; pdf.line(m1, yy-ext, m1, yy+hh+ext);
      D(pdf,MAXC); dashOn(pdf,[0.8,0.6]); var m2=x0+w0*co.max/cScale; pdf.line(m2, yy-ext, m2, yy+hh+ext); dashOn(pdf,[]);
      return { m1:m1, m2:m2 };
    }
    I.courses.forEach(function(co, i){
      var bx2=L+i*(bw2+bgap), ix=bx2+4, iw=bw2-8;
      F(pdf,[255,255,255]); D(pdf,RULE); pdf.setLineWidth(0.25); pdf.roundedRect(bx2, y, bw2, bh2, 1.8, 1.8, 'FD');
      F(pdf,hexRgb(co.color)); pdf.rect(bx2, y+1.8, 1.2, bh2-3.6, 'F');
      /* 見出し */
      F(pdf,hexRgb(co.color)); pdf.roundedRect(ix, y+3.2, 12, 5.4, 1.2, 1.2, 'F');
      T(pdf,[255,255,255]); pdf.setFontSize(8.5); pdf.text(co.label, ix+6, y+7.1, {align:'center'});
      T(pdf,INK); pdf.setFontSize(9.5); pdf.text(co.team, ix+14.5, y+7.2);
      T(pdf,MUTED); pdf.setFontSize(7.5); pdf.text('目標 '+MAN(co.min)+'〜'+MAN(co.max), ix+iw, y+7.2, {align:'right'});
      /* 大きい数字3つ */
      var kw=(iw-4)/3, ky=y+11;
      [{lb:'実績', v:co.actual, c:hexRgb(co.tiers[0].color), sub:'最低の '+(co.min>0?Math.round(co.actual/co.min*100):0)+'%'},
       {lb:'ほぼ確実', v:co.nearSure, c:deep(co.tiers[1].color), sub:'実績＋実績待'},
       {lb:'着地見込み', v:co.landing, c:(co.landing>=co.min?GREEN:hexRgb('#d9443a')), sub:(co.landing>=co.max?'最高も超える':co.landing>=co.min?'最低を超える':'最低まで あと '+MAN(co.min-co.landing))}
      ].forEach(function(k, j){
        var kx=ix+j*(kw+2);
        F(pdf,PANEL); D(pdf,RULE); pdf.setLineWidth(0.2); pdf.roundedRect(kx, ky, kw, 17, 1.3, 1.3, 'FD');
        T(pdf,MUTED); pdf.setFontSize(6.5); pdf.text(k.lb, kx+2.4, ky+4.4);
        T(pdf,k.c); pdf.setFontSize(15); pdf.text(MAN(k.v), kx+2.4, ky+11.2);
        T(pdf,FAINT); pdf.setFontSize(5.8); pdf.text(k.sub, kx+2.4, ky+15);
      });
      /* 大きい帯＋目標の印 */
      var by2=y+35.5, mk=cbar(ix, iw, by2, 6, co, co.tiers.length-1, -1);
      pdf.setFontSize(6.2);
      T(pdf,MINC); pdf.text('最低 '+MAN(co.min), mk.m1, by2-2.2, {align:'center'});
      T(pdf,MAXC); pdf.text('最高 '+MAN(co.max), Math.min(mk.m2, ix+iw-8), by2-2.2, {align:'center'});
      /* 積み上げの階段 */
      var ly=y+48, lh=Math.min(11.5, (y+bh2-3-ly-4)/co.tiers.length);
      var cN=ix, cV=ix+iw*0.47, cC=ix+iw*0.80, cP=ix+iw;
      T(pdf,FAINT); pdf.setFontSize(6); pdf.text('区分', cN, ly); pdf.text('この区分', cV, ly, {align:'right'}); pdf.text('足した合計', cC, ly, {align:'right'}); pdf.text('最低比', cP, ly, {align:'right'});
      ly += 1.5;
      var cum=0;
      co.tiers.forEach(function(tt, k){
        cum += tt.sum;
        var ry=ly+k*lh, ty=ry+4.3, p=co.min>0?Math.round(cum/co.min*100):0;
        if (tt.stage){ F(pdf,tint(co.color,0.07)); pdf.rect(ix-1.5, ry, iw+3, lh, 'F'); }
        D(pdf,RULE); pdf.setLineWidth(0.1); pdf.line(ix-1.5, ry, ix+iw+1.5, ry);
        F(pdf,hexRgb(tt.color)); pdf.circle(cN+1, ty-1.2, 1, 'F');
        T(pdf,INK); pdf.setFontSize(8); pdf.text((k?'＋':'')+tt.label, cN+3, ty);
        T(pdf, tt.sum>0 ? MUTED : FAINT); pdf.setFontSize(7.5); pdf.text(MAN(tt.sum), cV-6, ty, {align:'right'});
        pdf.setFontSize(5.8); pdf.text(tt.count+'台', cV, ty, {align:'right'});
        T(pdf,INK); pdf.setFontSize(10); pdf.text(MAN(cum), cC, ty+0.2, {align:'right'});
        if (tt.stage){ T(pdf,hexRgb(co.color)); pdf.setFontSize(6); pdf.text(tt.stage, cC-pdf.getTextWidth(MAN(cum))*10/6-2.2, ty, {align:'right'}); }
        T(pdf, cum>=co.max ? MAXC : (cum>=co.min ? GREEN : MUTED)); pdf.setFontSize(8); pdf.text(p+'%', cP, ty, {align:'right'});
        cbar(ix, iw, ry+lh-4.2, 2.2, co, k, k);
      });
    });
    y += bh2;

    /* ── 注記 ── */
    T(pdf,FAINT); pdf.setFontSize(5.8);
    pdf.text('金額：実績＝確定額／確定＝受注額／予定＝見積額／見込・予測＝概算。どの月に数えるか：実績＝実績カウント日／それ以外＝返車予定日（未定・予定日超過は当月）。', L, 291);
  }

  // ===== ラスターPDF（フォールバック：html2canvasでA4 1枚に収める） =====
  function rasterPdf(){
    ensureJsPDF().then(ensureH2C).then(function(){
      var body=document.getElementById('view-sales-body'); if(!body){ pitAlert('データがありません', { code:'PF-5001' }); return; }
      var clone=body.cloneNode(true); clone.querySelectorAll('.sv-tabbar,.sv-head,.sv-viewsw').forEach(function(el){ if(el.parentNode) el.parentNode.removeChild(el); });
      var wrap=document.createElement('div'); wrap.style.cssText='position:fixed;left:-9999px;top:0;width:760px;background:#fff;color:#111;padding:12px;';
      wrap.setAttribute('data-theme','light'); wrap.appendChild(clone); document.body.appendChild(wrap);
      window.html2canvas(wrap,{scale:3,backgroundColor:'#ffffff',useCORS:true,logging:false}).then(function(canvas){
        var jsPDF=window.jspdf.jsPDF; var pdf=new jsPDF('p','mm','a4'); var pw=210-16, ph=297-16; var ratio=Math.min(pw/canvas.width, ph/canvas.height);
        pdf.addImage(canvas.toDataURL('image/jpeg',0.92),'JPEG',8,8,canvas.width*ratio,canvas.height*ratio); pdf.save(fileBase()+'.pdf'); document.body.removeChild(wrap);
      }).catch(function(){ document.body.removeChild(wrap); pitAlert('PDF出力に失敗しました。', { code:'PF-5002' }); });
    }).catch(function(){ pitAlert('PDFライブラリの読込に失敗しました（オフライン等）。', { code:'PF-5003' }); });
  }

  /* ===================================================================
     🆕 v2.145.0（ゆうた指定 2026-10-06）**区分別の一覧（実績〜見込）＝A4縦・白黒**
     🗣「この感じに返車予定日を入れて、A4白黒印刷対応のPDFを自動で作成してDL出来るボタンを」
     ・課ごとに改ページ（1課 → 2課）。1枚に入らなければ次のページへ続け、見出しを描き直す
     ・🔴 **色を使わない**（黒・灰だけ）＝白黒で刷っても区分が読める。区分は見出しの文字で分ける
     ・数字は sales.js の svListModel（＝売上ビューと同じ集め方）だけ。ここで数え直さない
     =================================================================== */
  function yenTxt(v){ return Math.round(+v||0).toLocaleString('ja-JP'); }
  function fitTxt(pdf, s, w){
    s = String(s==null?'':s);
    if (pdf.getTextWidth(s) <= w) return s;
    while (s.length > 1 && pdf.getTextWidth(s+'…') > w) s = s.slice(0, -1);
    return s + '…';
  }
  function drawList(pdf, model){
    var L=12, R=198, W=R-L, BOT=282, y=0;
    var G=function(v){ return [v,v,v]; };
    /* 🆕 v2.146.0 返車の札（済・確定・予定・概算）と金額の種類（確定・受注・見積・概算）を列に出す */
    var COLS=[['状態／実績日',21,'l'],['返車（種類 日付）',24,'l'],['お客様・車種',55,'l'],['作業',26,'l'],['フロント',23,'l'],['金額の種類',17,'l'],['金額（円）',20,'r']];
    var RCOLS=[['区分',12,'l'],['付加',9,'l'],['返車（種類 日付）',24,'l'],['お客様・車種',50,'l'],['作業',22,'l'],['フロント',20,'l'],['金額の種類',17,'l'],['金額（円）',20,'r']];
    var first=true, curCourse=null;
    function pageHead(){
      T(pdf,G(0)); pdf.setFontSize(13); pdf.text(String(model.title), L, 17);
      T(pdf,G(70)); pdf.setFontSize(8); pdf.text(model.period+' ／ 小林モータース ／ 出力 '+nowTxt(), R, 17, {align:'right'});
      D(pdf,G(0)); pdf.setLineWidth(0.4); pdf.line(L, 19.5, R, 19.5);
      y = 24;
    }
    function newPage(cont){
      if (!first) pdf.addPage(); first=false;
      pageHead();
      if (curCourse) courseHead(cont);
    }
    function courseHead(cont){
      var co=curCourse;
      F(pdf,G(225)); pdf.rect(L, y, W, 8, 'F');
      T(pdf,G(0)); pdf.setFontSize(11); pdf.text(co.label+'（'+co.team+'）'+(cont?'　続き':''), L+2.5, y+5.6);
      T(pdf,G(50)); pdf.setFontSize(8); pdf.text('課の目標 '+MAN(co.min)+'〜'+MAN(co.max), R-2.5, y+5.6, {align:'right'});
      y += 11;
    }
    function need(h, redraw){ if (y+h > BOT){ newPage(true); if (redraw) redraw(); return true; } return false; }
    function colHead(cols){
      D(pdf,G(0)); pdf.setLineWidth(0.25); pdf.line(L, y, R, y);
      T(pdf,G(60)); pdf.setFontSize(7); var x=L;
      cols.forEach(function(c){ pdf.text(c[0], c[2]==='r' ? x+c[1]-1.2 : x+1.2, y+3.6, {align:c[2]==='r'?'right':'left'}); x+=c[1]; });
      y += 5; D(pdf,G(0)); pdf.setLineWidth(0.15); pdf.line(L, y, R, y);
    }
    function row(cols, vals){
      T(pdf,G(0)); pdf.setFontSize(8); var x=L;
      cols.forEach(function(c,i){
        var s = fitTxt(pdf, vals[i], c[1]-2.4);
        pdf.text(s, c[2]==='r' ? x+c[1]-1.2 : x+1.2, y+3.7, {align:c[2]==='r'?'right':'left'}); x+=c[1];
      });
      y += 5.2; D(pdf,G(190)); pdf.setLineWidth(0.1); pdf.line(L, y, R, y);
    }

    model.courses.forEach(function(co){
      curCourse = co; newPage(false);
      /* ── 区分の合計と「足した合計」 ── */
      var SC=[['区分',30,'l'],['台数',18,'r'],['この区分',34,'r'],['足した合計',44,'r'],['最低比',20,'r'],['',40,'l']];
      colHead(SC);
      var cum=0, NEAR={actualWait:'ほぼ確実',confirmed:'確度高',prospect:'見込まで'};
      co.groups.forEach(function(g, i){
        cum += g.sum;
        row(SC, [(i?'＋':'')+g.label, g.count+'台', MAN(g.sum), MAN(cum), (co.min>0?Math.round(cum/co.min*100):0)+'%', NEAR[g.id]||'']);
      });
      y += 2.5;
      /* 🆕 v2.146.0 札の読み方（課のページごとに1回） */
      D(pdf,G(120)); pdf.setLineWidth(0.15); pdf.rect(L, y, W, 10);
      T(pdf,G(40)); pdf.setFontSize(6.8);
      pdf.text('返車：済＝返した日／確定＝確定返車日／予定＝受注時にお客様に伝えた返車予定日／概算＝入庫日＋預かり日数の目安／未定＝まだ日付が無い', L+2, y+4);
      pdf.text('金額：確定金額＝完TEL・返車のときに決めた額／受注金額＝受注時の額／見積金額＝見積の額／概算金額＝作業タイプの目安（まだ見積が無い）', L+2, y+8);
      y += 14;
      /* ── 区分ごとの1台ずつ ── */
      co.groups.forEach(function(g){
        need(16);
        F(pdf,G(238)); pdf.rect(L, y, W, 6.5, 'F');
        D(pdf,G(0)); pdf.setLineWidth(0.6); pdf.line(L, y, L, y+6.5);
        T(pdf,G(0)); pdf.setFontSize(9.5); pdf.text(g.label+'　'+g.count+'台　'+MAN(g.sum), L+2.5, y+4.6);
        T(pdf,G(80)); pdf.setFontSize(6.8); pdf.text(fitTxt(pdf, g.note, 100), R-2, y+4.4, {align:'right'});
        y += 8;
        if (!g.rows.length){ T(pdf,G(110)); pdf.setFontSize(8); pdf.text('なし', L+2, y+3); y += 7; return; }
        colHead(COLS);
        g.rows.forEach(function(r){
          need(5.2, function(){ T(pdf,G(60)); pdf.setFontSize(7.5); pdf.text(g.label+'（続き）', L+1, y+3); y+=5; colHead(COLS); });
          row(COLS, [r.when, r.ret, r.name, r.work, r.front, r.amtKind+'金額', yenTxt(r.amt)]);
        });
        y += 4;
      });
      /* ── 参考（保険・社員）＝集計の外 ── */
      if (co.refRows.length){
        need(20);
        D(pdf,G(0)); pdf.setLineWidth(0.3); dashOn(pdf,[1.2,1]);
        pdf.rect(L, y, W, 6.5); dashOn(pdf,[]);
        var rt = co.refRows.reduce(function(a,r){ return a+(+r.amt||0); }, 0);
        T(pdf,G(0)); pdf.setFontSize(9.5); pdf.text('参考（保険・社員の実績待〜見込）　'+co.refRows.length+'台　'+MAN(rt), L+2.5, y+4.6);
        T(pdf,G(80)); pdf.setFontSize(6.8); pdf.text('実績になるまで売上の集計（上の合計）には入れていません', R-2, y+4.4, {align:'right'});
        y += 8;
        colHead(RCOLS);
        co.refRows.forEach(function(r){
          need(5.2, function(){ colHead(RCOLS); });
          row(RCOLS, [({actual:'実績',actualWait:'実績待',confirmed:'確定',planned:'予定',prospect:'見込'})[r.tier]||'', r.ref, r.ret, r.name, r.work, r.front, r.amtKind+'金額', yenTxt(r.amt)]);
        });
      }
    });
    /* ページ番号（全部描いてから） */
    var n = pdf.getNumberOfPages();
    for (var i=1;i<=n;i++){ pdf.setPage(i); T(pdf,G(90)); pdf.setFontSize(7.5); pdf.text(i+' / '+n, R, 291, {align:'right'}); pdf.setFontSize(6.2); pdf.text(fitTxt(pdf,'金額は税抜。売上ビューと同じ拾い方（実績・実績待＝確定→受注→見積→概算／確定＝受注→確定→見積→概算／予定＝見積→概算／見込＝概算）。', W-14), L, 291); }
  }
  window.svExportListPdf=function(){
    if(!window.svListModel){ pitAlert('一覧の部品を読み込み中です。少し待ってからもう一度押してください。', { code:'PF-5002' }); return; }
    ensureJsPDF().then(loadJPFont).then(function(b64){
      var jsPDF=window.jspdf.jsPDF; var pdf=new jsPDF('p','mm','a4');
      pdf.addFileToVFS('svjp.ttf', b64); pdf.addFont('svjp.ttf','JP','normal'); pdf.setFont('JP','normal');
      var model=window.svListModel();
      drawList(pdf, model);
      pdf.save(('売上一覧_'+model.period).replace(/[\\\/:*?"<>|\s（）()〜]/g,'-')+'.pdf');
    }).catch(function(e){ console.warn('[sales-print] 一覧PDF:', e && e.message); pitAlert('一覧PDFを作れませんでした（フォントかPDFの部品が読めません）。', { code:'PF-5003' }); });
  };

  window.svExportPdf=function(){
    if(!window.svReportModel){ rasterPdf(); return; }
    ensureJsPDF().then(loadJPFont).then(function(b64){
      var jsPDF=window.jspdf.jsPDF; var pdf=new jsPDF('p','mm','a4');
      pdf.addFileToVFS('svjp.ttf', b64); pdf.addFont('svjp.ttf','JP','normal');
      var model = window.svReportModel();
      /* 🎨 v2.120.0 材料がある（売上サマリー・当月）なら画面と同じインフォグラフィック。ほかは今までどおりの表 */
      if (model && model.infographic) drawInfographic(pdf, model); else drawReport(pdf, model);
      pdf.save(fileBase()+'.pdf');
    }).catch(function(e){ console.warn('[sales-print] ベクターPDF不可→ラスターに切替:', e && e.message); rasterPdf(); });
  };
})();

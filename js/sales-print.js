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

  // 日本語TTF（複数候補・最初に取れたものを使用。取得後はキャッシュ）
  var FONT_URLS=[
    'https://cdn.jsdelivr.net/gh/minoryorg/Noto-Sans-CJK-JP@master/fonts/NotoSansCJKjp-Regular.ttf',
    'https://cdn.jsdelivr.net/npm/hakusyu-font@1.0.0/NotoSansJP-Regular.ttf',
    'https://raw.githubusercontent.com/minoryorg/Noto-Sans-CJK-JP/master/fonts/NotoSansCJKjp-Regular.ttf'
  ];
  function ab2b64(buf){ var bytes=new Uint8Array(buf), bin='', CH=0x8000; for(var i=0;i<bytes.length;i+=CH){ bin+=String.fromCharCode.apply(null, bytes.subarray(i,i+CH)); } return btoa(bin); }
  function loadJPFont(){
    if(window.__svJPFont) return Promise.resolve(window.__svJPFont);
    var i=0;
    function trynext(){
      if(i>=FONT_URLS.length) return Promise.reject(new Error('jp font unavailable'));
      var url=FONT_URLS[i++];
      return fetch(url).then(function(r){ if(!r.ok) throw new Error('http'); return r.arrayBuffer(); })
        .then(function(b){ if(b.byteLength<100000) throw new Error('too small'); window.__svJPFont=ab2b64(b); return window.__svJPFont; })
        .catch(function(){ return trynext(); });
    }
    return trynext();
  }

  // ===== A4ベクター描画（1枚に自動フィット・縮小のみ） =====
  function drawReport(pdf, model){
    var PW=210,PH=297,mL=12,mT=12,mR=12,mB=12, W=PW-mL-mR, availH=PH-mT-mB;
    var m={ titleH:10, kpiH:16, secTitleH:7, rowH:5.4, headH:5.8, gap:4.5, barsH:44 };
    function secH(sec){ if(sec.type==='table') return m.secTitleH + m.headH + sec.rows.length*m.rowH + m.gap; if(sec.type==='bars') return m.secTitleH + m.barsH + m.gap; return m.secTitleH+m.gap; }
    var reqH=m.titleH + ((model.kpis&&model.kpis.length)?m.kpiH:0) + model.sections.reduce(function(a,s){return a+secH(s);},0);
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

  window.svExportPdf=function(){
    if(!window.svReportModel){ rasterPdf(); return; }
    ensureJsPDF().then(loadJPFont).then(function(b64){
      var jsPDF=window.jspdf.jsPDF; var pdf=new jsPDF('p','mm','a4');
      pdf.addFileToVFS('svjp.ttf', b64); pdf.addFont('svjp.ttf','JP','normal');
      drawReport(pdf, window.svReportModel());
      pdf.save(fileBase()+'.pdf');
    }).catch(function(e){ console.warn('[sales-print] ベクターPDF不可→ラスターに切替:', e && e.message); rasterPdf(); });
  };
})();

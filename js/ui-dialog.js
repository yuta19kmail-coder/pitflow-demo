// ========================================
// ui-dialog.js — ブラウザ標準の prompt / confirm / alert をやめて、
//                アプリの中に自前のダイアログを出す共通部品
//
//   ⚠ このファイルの本体は  D:\Claude\CoreFlowアプリ\_shared\ui-dialog.js  です。
//      直す時はそこを直して、sync-shared.ps1 を実行して全アプリに配ること。
//      各アプリの js\ に入っているのは配られたコピー。直接直すと次の配布で消えます。
//      （2026-08-01：CoreNote と CoreBoard に同じものが2枚ある状態をやめ、
//        coreflow-icons.js と同じ「_shared が本体」の運用に統一した。中身は同一）
//
//   なぜ作ったか（2026-07-28）:
//     標準の prompt()/confirm() は「ブラウザ本体」が出す窓で、出ている間
//     ページのJSが完全に止まる。PCによっては窓が出るまでに数百ms〜数秒かかり
//     （内蔵GPU＋省電力／拡張機能の割り込み／外部モニタや拡大率でのフォーカス移動）、
//     さらに止まっている間 Firestore の更新が溜まって、閉じた瞬間にまとめて
//     再描画されるので「反応が悪い」体感になる。マシンによって差が出るのはこのため。
//     自前のダイアログなら JS は止まらず、描画も同じページの中で完結する。
//
//   使い方（どれも Promise を返す。await でも .then でもOK）
//     UI.prompt('ノートの名前は？', '新しいノート').then(v => { if(v==null)return; ... })
//     UI.confirm('カードを削除しますか？', {danger:true}).then(ok => { if(!ok)return; ... })
//     UI.alert('保存しました')
//   オプション: {title, detail, ok, cancel, danger, placeholder, multiline, selectAll, code}
//     code … エラー番号（'PF-1002'）。渡すとボタン行の左端に error：PF-1002 と出て、押すとコピーできる。
//            🔴 付けるのは「通らなかった」時だけ（決めごとは _shared\coreflow-errcode.js の頭）。
// ========================================
(function () {
  var ROOT=null, CUR=null;

  function css(){
    if(document.getElementById('uid-style'))return;
    var st=document.createElement('style'); st.id='uid-style';
    st.textContent=[
      '#uid-ov{position:fixed;inset:0;z-index:99000;display:none;align-items:center;justify-content:center;',
      '        background:rgba(6,10,14,.55);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}',
      '#uid-ov.open{display:flex}',
      '#uid-card{width:min(92vw,430px);background:var(--bg2,#161b22);border:1px solid var(--border,rgba(255,255,255,.12));',
      '          border-radius:14px;box-shadow:0 26px 70px rgba(0,0,0,.55);padding:20px 20px 16px;color:var(--text,#e6edf3);',
      '          font-family:inherit;animation:uid-in .12s ease-out}',
      '@keyframes uid-in{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}',
      '#uid-card h4{margin:0 0 6px;font-size:15.5px;font-weight:800;line-height:1.5}',
      '#uid-card .uid-d{font-size:12.5px;line-height:1.75;color:var(--text2,#9aa7b4);margin:0 0 14px;white-space:pre-wrap}',
      '#uid-card input[type=text],#uid-card textarea{width:100%;background:var(--bg3,#1d242e);border:1px solid var(--border,rgba(255,255,255,.12));',
      '          color:var(--text,#e6edf3);border-radius:9px;padding:9px 11px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box}',
      '#uid-card textarea{min-height:96px;resize:vertical;line-height:1.6}',
      '#uid-card input[type=text]:focus,#uid-card textarea:focus{border-color:var(--cf-app,var(--uid-acc,var(--acc,#94a3b8)))}',
      '#uid-card .uid-b{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}',
      '#uid-card .uid-b button{border:1px solid var(--border,rgba(255,255,255,.14));background:var(--bg3,#1d242e);color:var(--text,#e6edf3);',
      '          border-radius:9px;padding:9px 18px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}',
      '#uid-card .uid-b button:hover{border-color:var(--cf-app,var(--uid-acc,var(--acc,#94a3b8)))}',
      /* 🎨 2026-09-24 決定ボタンはアプリ色（ゆうた指定）。各アプリの index.html で --uid-acc／--uid-accd を1行指定する。
         --acc／--accd は他の共通部品も使うので、ダイアログ専用の --uid-* を先に見る。
         昔は無い時の色が CoreNote のピンク決め打ちで、6アプリがピンクになっていた。いまは無い時＝中立のグレー。
         --uid-pri-fg＝決定ボタンの文字色（ポータルの白寄りグレーは濃い文字にする） */
      '#uid-card .uid-b button.pri{background:var(--cf-app-d,var(--uid-accd,var(--accd,#475569)));border-color:var(--cf-app-d,var(--uid-accd,var(--accd,#475569)));color:var(--cf-app-fg,var(--uid-pri-fg,#fff))}',
      '#uid-card .uid-b button.pri:hover{filter:brightness(1.12)}',
      '#uid-card .uid-b button.danger{background:#dc2626;border-color:#dc2626;color:#fff}',
      '#uid-card .uid-b button.danger:hover{filter:brightness(1.12)}',
      /* 🔢 2026-08-17 エラー番号（ゆうた確定＝A案）。ボタンと同じ行の左端に、枠なしでサラッと。
         ⚠ 窓の高さを増やさないために、行を足さずにボタン行へ相乗りさせている。 */
      '#uid-card .uid-b .cf-ec{margin-right:auto;align-self:center}'
    ].join('');
    document.head.appendChild(st);
  }
  function ensure(){
    css();
    if(ROOT&&document.body.contains(ROOT))return ROOT;
    ROOT=document.createElement('div'); ROOT.id='uid-ov';
    ROOT.innerHTML='<div id="uid-card"></div>';
    ROOT.addEventListener('mousedown',function(ev){ if(ev.target===ROOT)cancel(); });
    /* ダイアログの中のキー操作は、アプリ側のショートカットに流さない
       （※document の capture で止めると入力欄にも届かなくなるので、ここで止める） */
    ROOT.addEventListener('keydown',function(ev){
      ev.stopPropagation();
      if(ev.key==='Escape'){ ev.preventDefault(); cancel(); return; }
      if(ev.key==='Enter'&&CUR&&CUR.opts.kind!=='prompt'){ ev.preventDefault(); close(true); }
    });
    document.body.appendChild(ROOT);
    return ROOT;
  }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function cancel(){ if(!CUR)return; close(CUR.opts.kind==='prompt'?null:false); }
  function close(val){
    if(!CUR)return;
    var r=CUR.resolve; CUR=null;
    if(ROOT)ROOT.classList.remove('open');
    try{ if(window.__uidLast&&window.__uidLast.focus)window.__uidLast.focus(); }catch(e){}
    /* 閉じた事を知らせる（CoreBoard は開いている間クラウドの更新を待たせているので、
       閉じた瞬間に溜めていた分を反映させたい・v0.13.3） */
    try{ document.dispatchEvent(new CustomEvent('uid:close')); }catch(e){}
    r(val);
  }
  /* 📅 2026-10-15 UI.prompt の入力の種類（opt.type）。例 UI.prompt('入庫日は？','2026-10-20',{type:'date'})
     渡さない時・知らない種類の時は今までどおり text（今までの呼び方はそのまま動く）。
     ⚠ 前は PitFlow が開いた直後に欄を date に差し替えていた（ask-pit.js pitAskDate） */
  var IN_TYPES={text:1,date:1,time:1,'datetime-local':1,month:1,number:1,email:1,tel:1,url:1,search:1};
  function inType(t){ t=String(t||'text').toLowerCase(); return IN_TYPES[t]?t:'text'; }
  function open(o){
    return new Promise(function(resolve){
      var ov=ensure(), card=document.getElementById('uid-card');
      try{ window.__uidLast=document.activeElement; }catch(e){}
      if(CUR){ var prev=CUR.resolve; CUR=null; prev(null); }      // 前のが開いていたら閉じる
      CUR={resolve:resolve, opts:o};
      var isInput=(o.kind==='prompt');
      var h='<h4>'+esc(o.title||'')+'</h4>';
      if(o.detail) h+='<div class="uid-d">'+esc(o.detail)+'</div>';
      if(isInput){
        h+= o.multiline
          ? '<textarea id="uid-in" placeholder="'+esc(o.placeholder||'')+'">'+esc(o.value||'')+'</textarea>'
          : '<input type="'+inType(o.type)+'" id="uid-in" value="'+esc(o.value||'')+'" placeholder="'+esc(o.placeholder||'')+'">';
      }
      h+='<div class="uid-b">';
      /* 🔢 2026-08-17 エラー番号。`code:'PF-1002'` を渡された時だけ出す（押すとコピー＝coreflow-errcode.js）。 */
      if(o.code) h+='<span class="cf-ec" data-ec="'+esc(o.code)+'" role="button" title="押すと番号をコピーします">error：'+esc(o.code)+'</span>';
      if(o.cancel!==false) h+='<button type="button" id="uid-no">'+esc(o.cancel||'やめる')+'</button>';
      h+='<button type="button" id="uid-ok" class="'+(o.danger?'danger':'pri')+'">'+esc(o.ok||(isInput?'OK':'はい'))+'</button></div>';
      card.innerHTML=h;
      ov.classList.add('open');

      var inp=document.getElementById('uid-in');
      document.getElementById('uid-ok').onclick=function(){ close(isInput?((inp&&inp.value)||''):true); };
      var no=document.getElementById('uid-no'); if(no)no.onclick=function(){ close(isInput?null:false); };
      if(inp){
        inp.onkeydown=function(ev){
          if(ev.key==='Enter'&&!(o.multiline&&!ev.ctrlKey&&!ev.metaKey)){ ev.preventDefault(); close(inp.value||''); }
        };
        setTimeout(function(){ try{ inp.focus(); var canSel=(inp.tagName==='TEXTAREA')||/^(text|search|tel|url)$/.test(inp.type||'text'); if(o.selectAll!==false&&canSel)inp.select(); }catch(e){} },10);
      } else {
        setTimeout(function(){ try{ document.getElementById('uid-ok').focus(); }catch(e){} },10);
      }
    });
  }
  /* ダイアログの外にフォーカスがある時だけ、キャプチャ段階で拾ってアプリに流さない */
  document.addEventListener('keydown',function(ev){
    if(!CUR)return;
    if(ROOT&&ROOT.contains(ev.target))return;          // 中のキーは ROOT 側で処理する
    if(ev.key==='Escape'){ ev.preventDefault(); ev.stopPropagation(); cancel(); return; }
    if(ev.key==='Enter'){ ev.preventDefault(); ev.stopPropagation(); if(CUR.opts.kind!=='prompt')close(true); return; }
    ev.stopPropagation();
  },true);

  /* 🔔 2026-10-17 共通のトースト（棚卸し C-10・ゆうた決定）
     前は約20通り（アプリの色で塗る／黒っぽい／自動更新だけ紫）で、エラーも2〜3秒で消えて番号を控えられなかった。
     🔴 見た目＝**黒地＋左にアプリの色の縦線**（色は画面の --cf-app）。エラー＝**赤い線＋番号を右下に＋押すまで残る**。
     使い方：UI.toast('保存しました')
             UI.toast('保存できませんでした', {code:'PF-0002'})   … code があればエラー（押すまで残る・番号は押すとコピー）
             UI.toast('止めました', {err:true})                  … 番号なしのエラー（同じく押すまで残る）
             UI.toast('消しました', {action:'元に戻す', onAction:fn, ms:5000})
     位置は画面の --cf-toast-bottom（下のバーがあるアプリは上げる）。ふつうの知らせは1つずつ入れ替わり、エラーは最大3つ積む。 */
  var TBOX=null, TNORM=null, TNORM_T=0;
  function tcss(){
    if(document.getElementById('uid-toast-style'))return;
    var st=document.createElement('style'); st.id='uid-toast-style';
    st.textContent=[
      '#uid-toasts{position:fixed;left:50%;bottom:var(--cf-toast-bottom,24px);transform:translateX(-50%);z-index:99500;',
      '  display:flex;flex-direction:column-reverse;align-items:center;gap:8px;pointer-events:none;width:max-content;max-width:min(92vw,520px)}',
      '.uid-t{pointer-events:auto;box-sizing:border-box;max-width:100%;background:#15181e;color:#eef1f5;',
      '  border:1px solid rgba(255,255,255,.10);border-left:4px solid var(--cf-app,#94a3b8);border-radius:10px;',
      '  padding:9px 14px 9px 13px;font-size:13px;font-weight:600;line-height:1.55;box-shadow:0 10px 30px rgba(0,0,0,.38);',
      '  display:flex;align-items:flex-start;gap:10px;font-family:inherit;animation:uid-tin .16s ease-out;cursor:default}',
      '@keyframes uid-tin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
      '.uid-t.out{opacity:0;transform:translateY(6px);transition:opacity .18s,transform .18s}',
      '.uid-t .uid-tm{flex:1 1 auto;min-width:0;white-space:pre-wrap;word-break:break-word;display:flex;flex-direction:column}',
      '.uid-t .uid-tm .cf-ec{align-self:flex-end;margin-top:2px;color:#9aa4b2}',
      '.uid-t.err{border-left-color:#ef4444;cursor:pointer}',
      '.uid-t .uid-tx{flex:0 0 auto;border:0;background:transparent;color:#9aa4b2;font-size:15px;line-height:1;padding:2px 0 0;cursor:pointer;font-family:inherit}',
      '.uid-t .uid-tx:hover{color:#fff}',
      '.uid-t .uid-ta{flex:0 0 auto;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;border-radius:7px;',
      '  padding:3px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;align-self:center}',
      '.uid-t .uid-ta:hover{border-color:var(--cf-app,#94a3b8)}'
    ].join('');
    (document.head||document.documentElement).appendChild(st);
  }
  function tbox(){
    tcss();
    if(TBOX&&document.body&&document.body.contains(TBOX))return TBOX;
    TBOX=document.createElement('div'); TBOX.id='uid-toasts'; TBOX.setAttribute('aria-live','polite');
    (document.body||document.documentElement).appendChild(TBOX);
    return TBOX;
  }
  function tdrop(el){
    if(!el||!el.parentNode)return;
    el.classList.add('out');
    setTimeout(function(){ try{ if(el.parentNode)el.parentNode.removeChild(el); }catch(e){} },190);
    if(el===TNORM)TNORM=null;
  }
  function toast(msg,opt){
    if(typeof opt==='string')opt={code:opt};
    opt=opt||{};
    var box=tbox(), isErr=!!(opt.code||opt.err);
    var el=document.createElement('div'); el.className='uid-t'+(isErr?' err':'');
    el.setAttribute('role',isErr?'alert':'status');
    var m=document.createElement('div'); m.className='uid-tm';
    var tx=document.createElement('span'); tx.textContent=String(msg==null?'':msg); m.appendChild(tx);
    if(opt.code){
      var ec;
      if(window.CFErr&&window.CFErr.el)ec=window.CFErr.el(opt.code);
      else{ ec=document.createElement('span'); ec.className='cf-ec'; ec.setAttribute('data-ec',opt.code); ec.setAttribute('role','button'); ec.title='押すと番号をコピーします'; ec.textContent='error：'+opt.code; }
      m.appendChild(ec);
    }
    el.appendChild(m);
    if(opt.action){
      var a=document.createElement('button'); a.type='button'; a.className='uid-ta'; a.textContent=opt.action;
      a.onclick=function(ev){ ev.stopPropagation(); tdrop(el); try{ if(opt.onAction)opt.onAction(); }catch(e){} };
      el.appendChild(a);
    }
    if(isErr){
      var x=document.createElement('button'); x.type='button'; x.className='uid-tx'; x.setAttribute('aria-label','閉じる'); x.textContent='×';
      el.appendChild(x);
      el.addEventListener('click',function(){ tdrop(el); });   /* 番号を押した時はコピーだけ（coreflow-errcode.js が先に受けて止める） */
      var errs=box.querySelectorAll('.uid-t.err:not(.out)'); if(errs.length>=3)tdrop(errs[0]);
      box.appendChild(el);
    } else {
      if(TNORM)tdrop(TNORM);
      clearTimeout(TNORM_T);
      TNORM=el; box.appendChild(el);
      TNORM_T=setTimeout(function(){ tdrop(el); }, opt.ms>0?opt.ms:2400);
    }
    return { el:el, close:function(){ tdrop(el); } };
  }

  window.UI={
    isOpen:function(){ return !!CUR; },
    toast:toast,
    prompt:function(title,value,opt){ opt=opt||{}; opt.kind='prompt'; opt.title=title; opt.value=(value==null?'':value); return open(opt); },
    confirm:function(title,opt){ opt=opt||{}; opt.kind='confirm'; opt.title=title; return open(opt); },
    alert:function(title,opt){ opt=opt||{}; opt.kind='alert'; opt.title=title; opt.cancel=false; opt.ok=opt.ok||'OK'; return open(opt); },
    close:function(){ close(null); }
  };
})();

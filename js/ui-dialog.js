// ========================================
// ui-dialog.js — ブラウザ標準の prompt / confirm / alert をやめて、
//                アプリの中に自前のダイアログを出す共通部品
//
//   ⚠ このファイルの本体は  D:\Claude\アプリ開発\_shared\ui-dialog.js  です。
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
      '#uid-card input[type=text]:focus,#uid-card textarea:focus{border-color:var(--acc,#ec4899)}',
      '#uid-card .uid-b{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}',
      '#uid-card .uid-b button{border:1px solid var(--border,rgba(255,255,255,.14));background:var(--bg3,#1d242e);color:var(--text,#e6edf3);',
      '          border-radius:9px;padding:9px 18px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}',
      '#uid-card .uid-b button:hover{border-color:var(--acc,#ec4899)}',
      '#uid-card .uid-b button.pri{background:var(--accd,#db2777);border-color:var(--accd,#db2777);color:#fff}',
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
          : '<input type="text" id="uid-in" value="'+esc(o.value||'')+'" placeholder="'+esc(o.placeholder||'')+'">';
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
        setTimeout(function(){ try{ inp.focus(); if(o.selectAll!==false)inp.select(); }catch(e){} },10);
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

  window.UI={
    isOpen:function(){ return !!CUR; },
    prompt:function(title,value,opt){ opt=opt||{}; opt.kind='prompt'; opt.title=title; opt.value=(value==null?'':value); return open(opt); },
    confirm:function(title,opt){ opt=opt||{}; opt.kind='confirm'; opt.title=title; return open(opt); },
    alert:function(title,opt){ opt=opt||{}; opt.kind='alert'; opt.title=title; opt.cancel=false; opt.ok=opt.ok||'OK'; return open(opt); },
    close:function(){ close(null); }
  };
})();

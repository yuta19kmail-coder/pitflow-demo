/* ============================================
   CoreFlow アプリランチャー（共通：全アプリで同一）

   ⚠ このファイルの本体は  D:\Claude\アプリ開発\_shared\launcher.js  です。
      直す時はそこを直して、sync-shared.ps1 を実行して全アプリに配ること。
      各アプリの js\ に入っているのは配られたコピー。直接直すと次の配布で消えます。
      （2026-08-01：9アプリに手で配る＋?v= を手で上げる運用をやめ、_shared 本体に統一。
        ?v= はファイルの中身のハッシュから sync-shared.ps1 が自動で書き換える）

   v2.5（2026-08-01）：①**閉じている時のトリガーの丸を「C」から CoreFlow の丸ロゴに**。
     開いた時に中心へ出る太陽と同じ作り（暗い丸＋うすい枠）＝開く前と後で見た目がつながる。
     画像が読めなかった時は今までどおり「C」に戻る。
     ②準備中アプリの知らせを**ブラウザ標準の alert からアプリ内ダイアログ（UI.alert）へ**。
   v2.4（2026-07-31）：PitFlow のリンク先を本番の独自ドメイン（pitflow.kobayashi-motors.com）に変更。
   v2.3（2026-07-30）：球のアイコンを絵文字→正式の丸ロゴ画像に差し替え。
     画像は CoreFlow の /icons/ に置いた1組を全アプリで共有（＝直すのはCoreFlowの1箇所だけ）。
     読めなかった時は今までどおり絵文字にフォールバックする。CSS(launcher.css)は無改修
     ＝必要な指定はこのファイルが <style> を注入する。
   v2.2（2026-07-04）：中心＝CoreFlow（太陽・クリックでCoreFlowへ）＋公転2周。
     内周(Flow系)：MHS / PitFlow / CarFlow / StockFlow
     外周(Core系＋Money)：CoreBoard / CoreNote / CoreTools / CoreMembers / CoreTemplate / MoneyFlow
   ラベルは普段隠し、球ホバーで表示。中心に太陽(CoreFlow)を表示。
   ============================================ */
(function(){
  const COREFLOW_URL = 'https://coreflow.kobayashi-motors.com';
  // 丸アイコンの置き場（CoreFlow中央配信）。差し替えたら ICON_V を上げれば全アプリに伝わる。
  const ICON_BASE = COREFLOW_URL + '/icons/';
  const ICON_V    = '1';
  const iconURL = (key)=> ICON_BASE + key + '.png?v=' + ICON_V;

  const APPS = [
    { key:'mhs',        url:'https://mhs.kobayashi-motors.com',       icon:'📅', name:'MHS',        color:'#dc2626', dx:0,   dy:-150 },
    { key:'pitflow',    url:'https://pitflow.kobayashi-motors.com',   icon:'🔧', name:'PitFlow',    color:'#1db97a', dx:68,  dy:-134 },
    { key:'carflow',    url:'https://carflow.kobayashi-motors.com',           icon:'🚙', name:'CarFlow',    color:'#378ADD', dx:121, dy:-88  },
    { key:'stockflow',  url:'https://stockflow.kobayashi-motors.com',         icon:'📦', name:'StockFlow',  color:'#7c3aed', dx:148, dy:-23  },
    { key:'coreboard',  url:'https://coreboard.kobayashi-motors.com', icon:'📋', name:'CoreBoard',  color:'#06b6d4', dx:8,   dy:-235 },
    { key:'corenote',   url:'https://corenote.kobayashi-motors.com',          icon:'📝', name:'CoreNote',   color:'#ec4899', dx:74,  dy:-223 },
    { key:'coretools',  url:'https://coretools.kobayashi-motors.com', icon:'🧰', name:'CoreTools',  color:'#64748b', dx:134, dy:-193 },
    { key:'coremembers',url:'https://coremembers.kobayashi-motors.com',                                               icon:'👥', name:'CoreMembers',color:'#ea580c', dx:183, dy:-147 },
    { key:'coretemplate',url:'https://coretemplate.kobayashi-motors.com',                                             icon:'💬', name:'CoreTemplate',color:'#6366f1', dx:217, dy:-90  },
    { key:'moneyflow',  url:'',                                               icon:'💴', name:'MoneyFlow',  color:'#e0a92b', dx:234, dy:-25  },
  ];

  function escAttr(s){ return String(s).replace(/"/g,'&quot;'); }

  /* v2.3：画像用の指定だけをここで注入（launcher.css は各アプリ配布物なので触らない） */
  function injectCSS(){
    if(document.getElementById('cf-launcher-img-css')) return;
    const st = document.createElement('style');
    st.id = 'cf-launcher-img-css';
    st.textContent =
      '.cf-lo-ball>img{width:100%;height:100%;border-radius:50%;display:block;object-fit:cover;pointer-events:none;-webkit-user-drag:none;user-select:none}' +
      '.cf-lo-sun>img{width:88%;height:88%;display:block;object-fit:contain;pointer-events:none;-webkit-user-drag:none;user-select:none}' +
      /* v2.5：閉じている時の丸。launcher.css が古いままでもロゴが正しく出るように、ここでも指定する */
      '.cf-lg-logo{width:28px;height:28px;border-radius:50%;background:#0e1116;border:1.5px solid rgba(255,255,255,.22);'+
      'box-shadow:0 2px 8px rgba(0,0,0,.5);box-sizing:border-box;padding:3px;display:flex;align-items:center;justify-content:center;'+
      'font-weight:800;color:#fff;font-size:11px;background-image:none}' +
      '.cf-lg-logo>img{width:100%;height:100%;display:block;object-fit:contain;pointer-events:none;-webkit-user-drag:none;user-select:none}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* 画像が読めなかった球だけ、そっと絵文字に戻す */
  function fallback(overlay){
    overlay.querySelectorAll('img[data-cf-emoji]').forEach(function(img){
      img.addEventListener('error', function(){
        const em = img.getAttribute('data-cf-emoji') || '';
        const host = img.parentNode;
        if(host){ img.remove(); host.textContent = em; }
      });
    });
  }

  function init(){
    const mount = document.querySelector('[data-cf-launcher]');
    if(!mount) return;
    const currentApp = (mount.getAttribute('data-current')||'').toLowerCase();

    mount.innerHTML =
      '<div class="cf-launcher-trigger" id="cf-trigger" title="CoreFlow（クリックで玄関へ／ホバーでアプリ切替）">' +
        '<div class="cf-lg-logo"><img src="'+escAttr(iconURL('coreflow'))+'" alt="CoreFlow" data-cf-emoji="C" draggable="false"></div>' +
        '<div class="cf-lg-text">' +
          '<span class="cf-l1">CoreFlow</span>' +
          '<span class="cf-l2">アプリ切替</span>' +
        '</div>' +
        '<span class="cf-lg-arrow">›</span>' +
      '</div>';

    const overlay = document.createElement('div');
    overlay.id = 'cf-launcher-overlay';
    let ballsHTML = '';
    APPS.forEach((a, idx)=>{
      const isCurrent = (a.key === currentApp);
      const hasUrl = !!a.url;
      const disabled = isCurrent || !hasUrl;
      const itemClasses = 'cf-lo-item' + (isCurrent ? ' cf-current' : '');
      const delay = (0.03 * idx).toFixed(2);
      ballsHTML += (
        '<div class="'+itemClasses+'" style="--dx:'+a.dx+'px;--dy:'+a.dy+'px;--d:'+delay+'s">' +
          '<a class="cf-lo-ball cf-'+escAttr(a.key)+'" ' +
            (hasUrl && !isCurrent ? 'href="'+escAttr(a.url)+'" ' : '') +
            'data-app="'+escAttr(a.key)+'" ' +
            'data-color="'+escAttr(a.color)+'" ' +
            'data-url="'+escAttr(a.url||'')+'" ' +
            (disabled ? 'aria-disabled="true" ' : '') +
            '><img src="'+escAttr(iconURL(a.key))+'" alt="'+escAttr(a.name)+'" data-cf-emoji="'+escAttr(a.icon)+'" draggable="false"></a>' +
          '<span class="cf-lo-label">'+escAttr(a.name)+'</span>' +
        '</div>'
      );
    });
    overlay.innerHTML =
      '<div class="cf-lo-backdrop"></div>' +
      '<div class="cf-lo-flood"></div>' +
      '<div class="cf-lo-catcher"></div>' +
      '<div class="cf-lo-hotzone">' +
        '<div class="cf-lo-stage" aria-hidden="true">' +
          '<a class="cf-lo-sun" ' + (currentApp === 'coreflow' ? '' : 'href="'+COREFLOW_URL+'" ') + 'data-app="coreflow" title="CoreFlow（玄関へ）">' +
          '<img src="'+escAttr(iconURL('coreflow'))+'" alt="CoreFlow" data-cf-emoji="🏠" draggable="false">' +
        '</a>' +
          '<span class="cf-lo-sunlabel">CoreFlow</span>' +
          ballsHTML +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    injectCSS();
    fallback(overlay);
    fallback(mount);      /* v2.5：閉じている時の丸も、画像が読めなければ「C」に戻す */

    const root    = document.body;
    const trigger = document.getElementById('cf-trigger');
    const catcher = overlay.querySelector('.cf-lo-catcher');
    const hotzone = overlay.querySelector('.cf-lo-hotzone');
    const flood   = overlay.querySelector('.cf-lo-flood');
    let closeTimer = null;

    function setOpen(on){
      if(on){ root.classList.add('cf-open'); }
      else { root.classList.remove('cf-open'); root.classList.remove('cf-flooding'); }
    }
    function cancelClose(){ if(closeTimer){ clearTimeout(closeTimer); closeTimer = null; } }
    function scheduleClose(){
      cancelClose();
      closeTimer = setTimeout(function(){ setOpen(false); closeTimer = null; }, 220);
    }

    trigger.addEventListener('mouseenter', function(){ cancelClose(); setOpen(true); });
    trigger.addEventListener('mouseleave', function(){ scheduleClose(); });
    hotzone.addEventListener('mouseenter', cancelClose);
    hotzone.addEventListener('mouseleave', scheduleClose);

    trigger.addEventListener('click', function(e){
      e.stopPropagation();
      if(currentApp === 'coreflow') return;
      window.location.href = COREFLOW_URL;
    });
    catcher.addEventListener('click', function(){ cancelClose(); setOpen(false); });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){ cancelClose(); setOpen(false); }
    });

    function setFlood(ball){
      if(!ball){ root.classList.remove('cf-flooding'); return; }
      const r = ball.getBoundingClientRect();
      flood.style.setProperty('--cf-fx', (r.left + r.width/2) + 'px');
      flood.style.setProperty('--cf-fy', (r.top  + r.height/2) + 'px');
      flood.style.setProperty('--cf-fcolor', ball.dataset.color || '#fff');
      root.classList.remove('cf-flooding');
      requestAnimationFrame(function(){ void flood.offsetWidth; root.classList.add('cf-flooding'); });
    }

    overlay.querySelectorAll('.cf-lo-ball').forEach(function(b){
      b.addEventListener('mouseenter', function(){ cancelClose(); setFlood(b); });
      b.addEventListener('mouseleave', function(){ setFlood(null); });
      b.addEventListener('click', function(e){
        const url = b.dataset.url;
        const isDisabled = b.getAttribute('aria-disabled') === 'true';
        const isCurrent  = (b.dataset.app === currentApp);
        if(isCurrent){ e.preventDefault(); return; }
        if(!url || isDisabled){
          e.preventDefault();
          var nm = (b.querySelector('img') && b.querySelector('img').getAttribute('alt')) || b.dataset.app;
          /* ブラウザ標準の alert は出ている間ページが止まる（PCによっては固まって見える）ので使わない。
             ui-dialog.js が入っていないアプリのためだけに、最後の逃げ道として標準を残してある。 */
          if(window.UI && UI.alert){ UI.alert(nm + ' は準備中です。'); }
          else { alert(nm + ' は準備中です。'); }
          return;
        }
      });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();

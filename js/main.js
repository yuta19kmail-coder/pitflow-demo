/* ========================================
   main.js
   起動処理
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {
  if (window.pitAutoArchive) pitAutoArchive();   // 古い未入庫を自動アーカイブ
  showView('dashboard');

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });

  // レンジタブ（予約・返車それぞれ独立）
  document.querySelectorAll('.range-tabs').forEach(tabs => {
    const mode = tabs.dataset.mode || 'reserve';
    tabs.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        tabs.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        if (mode === 'reserve'){
          state.reserveRange = b.dataset.range;
          renderReserve();
        } else if (mode === 'return'){
          state.returnRange = b.dataset.range;
          renderReturn();
        }
      });
    });
  });

  // お知らせの未読の丸を出す
  if (window.pitNewsRefreshBadge) setTimeout(pitNewsRefreshBadge, 400);

  console.log('PitFlow ready');
});

/* ========================================
   help.js  -  PitFlow ヘルプ（専用サイドバー＋本文の描画・切替・検索）
   showView('help') → renderHelp() で起動。中身は help-content.js の HELP_NAV / HELP_CONTENTS。
   ======================================== */
(function () {
  var _built = false;
  var _cur = 'overview';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  function renderHelp() {
    var host = document.getElementById('view-help-body'); if (!host) return;
    if (!_built) { build(host); _built = true; }
    showHelpSection(_cur);
  }
  window.renderHelp = renderHelp;

  function build(host) {
    var nav = window.HELP_NAV || [];
    var contents = window.HELP_CONTENTS || {};
    var sb = '<div class="help-sb-search-wrap"><input class="help-sb-search"type="search"autocomplete="off"placeholder="ヘルプ内を検索"oninput="onHelpSearch(this.value)"></div>';
    nav.forEach(function (g) {
      sb += '<div class="help-sb-cat">' + esc(g.cat) + '</div>';
      g.items.forEach(function (it) {
        sb += '<div class="help-sb-item" data-section="' + esc(it.id) + '" onclick="showHelpSection(\'' + esc(it.id) + '\')">' + esc(it.label) + '</div>';
      });
    });
    var content = '<button class="help-mobile-toggle vh-btn" onclick="toggleHelpSidebar()"><i data-ic=menu data-ics=15></i> 目次</button>';
    nav.forEach(function (g) {
      g.items.forEach(function (it) {
        var html = contents[it.id];
        content += '<div class="help-sec" data-section="' + esc(it.id) + '">' + (typeof html === 'string' ? html : '<div class="help-wip"><i data-ic=pencil data-ics=16></i> このセクションは準備中です。</div>') + '</div>';
      });
    });
    host.innerHTML = '<div class="help-layout"><aside class="help-sidebar" id="help-sidebar">' + sb + '</aside><div class="help-content" id="help-content">' + content + '</div></div>';
  }

  window.showHelpSection = function (id) {
    if (!id) id = 'overview';
    _cur = id;
    document.querySelectorAll('.help-sb-item').forEach(function (el) { el.classList.toggle('active', el.dataset.section === id); });
    document.querySelectorAll('.help-sec').forEach(function (el) { el.classList.toggle('active', el.dataset.section === id); });
    document.body.classList.remove('help-sb-open');
    var c = document.getElementById('help-content'); if (c) c.scrollTop = 0;
  };

  window.toggleHelpSidebar = function () { document.body.classList.toggle('help-sb-open'); };

  window.onHelpSearch = function (q) {
    var query = String(q || '').trim().toLowerCase();
    var contents = window.HELP_CONTENTS || {};
    if (!query) {
      document.querySelectorAll('.help-sb-item, .help-sb-cat').forEach(function (el) { el.style.display = ''; });
      return;
    }
    document.querySelectorAll('.help-sb-item').forEach(function (el) {
      var id = el.dataset.section;
      var label = (el.textContent || '').toLowerCase();
      var body = (typeof contents[id] === 'string') ? contents[id].toLowerCase() : '';
      el.style.display = (label.indexOf(query) >= 0 || body.indexOf(query) >= 0) ? '' : 'none';
    });
    // 見出し（カテゴリ）は、配下に見えている項目があれば表示
    document.querySelectorAll('.help-sb-cat').forEach(function (cat) {
      var next = cat.nextElementSibling, has = false;
      while (next && !next.classList.contains('help-sb-cat')) {
        if (next.classList.contains('help-sb-item') && next.style.display !== 'none') { has = true; break; }
        next = next.nextElementSibling;
      }
      cat.style.display = has ? '' : 'none';
    });
  };
})();

/* ========================================
   maintdash.js  -  整備ダッシュボード（工場ぜんたいの把握）/ PitFlow v0.40.0
   ----------------------------------------
   ◎ねらい：工場側の全体把握＋両課(1課/2課)の情報共有とモチベアップ
     ・今月/今週「上げた」台数・金額（＝作業完了 or 返車完了）
     ・今週まだやらなきゃいけない「残」台数・金額（＝未完了で今週中が返車予定）
     ・預かりが長くなっているクルマのアラート（＝在庫車の工程の詰まり）
   ◎課の判定：c.division(div1/div2) があればそれ／無ければ boardId(国産=1課 / 輸入=2課)
   ◎金額：amountFinal(確定) → estAmount(概算) → pitEstAmount(タイプ平均) の順で取得
   ======================================== */

function _mdCourse(c){
  if (c.division === 'div1' || c.division === 'div2') return c.division;
  return c.boardId === 'import' ? 'div2' : 'div1';
}
function _mdAmount(c){
  if (c.amountFinal != null) return c.amountFinal;
  if (c.estAmount   != null) return c.estAmount;
  return window.pitEstAmount ? pitEstAmount(c.workType, window.pitTeamKey?pitTeamKey(c):'default') : 0;
}
/* 🔴 v1.99.0 「売上なしでアーカイブ」した車は、完了にも残にも数えない（物差し＝pitCardNoSale） */
function _mdNoSale(c){ return !!(window.pitCardNoSale && pitCardNoSale(c)); }
function _mdDone(c){   return !_mdNoSale(c) && (c.status === 'workDone' || c.status === 'returned'); }
function _mdInShop(c){ return !_mdNoSale(c) && ['check','estim','contact','parts','work'].indexOf(c.status) >= 0; }
function _mdPd(s){ const p = String(s||'').split('-'); return new Date(+p[0], (+p[1])-1, +p[2]); }
function _mdEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _mdMan(n){ return (Math.round(n/1000)/10).toLocaleString() + '万'; }
function _mdYen(n){ return '¥' + Math.round(n).toLocaleString(); }

function _mdCalc(divId, cards, moS, moE, wkS, wkE){
  let mC=0,mA=0, wC=0,wA=0, rC=0,rA=0;
  cards.forEach(function(c){
    if (_mdCourse(c) !== divId) return;
    if (_mdNoSale(c)) return;   /* 🔴 v1.99.0 売上なし＝完了にも残にも数えない */
    const amt = _mdAmount(c);
    if (_mdDone(c)){
      /* 🔴 v1.61.0 数える日は物差し1本（js/sales-count.js）から。返車済み＝実績カウント日／作業完了＝返車予定日 */
      const dt = (window.pitSalesCountDate ? pitSalesCountDate(c) : '') || c.returnDate || c.reserveDate || '';
      if (dt >= moS && dt <= moE){ mC++; mA += amt; }
      if (dt >= wkS && dt <= wkE){ wC++; wA += amt; }
    } else if (c.status !== 'scrap'){
      // 今週やらなきゃいけない残＝未完了で「今週末まで」が返車予定（過去＝超過も含む）
      const due = c.returnDate || '';
      if (due && due <= wkE){ rC++; rA += amt; }
    }
  });
  return { mC, mA, wC, wA, rC, rA };
}

function renderMaintDash(){
  const wrap = document.getElementById('view-maintdash-body');
  if (!wrap) return;
  const cards = state.cards || [];
  const today = new Date(); today.setHours(0,0,0,0);
  const tStr  = ymd(today);
  const dow   = '日月火水木金土'[today.getDay()];
  const wkS = ymd(startOfWeek(today));
  const wkE = ymd(addDays(startOfWeek(today), 6));
  const moS = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
  const moE = ymd(new Date(today.getFullYear(), today.getMonth()+1, 0));
  const longN = (state.settings && state.settings.longHoldDays) || 7;

  const divs = (state.divisions || [
    { id:'div1', label:'1課', color:'#1db97a' },
    { id:'div2', label:'2課', color:'#ec4899' },
  ]);
  const teamName = { div1:'<i data-ic=car data-ics=16></i> 国産チーム', div2:'<i data-ic=globe data-ics=16></i> 輸入チーム' };

  const calc = {};
  divs.forEach(function(d){ calc[d.id] = _mdCalc(d.id, cards, moS, moE, wkS, wkE); });
  const tot = { mC:0,mA:0,wC:0,wA:0,rC:0,rA:0 };
  divs.forEach(function(d){ const x=calc[d.id]; tot.mC+=x.mC;tot.mA+=x.mA;tot.wC+=x.wC;tot.wA+=x.wA;tot.rC+=x.rC;tot.rA+=x.rA; });

  // 長期預かりアラート（在庫車・工程が進行中で日数が経っているもの）
  const longs = [];
  cards.forEach(function(c){
    if (!_mdInShop(c) || !c.reserveDate) return;
    const held = Math.round((today - _mdPd(c.reserveDate)) / 86400000);
    if (held >= longN) longs.push({ c: c, held: held });
  });
  longs.sort(function(a,b){ return b.held - a.held; });

  let h = '';

  // 見出し
  h += '<div class="md-top"><div class="dash-date">' + (today.getMonth()+1) + '月' + today.getDate() + '日（' + dow + '）の工場ぜんたい</div>'
     + '<div class="md-period">今月 ' + moS.slice(5).replace('-','/') + '〜' + moE.slice(5).replace('-','/') + ' ／ 今週 ' + wkS.slice(5).replace('-','/') + '〜' + wkE.slice(5).replace('-','/') + '</div></div>';

  // 工場ぜんたい KPI（両課の合計）
  h += '<div class="md-kpis">';
  h += _mdKpi('<i data-ic=flag data-ics=16></i>', '今月 上げた', tot.mC, '台', _mdMan(tot.mA) + '円', '');
  h += _mdKpi('<i data-ic=calendar data-ics=16></i>', '今週 上げた', tot.wC, '台', _mdMan(tot.wA) + '円', '');
  h += _mdKpi('<i data-ic=wrench data-ics=16></i>', '今週 残り', tot.rC, '台', _mdMan(tot.rA) + '円', tot.rC > 0 ? 'warn' : 'ok');
  h += _mdKpi('<i data-ic=hourglass data-ics=15></i>', '長期 預かり', longs.length, '台', longN + '日以上', longs.length > 0 ? 'alert' : 'ok');
  h += '</div>';

  // 課別の対比（情報共有＆モチベ）
  h += '<div class="md-courses">';
  divs.forEach(function(d){
    const x = calc[d.id];
    h += '<div class="md-course" style="--cc:' + d.color + '">';
    h += '<div class="md-course-head"><span class="md-course-pill" style="background:' + d.color + '">' + d.label + '</span><span class="md-course-team">' + (teamName[d.id] || '') + '</span></div>';
    h += '<div class="md-course-grid">';
    h += '<div class="md-cell"><div class="md-cell-l">今月 上げた</div><div class="md-cell-v"><b>' + x.mC + '</b>台</div><div class="md-cell-a">' + _mdMan(x.mA) + '円</div></div>';
    h += '<div class="md-cell"><div class="md-cell-l">今週 上げた</div><div class="md-cell-v"><b>' + x.wC + '</b>台</div><div class="md-cell-a">' + _mdMan(x.wA) + '円</div></div>';
    h += '<div class="md-cell' + (x.rC > 0 ? ' md-cell-rem' : '') + '"><div class="md-cell-l">今週 残り</div><div class="md-cell-v"><b>' + x.rC + '</b>台</div><div class="md-cell-a">' + _mdMan(x.rA) + '円</div></div>';
    h += '</div></div>';
  });
  h += '</div>';

  // ⏳ 長期預かりアラート
  h += '<div class="dash-card md-alert-card">';
  h += '<div class="dash-h"><span><i data-ic=hourglass data-ics=15></i> 預かりが長くなっているクルマ</span><span class="dash-note">入庫から ' + longN + '日以上 たった在庫車（工程の詰まり）／日数の長い順</span></div>';
  if (!longs.length){
    h += '<div class="md-alert-none">長期の預かりはありません <i data-ic=thumbUp data-ics=16></i> 工程はスムーズです</div>';
  } else {
    h += '<div class="md-alert-list">';
    longs.forEach(function(o){
      const c = o.c;
      const d = divs.find(function(x){ return x.id === _mdCourse(c); }) || { label:'', color:'#888' };
      const sev = o.held >= longN*2 ? ' md-sev2' : '';
      h += '<div class="md-alert-row' + sev + '" onclick="openCard(\'' + c.id + '\',\'page\')">';
      h += '<div class="md-alert-days"><b>' + o.held + '</b><span>日</span></div>';
      h += '<div class="md-alert-main"><div class="md-alert-car">' + _mdEsc(c.car || '車両') + ' <span class="md-alert-cust">' + _mdEsc(c.customer || '') + '</span></div>'
         + '<div class="md-alert-sub">' + _mdEsc(c.plate || '') + ' ・ ' + _mdEsc(c.menu || '') + '</div></div>';
      h += '<div class="md-alert-tags"><span class="md-alert-div" style="background:' + d.color + '">' + d.label + '</span>'
         + '<span class="md-alert-st" style="color:' + statusColor(c.status) + ';border-color:' + statusColor(c.status) + '">' + statusLabel(c.status) + '</span></div>';
      h += '</div>';
    });
    h += '</div>';
  }
  h += '</div>';

  h += '<div class="dash-foot">「上げた」＝作業完了／返車完了。金額は<b>確定額があれば確定・無ければ概算</b>（作業タイプ別の平均単価）で集計しています。月末締めの実績集計は次フェーズ。</div>';

  wrap.innerHTML = h;
}

function _mdKpi(icon, label, num, unit, sub, mod){
  return '<div class="md-kpi' + (mod ? ' md-kpi-' + mod : '') + '"><div class="md-kpi-ic">' + icon + '</div>'
       + '<div class="md-kpi-num">' + num + '<span>' + unit + '</span></div>'
       + '<div class="md-kpi-l">' + label + '</div>'
       + '<div class="md-kpi-sub">' + sub + '</div></div>';
}

window.renderMaintDash = renderMaintDash;

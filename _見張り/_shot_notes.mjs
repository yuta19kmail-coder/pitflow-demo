/* 🧪 付箋ボードの見た目を撮る（人が見る用・見張りではない）。 PORT=8971 SHOT_DIR=... node _見張り/_shot_notes.mjs */
import { chromium } from 'playwright';
import { chromePath } from './_chrome.mjs';
import path from 'path';

const PORT = process.env.PORT || 8971;
const OUT = process.env.SHOT_DIR || '.';
const b = await chromium.launch({ executablePath: chromePath() });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.addInitScript(() => { try { localStorage.setItem('pitflow_sample_authed', '1'); } catch (e) {} });
await p.goto('http://127.0.0.1:' + PORT + '/index.html?demo=1&nonews=1');
await p.waitForFunction('window.state && window.CFNoteBoard && window.renderBoardNotes', null, { timeout: 30000 });
await p.waitForTimeout(1200);
await p.evaluate(() => {
  const S = state.staff.filter(s => !s.isSelf);
  const NOW = Date.now(), DAY = 86400000;
  state.boardNotes = [
    { id: 'd1', title: '急ぎ洗車', body: '来店予定あり、本日午後までに洗ってほしいです', color: 'red', noteType: 'execute', memberUids: [S[0].id, S[1].id], authorUid: S[1].id, status: 'open', order: 1, createdAt: NOW - 3600000, deadline: new Date(NOW).toISOString().slice(0, 10), replies: [{ id: 'r1', uid: S[0].id, text: '了解です、13時にやります', at: NOW - 600000 }] },
    { id: 'd2', title: '朝礼の連絡', body: '明日は 8:30 集合です', color: 'blue', noteType: 'circulate', memberUids: [S[0].id, S[1].id, S[2].id], doneByUids: [S[1].id], authorUid: S[0].id, status: 'open', order: 2, createdAt: NOW - 7200000 },
    { id: 'd3', title: '部品の返品', body: '昨日済ませました', color: 'green', status: 'done', doneAt: NOW - DAY, doneByUid: S[0].id, order: 3, memberUids: [S[0].id], authorUid: S[1].id },
    { id: 'd4', title: '5日前に済んだ付箋', body: '', color: 'yellow', status: 'done', doneAt: NOW - 5 * DAY, order: 4, memberUids: [], authorUid: S[1].id },
    { id: 'd5', title: '自分用メモ', body: '見積の出し直し', color: 'orange', memberUids: [S[0].id], authorUid: S[0].id, secret: true, status: 'open', order: 5 }
  ];
  try { localStorage.setItem('pitflow_bn_me', S[0].id); } catch (e) {}
  window.PIT_BN_TARGET = 'board-notes-area';
  showView('dashboard');
  renderBoardNotes();
});
await p.waitForTimeout(500);
const area = await p.$('#board-notes-area');
if (area) { await area.scrollIntoViewIfNeeded(); await area.screenshot({ path: path.join(OUT, 'notes_board.png') }); }
await p.click('.bn-done-btn');
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(OUT, 'notes_done_list.png') });
await p.evaluate(() => CFNoteBoard._close('cfnb-done'));
await p.evaluate(() => CFNoteBoard.openEditor(null));
await p.waitForTimeout(300);
await p.screenshot({ path: path.join(OUT, 'notes_editor.png') });
await b.close();
console.log('shots done');

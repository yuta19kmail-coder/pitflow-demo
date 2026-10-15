/* 見張りの偽クラウド用：Firestore の set(ref, body, {mergeFields}) をまねる（v2.185.0）
   ・opt が無い／mergeFields が無い＝丸ごと置き換え
   ・mergeFields の各住所（'a' や 'a.b'・FieldPath 代わりの文字）だけを body から写す
   ・値が '@del'（見張りの FieldValue.delete() の代わり）か undefined なら、その欄を消す
   手本＝CoreBoard\_harness.mjs の storeSet */
export function mergeSet(prev, body, opt) {
  if (!opt || !opt.mergeFields) return JSON.parse(JSON.stringify(body));
  const doc = prev ? JSON.parse(JSON.stringify(prev)) : {};
  opt.mergeFields.forEach(p => {
    const ks = String(p).split('.');
    let src = body, dst = doc;
    for (let i = 0; i < ks.length - 1; i++) {
      src = src ? src[ks[i]] : undefined;
      if (dst[ks[i]] == null || typeof dst[ks[i]] !== 'object') dst[ks[i]] = {};
      dst = dst[ks[i]];
    }
    const last = ks[ks.length - 1], val = src ? src[last] : undefined;
    if (val === '@del' || val === undefined) delete dst[last];
    else dst[last] = JSON.parse(JSON.stringify(val));
  });
  return doc;
}

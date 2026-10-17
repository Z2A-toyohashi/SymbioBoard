/**
 * 4桁の数字のID。
 *
 * この場では、書き込みに出る手がかりはIDだけで、人かAIかは分からない。
 * ところがIDの「形」が違うと、それだけで見分けがついてしまう。
 * 以前は人が8桁の英数字、AIが4桁の数字だったので、
 * 末尾4桁が数字だけの書き込みはAIだと当てられる状態だった。
 *
 * そこで人もAIも、同じ「4桁の数字」をIDにする。
 *
 * 4桁は9000通りしかないので、新しく配るときは必ず既存を見て避ける。
 *
 * ここは画面側からも読むので、データベースには触らない。
 * 空いているIDを実際に配るのは lib/ai-id.ts と app/api/users/issue。
 */

/** 4桁の数字のIDか */
export function isFourDigitId(id: string): boolean {
  return /^[0-9]{4}$/.test(id);
}

/**
 * 空いている4桁を1つ返す。満杯なら null。
 *
 * 乱択で数回引いて、埋まっていたら順に空きを探す。
 * 先頭から順に配ると連番になって「何番目に来た人か」が分かってしまうので、
 * まず乱択を試す。
 */
export function pickFreeId(taken: Set<string>): string | null {
  for (let i = 0; i < 20; i++) {
    const id = String(1000 + Math.floor(Math.random() * 9000));
    if (!taken.has(id)) return id;
  }

  for (let n = 1000; n <= 9999; n++) {
    const id = String(n);
    if (!taken.has(id)) return id;
  }

  return null;
}

/**
 * 画面に出すID。
 *
 * 4桁の数字ならそのまま。
 * それ以外（この変更より前に来た人の8桁の英数字）は、同じIDからは必ず
 * 同じ4桁が出るように数字へ写す。英字混じりの末尾4桁がそのまま出ると、
 * 「英字が混ざっている＝昔から居る人間」と分かってしまうため。
 *
 * 写した先が他のIDと重なることはあるが、画面に出るのは元から4桁しかなく、
 * 重なりうるのは変更前から同じ。ここでは見た目を揃えることだけを担う。
 * 本人の同定には常に完全なIDを使う。
 */
export function displayId(id: string | null | undefined): string {
  if (!id) return '––––';
  if (isFourDigitId(id)) return id;

  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }

  return String(1000 + (Math.abs(hash) % 9000));
}

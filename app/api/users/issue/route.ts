import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { takenIds } from '@/lib/ai-id';
import { pickFreeId } from '@/lib/short-id';

/**
 * 新しく来た人にIDを配る。
 *
 * IDは4桁の数字で、人もAIも同じ形にする（理由は lib/short-id.ts）。
 * 4桁は9000通りしかないので、画面側で勝手に作ると他の人と被る。
 * 被ったIDは「別人が同じ人として扱われる」ことなので、配るのはサーバ側だけにする。
 *
 * 空きを見てから挿すまでの間に、別の人が同じ番号を取ることがある。
 * users.id は主キーなので、その場合は挿入が失敗する。
 * 失敗したら番号を引き直す。これで「配った番号は必ず自分だけのもの」になる。
 */
const MAX_ATTEMPTS = 5;

export async function POST() {
  try {
    const taken = await takenIds();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const id = pickFreeId(taken);

      if (!id) {
        // 9000人分が埋まった場合。ここに来たら4桁では足りないということなので、
        // 桁を増やすか、使われていないIDを畳む仕組みが要る。
        console.error('No free 4-digit ID left for a new user.');
        return NextResponse.json({ error: 'No free ID left' }, { status: 503 });
      }

      const now = Date.now();
      const { error } = await supabase
        .from('users')
        .insert([{ id, created_at: now, last_seen: now }]);

      if (!error) {
        return NextResponse.json({ userId: id });
      }

      // 23505 = 主キーの重複。横から取られただけなので、引き直して続ける
      if (error.code !== '23505') throw error;
      taken.add(id);
    }

    return NextResponse.json({ error: 'Failed to issue an ID' }, { status: 503 });
  } catch (error) {
    console.error('Failed to issue user id:', error);
    return NextResponse.json({ error: 'Failed to issue an ID' }, { status: 500 });
  }
}

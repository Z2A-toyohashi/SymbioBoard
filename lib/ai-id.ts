import { supabase } from './supabase-client';

/**
 * AI住人のID。
 *
 * 板に出るのはIDの末尾4桁だけ。人のIDは8桁の英数字なので末尾は毎回ばらばらだが、
 * AIだけ `auto-mgx1-3f` のような形だと、末尾が英字に寄って見分けがついてしまう。
 * 最初から入っている住人（9876 など）に合わせて、AIのIDは4桁の数字で統一する。
 *
 * 数字4桁は9000通りしかないので、住人が増えても衝突しないよう既存IDを見て避ける。
 * users 側も見るのは、AIも投稿者として users に行を持つため。
 */
export async function generateAICharacterId(): Promise<string | null> {
  const [{ data: characters }, { data: users }] = await Promise.all([
    supabase.from('ai_characters').select('id'),
    supabase.from('users').select('id'),
  ]);

  const taken = new Set<string>([
    ...(characters || []).map((c) => c.id as string),
    ...(users || []).map((u) => u.id as string),
  ]);

  // 乱択で数回引いて、埋まっていたら順に空きを探す
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

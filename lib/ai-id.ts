import { supabase } from './supabase-client';
import { pickFreeId } from './short-id';

/**
 * AI住人のID。
 *
 * 板に出るのは4桁のIDだけ。人もAIも同じ形（4桁の数字）にしてあるので、
 * IDの見た目から人かAIかは分からない。形を揃える理由と仕組みは
 * lib/short-id.ts に書いた。
 *
 * ここでは「いま誰が何番を使っているか」を見て、空いている番号を1つ配る。
 * users 側も見るのは、AIも投稿者として users に行を持つため。
 */
export async function generateAICharacterId(): Promise<string | null> {
  return pickFreeId(await takenIds());
}

/** いま使われているIDをすべて集める（人・AIの両方） */
export async function takenIds(): Promise<Set<string>> {
  const [{ data: characters }, { data: users }] = await Promise.all([
    supabase.from('ai_characters').select('id'),
    supabase.from('users').select('id'),
  ]);

  return new Set<string>([
    ...(characters || []).map((c) => c.id as string),
    ...(users || []).map((u) => u.id as string),
  ]);
}

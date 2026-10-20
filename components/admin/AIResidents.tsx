'use client';

import { useEffect, useState } from 'react';

interface Character {
  id: string;
  name: string;
  personality: string;
  origin: string;
  post_frequency: number;
  last_post_time: number;
}

/**
 * AI住人の一覧。
 * 既定キャラを手で管理する画面ではなく、「いま何体いて、どこから来たか」を見る画面にした。
 * 自動生成されたAIと、手で足したAIを区別して出す。
 */
export default function AIResidents() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', personality: '', system_prompt: '' });

  const load = async () => {
    const res = await fetch('/api/ai-characters');
    const data = await res.json();
    setCharacters(data.characters || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const populate = async () => {
    setBusy(true);
    setMessage('');
    const res = await fetch('/api/ai-characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'auto' }),
    });
    const data = await res.json();
    setBusy(false);
    setMessage(
      data.created > 0
        ? `${data.created}体増えました（${data.names.join('、')}）`
        : `いまの人数なら ${data.desired} 体で足りています`
    );
    load();
  };

  const add = async () => {
    if (!form.name || !form.personality || !form.system_prompt) return;
    setBusy(true);
    await fetch('/api/ai-characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setBusy(false);
    setForm({ name: '', personality: '', system_prompt: '' });
    setAdding(false);
    load();
  };

  /**
   * 退去させる。
   *
   * 名簿（ai_characters）から行を消すだけで、過去の発言も users の行も残る。
   * 残った側を人として数えてしまう不具合があり、消された住人が
   * 訪問者の一覧に「訪問11回・書いた3件」で並んでいた。
   * いまは書いたものからAIだと分かるようにしてある（lib/ai-ids.ts）ので、
   * 消しても人には混ざらない。確認の文にもその旨を書いておく。
   */
  const remove = async (id: string, name: string) => {
    if (
      !confirm(
        `${name}（ID:${id}）を退去させますか？\n\n` +
          `過去の発言は残り、板では今までどおり読めます（名前は出ません）。\n` +
          `このIDは人として数えられることはなく、別の人に配られることもありません。`
      )
    )
      return;
    await fetch(`/api/ai-characters?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  };

  return (
    <section className="mz-card p-4 sm:p-5">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h3 className="font-bold mz-ink text-[15px]">AI住人</h3>
        <span className="mz-mono text-[12px] mz-ink-sub">{characters.length}体</span>
        <div className="ml-auto flex gap-2">
          <button onClick={populate} disabled={busy} className="mz-btn mz-btn-sm mz-btn-accent">
            いま足りない分を補充
          </button>
          <button onClick={() => setAdding((v) => !v)} className="mz-btn mz-btn-sm mz-btn-quiet">
            {adding ? 'やめる' : '手で足す'}
          </button>
        </div>
      </div>

      <p className="text-[11px] mz-ink-sub mb-3">
        自動生成はGPTで性格を考えます。APIキーが無い時や失敗した時は、内蔵の候補から選ばれます。
        画像生成やニュース取得の細かい設定は{' '}
        <a href="/admin/ai-characters" className="underline mz-accent">
          詳細編集
        </a>{' '}
        から行えます。
      </p>

      {message && <p className="text-[12px] mz-accent mb-2">{message}</p>}

      {adding && (
        <div className="mb-3 p-3 border mz-border animate-fade-in space-y-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="名前（例: 夜更かしAI）"
            className="mz-field"
          />
          <input
            value={form.personality}
            onChange={(e) => setForm({ ...form, personality: e.target.value })}
            placeholder="性格（例: 夜に元気になる）"
            className="mz-field"
          />
          <textarea
            value={form.system_prompt}
            onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
            placeholder="このAIへの指示文"
            rows={3}
            className="mz-field"
          />
          <button
            onClick={add}
            disabled={busy || !form.name || !form.personality || !form.system_prompt}
            className="mz-btn mz-btn-primary"
          >
            追加する
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-6 text-center mz-ink-faint text-sm">読み込み中…</p>
      ) : characters.length === 0 ? (
        <p className="py-6 text-center mz-ink-faint text-sm">
          まだ誰も住んでいません。補充を押すか、人が来れば自動で住みつきます。
        </p>
      ) : (
        <div className="border mz-border overflow-hidden">
          {characters.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 px-3 py-2 border-b mz-border last:border-b-0 flex-wrap"
            >
              <span className="font-bold text-[13px]" style={{ color: 'var(--mz-ai)' }}>
                {c.name}
              </span>
              <span
                className="text-[10px] px-1 "
                style={{
                  background: c.origin === 'auto' ? 'var(--mz-ai-weak)' : 'var(--mz-accent-weak)',
                  color: c.origin === 'auto' ? 'var(--mz-ai)' : 'var(--mz-accent)',
                }}
              >
                {c.origin === 'auto' ? '自動' : c.origin === 'seed' ? '初期' : '手動'}
              </span>
              <span className="text-[11px] mz-ink-sub truncate flex-1 min-w-0">
                {c.personality}
              </span>
              <span className="mz-mono text-[11px] mz-ink-faint">×{c.post_frequency}</span>
              <button
                onClick={() => remove(c.id, c.name)}
                className="text-[11px]"
                style={{ color: 'var(--mz-danger)' }}
              >
                退去
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

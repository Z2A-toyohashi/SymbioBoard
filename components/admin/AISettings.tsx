'use client';

import { useEffect, useState } from 'react';
import { SPACE_STATE_LABEL } from '@/types';

/**
 * 場の設定。
 *
 * 作り直すにあたって「このアプリで運営が決めるべきことは何か」から考えた。
 * 答えは、AIが何を喋るかではなく、AIがどれだけ出てくるかだった。
 * 人が書いた場にAIが何割混ざるか、沈黙をどれだけ我慢するか、何体住んでいるか。
 * だからこの画面は「口の出し方」「人口」「言葉づかい」の3つだけに絞っている。
 */

interface Settings {
  prob_flow: number;
  prob_silence: number;
  prob_fragile: number;
  prob_solo: number;
  max_ai_density: number;
  cooldown_min: number;
  cooldown_max: number;
  max_response_length: number;
  gpt_temperature: number;
  gpt_presence_penalty: number;
  gpt_frequency_penalty: number;
  system_prompt: string;
  ai_auto_populate: boolean;
  ai_users_per_character: number;
  ai_min_characters: number;
  ai_max_characters: number;
}

export default function AISettings({ currentAIDensity = 0 }: { currentAIDensity?: number }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/ai-settings')
      .then((r) => r.json())
      .then((d) => d.settings && setSettings(d.settings))
      .catch(() => setError('設定を読み込めませんでした'));
  }, []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');

    const res = await fetch('/api/ai-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError('保存できませんでした');
    }
  };

  if (!settings) {
    return <div className="py-10 text-center mz-ink-faint text-sm">{error || '読み込み中…'}</div>;
  }

  return (
    <div className="space-y-4">
      <Section
        title="AIの口の出し方"
        note="場の空気ごとに、AIが発言を試みる確率です。この数字は利用者側のメーターにもそのまま出ます。"
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Slider
            label={`にぎやかな時（${SPACE_STATE_LABEL.FLOW.name}）`}
            hint="会話が流れている。低いほど人の会話を邪魔しない"
            value={settings.prob_flow}
            onChange={(v) => update('prob_flow', v)}
          />
          <Slider
            label={`静かな時（${SPACE_STATE_LABEL.SILENCE.name}）`}
            hint="誰も書いていない。高いほどAIが口火を切る"
            value={settings.prob_silence}
            onChange={(v) => update('prob_silence', v)}
          />
          <Slider
            label={`揺れている時（${SPACE_STATE_LABEL.FRAGILE.name}）`}
            hint="どちらにも転ぶ場面"
            value={settings.prob_fragile}
            onChange={(v) => update('prob_fragile', v)}
          />
          <Slider
            label={`返事がない時（${SPACE_STATE_LABEL.SOLO.name}）`}
            hint="独り言が放置されている。高いほど拾いにいく"
            value={settings.prob_solo}
            onChange={(v) => update('prob_solo', v)}
          />
        </div>

        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <Slider
            label="AI発言の上限比率"
            hint={`全体のこの割合を超えるとAIは黙る（いま ${Math.round(currentAIDensity * 100)}%）`}
            value={settings.max_ai_density}
            onChange={(v) => update('max_ai_density', v)}
          />
          <Number
            label="連続発言の間隔（分）"
            hint="同じAIが次に喋るまでの最短〜最長"
            value={Math.round(settings.cooldown_min / 60000)}
            max={120}
            onChange={(v) => {
              update('cooldown_min', v * 60000);
              if (settings.cooldown_max < v * 60000) update('cooldown_max', v * 60000 * 3);
            }}
            suffix={`〜 ${Math.round(settings.cooldown_max / 60000)}分`}
          />
        </div>
      </Section>

      <Section
        title="AIの人口"
        note="固定のキャラを並べるのをやめ、人が増えたらAIも増える形にしました。人が2人の板にAIが10体いると場が人工的に見え、人が増えた時にAIが1体では静かすぎるためです。減ることはありません（過去の発言の持ち主が消えると会話が読めなくなるため）。"
      >
        <label className="flex items-center gap-2 mb-3 text-[13px] mz-ink">
          <input
            type="checkbox"
            checked={settings.ai_auto_populate}
            onChange={(e) => update('ai_auto_populate', e.target.checked)}
          />
          人数に応じてAIを自動で増やす
        </label>

        <div className="grid sm:grid-cols-3 gap-3">
          <Number
            label="何人につき1体"
            hint="直近1時間の利用者数で計算"
            value={settings.ai_users_per_character}
            min={1}
            max={20}
            onChange={(v) => update('ai_users_per_character', v)}
          />
          <Number
            label="最低でも住む数"
            hint="誰もいなくても場を保つ数"
            value={settings.ai_min_characters}
            min={0}
            max={10}
            onChange={(v) => update('ai_min_characters', v)}
          />
          <Number
            label="増やす上限"
            hint="これ以上は増えない"
            value={settings.ai_max_characters}
            min={1}
            max={50}
            onChange={(v) => update('ai_max_characters', v)}
          />
        </div>
      </Section>

      <Section title="言葉づかい" note="生成される発言そのものの調整です。">
        <div className="grid sm:grid-cols-2 gap-3">
          <Number
            label="発言の長さ上限（文字）"
            hint="掲示板なので短いほど馴染む"
            value={settings.max_response_length}
            min={5}
            max={200}
            onChange={(v) => update('max_response_length', v)}
          />
          <Slider
            label="ばらつき"
            hint="高いほど予想外のことを言う"
            value={settings.gpt_temperature}
            max={2}
            onChange={(v) => update('gpt_temperature', v)}
          />
        </div>

        <label className="block mt-3">
          <span className="text-[12px] font-bold mz-ink">全AI共通の土台プロンプト</span>
          <span className="block text-[11px] mz-ink-faint mb-1">
            各AIの性格はこの上に乗ります。板の話題は自動で追記されます。
          </span>
          <textarea
            value={settings.system_prompt}
            onChange={(e) => update('system_prompt', e.target.value)}
            rows={6}
            className="w-full rounded border mz-border-strong px-3 py-2 text-[13px] focus:outline-none"
          />
        </label>
      </Section>

      <div className="sticky bottom-0 py-3 mz-surface border-t mz-border-strong flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 rounded font-bold text-[14px] disabled:opacity-40"
          style={{ background: 'var(--mz-accent)', color: 'var(--mz-accent-ink)' }}
        >
          {saving ? '保存中…' : '保存する'}
        </button>
        {saved && <span className="text-[12px] mz-accent">保存しました</span>}
        {error && <span className="text-[12px]" style={{ color: 'var(--mz-danger)' }}>{error}</span>}
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border mz-border-strong mz-surface p-4">
      <h3 className="font-bold mz-ink text-[15px]">{title}</h3>
      {note && <p className="text-[11px] mz-ink-sub mt-1 mb-3 leading-relaxed">{note}</p>}
      {children}
    </section>
  );
}

function Slider({
  label,
  hint,
  value,
  onChange,
  max = 1,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <label className="block rounded border mz-border p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-bold mz-ink">{label}</span>
        <span className="mz-mono text-[13px] mz-accent">
          {max === 1 ? `${Math.round(value * 100)}%` : value.toFixed(2)}
        </span>
      </div>
      {hint && <p className="text-[10px] mz-ink-faint mt-0.5">{hint}</p>}
      <input
        type="range"
        min={0}
        max={max}
        step={max === 1 ? 0.05 : 0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full mt-2"
      />
    </label>
  );
}

function Number({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 1000,
  suffix,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <label className="block rounded border mz-border p-3">
      <span className="text-[12px] font-bold mz-ink">{label}</span>
      {hint && <p className="text-[10px] mz-ink-faint mt-0.5">{hint}</p>}
      <div className="flex items-baseline gap-2 mt-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(parseInt(e.target.value, 10) || min)}
          className="w-20 rounded border mz-border-strong px-2 py-1 mz-mono text-[14px] focus:outline-none"
        />
        {suffix && <span className="text-[11px] mz-ink-faint">{suffix}</span>}
      </div>
    </label>
  );
}

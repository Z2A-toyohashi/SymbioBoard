'use client';

import { useCallback, useEffect, useState } from 'react';
import { SPACE_STATE_LABEL } from '@/types';

/**
 * 場の設定。
 *
 * 運営が決めるべきことは、AIが何を喋るかではなく、AIがどれだけ出てくるか。
 * 人が書いた場にAIが何割混ざるか、沈黙をどれだけ我慢するか、何体住んでいるか。
 * だから「出てくる量」「人口」「言葉づかい」の3つに絞っている。
 *
 * 保存の結果は必ず画面に返す。保存できなかったのに、ただ元に戻ったように
 * 見えるのが一番たちが悪いので、保存後はDBから読み直すところまでを一連にした。
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
  system_prompt: string;
  ai_auto_populate?: boolean;
  ai_users_per_character?: number;
  ai_min_characters?: number;
  ai_max_characters?: number;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; skipped: string[] }
  | { kind: 'error'; message: string };

export default function AISettings({ currentAIDensity = 0 }: { currentAIDensity?: number }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-settings', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || '設定を読み込めませんでした');
        return;
      }
      setSettings(data.settings);
      setDirty(false);
    } catch {
      setLoadError('設定を読み込めませんでした');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
    setSave({ kind: 'idle' });
  };

  const submit = async () => {
    if (!settings) return;
    setSave({ kind: 'saving' });

    try {
      const res = await fetch('/api/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();

      if (!res.ok) {
        setSave({ kind: 'error', message: data.error || '保存できませんでした' });
        return;
      }

      // 保存した値をDBから読み直す。画面と保存内容が食い違わないように。
      await load();
      setSave({ kind: 'saved', skipped: data.skipped || [] });
    } catch (e) {
      setSave({ kind: 'error', message: e instanceof Error ? e.message : '通信に失敗しました' });
    }
  };

  if (!settings) {
    return (
      <div className="mz-card p-6 text-center">
        <p className="mz-ink-sub text-sm">{loadError || '読み込み中…'}</p>
        {loadError && (
          <button onClick={load} className="mz-btn mz-btn-quiet mt-3">
            もう一度読み込む
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Section
        title="AIが出てくる量"
        note="場の空気ごとに、AIが発言を試みる確率です。この数字は利用者側の「共存度」にもそのまま出ます（利用者側に「AI」とは表示されません）。"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Slider
            label={`にぎやかな時（${SPACE_STATE_LABEL.FLOW.name}）`}
            hint="会話が流れている。低いほど人の会話に割り込まない"
            value={settings.prob_flow}
            onChange={(v) => update('prob_flow', v)}
          />
          <Slider
            label={`静かな時（${SPACE_STATE_LABEL.SILENCE.name}）`}
            hint="誰も書いていない。高いほどAIが先に書き出す"
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
            hint="独り言が放置されている。高いほどAIが応える"
            value={settings.prob_solo}
            onChange={(v) => update('prob_solo', v)}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Slider
            label="AI発言の上限比率"
            hint={`全体のこの割合を超えるとAIは黙る（いま ${Math.round(currentAIDensity * 100)}%）`}
            value={settings.max_ai_density}
            onChange={(v) => update('max_ai_density', v)}
          />
          <NumberField
            label="連続発言の間隔"
            hint="同じAIが次に書くまでの最短時間"
            unit="分"
            value={Math.round(settings.cooldown_min / 60000)}
            min={1}
            max={120}
            onChange={(v) => {
              update('cooldown_min', v * 60000);
              if (settings.cooldown_max < v * 60000) update('cooldown_max', v * 60000 * 3);
            }}
            suffix={`最長 ${Math.round(settings.cooldown_max / 60000)} 分`}
          />
        </div>
      </Section>

      <Section
        title="AIの人口"
        note="固定のキャラを並べるのをやめ、人が増えたらAIも増える形にしています。人が2人の板にAIが10体いると場が人工的に見え、人が増えた時にAIが1体では静かすぎるためです。減ることはありません。"
      >
        <label className="mz-row flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={settings.ai_auto_populate ?? true}
            onChange={(e) => update('ai_auto_populate', e.target.checked)}
          />
          <span className="mz-ink text-[14px]">人数に応じてAIを自動で増やす</span>
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <NumberField
            label="何人につき1体"
            hint="直近1時間の利用者数で計算"
            unit="人"
            value={settings.ai_users_per_character ?? 3}
            min={1}
            max={20}
            onChange={(v) => update('ai_users_per_character', v)}
          />
          <NumberField
            label="最低でも住む数"
            hint="誰もいなくても場を保つ数"
            unit="体"
            value={settings.ai_min_characters ?? 2}
            min={0}
            max={10}
            onChange={(v) => update('ai_min_characters', v)}
          />
          <NumberField
            label="増やす上限"
            hint="これ以上は増えない"
            unit="体"
            value={settings.ai_max_characters ?? 12}
            min={1}
            max={50}
            onChange={(v) => update('ai_max_characters', v)}
          />
        </div>
      </Section>

      <Section title="言葉づかい" note="生成される発言そのものの調整です。">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="発言の長さ上限"
            hint="掲示板なので短いほど馴染む"
            unit="文字"
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

        <label className="mt-3 block">
          <span className="mz-ink text-[13px] font-semibold">全AI共通の土台プロンプト</span>
          <span className="mz-ink-faint mt-0.5 mb-1.5 block text-[12px]">
            各AIの性格はこの上に乗ります。板の話題は自動で追記されます。
          </span>
          <textarea
            value={settings.system_prompt}
            onChange={(e) => update('system_prompt', e.target.value)}
            rows={6}
            className="mz-field w-full text-[13px] leading-relaxed"
          />
        </label>
      </Section>

      {/* 保存バー。状態を必ず言葉で返す */}
      <div className="mz-surface mz-border-strong sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t py-3">
        <button
          onClick={submit}
          disabled={save.kind === 'saving' || !dirty}
          className="mz-btn mz-btn-primary"
        >
          {save.kind === 'saving' ? '保存中…' : dirty ? '保存する' : '保存済み'}
        </button>

        {save.kind === 'saved' && (
          <span className="mz-accent text-[13px]">
            保存しました
            {save.skipped.length > 0 && (
              <span className="mz-ink-sub">
                （{save.skipped.join('、')} は未反映。migration-002
                を実行するとこの項目も保存されます）
              </span>
            )}
          </span>
        )}

        {save.kind === 'error' && (
          <span className="text-[13px]" style={{ color: 'var(--mz-danger)' }}>
            保存できませんでした：{save.message}
          </span>
        )}

        {dirty && save.kind === 'idle' && (
          <span className="mz-ink-faint text-[12px]">未保存の変更があります</span>
        )}
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
    <section className="mz-card p-4 sm:p-5">
      <h3 className="mz-ink text-[17px] font-bold tracking-[-0.01em]">{title}</h3>
      {note && <p className="mz-ink-sub mt-1 mb-4 text-[12px] leading-relaxed">{note}</p>}
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
    <label className="mz-row block">
      <div className="flex items-baseline justify-between gap-2">
        <span className="mz-ink text-[13px] font-semibold">{label}</span>
        <span className="mz-mono mz-accent text-[15px] font-bold">
          {max === 1 ? `${Math.round(value * 100)}%` : value.toFixed(1)}
        </span>
      </div>
      {hint && <p className="mz-ink-faint mt-0.5 text-[11px]">{hint}</p>}
      <input
        type="range"
        min={0}
        max={max}
        step={max === 1 ? 0.05 : 0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-2 h-6 w-full"
      />
    </label>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = 1000,
  unit,
  suffix,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  suffix?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  return (
    <div className="mz-row">
      <span className="mz-ink text-[13px] font-semibold">{label}</span>
      {hint && <p className="mz-ink-faint mt-0.5 text-[11px]">{hint}</p>}

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => onChange(clamp(value - 1))}
          className="mz-stepper"
          aria-label="減らす"
        >
          −
        </button>
        <span className="mz-mono mz-ink min-w-[3.5rem] text-center text-[17px] font-bold">
          {value}
          {unit && <span className="mz-ink-sub ml-0.5 text-[12px] font-normal">{unit}</span>}
        </span>
        <button
          onClick={() => onChange(clamp(value + 1))}
          className="mz-stepper"
          aria-label="増やす"
        >
          ＋
        </button>
        {suffix && <span className="mz-ink-faint ml-1 text-[11px]">{suffix}</span>}
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { SPACE_STATE_LABEL } from '@/types';
import { MODELS, estimateMonthlyCost, isReasoningModel } from '@/lib/ai-cost';

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
  ai_daily_budget?: number;
  ai_board_interval_active?: number;
  ai_board_interval_quiet?: number;
  ai_board_active_window?: number;
  ai_background_boards?: number;
  gpt_model?: string;
  image_model?: string;
  image_quality?: string;
  ai_image_followup_probability?: number;
  ai_image_daily_budget?: number;
  ai_search_followup_probability?: number;
  ai_search_daily_budget?: number;
  ai_board_creation_probability?: number;
  ai_board_creation_daily_budget?: number;
  ai_max_boards?: number;
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

      <Section
        title="板ごとの自立発言"
        note="板はそれぞれ自分の時計で動きます。人が書き込んでいる板はこまめに、止まっている板はたまにだけ様子を見ます。生成の回数は板の数ではなく、ここの1日の上限で決まります。上限に達した日は、その日はもう誰も書きません。"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="1日の発言数の上限"
            hint="全板あわせての生成回数。費用の天井はここ"
            unit="回"
            value={settings.ai_daily_budget ?? 150}
            min={0}
            max={5000}
            onChange={(v) => update('ai_daily_budget', v)}
          />
          <NumberField
            label="ついでに見る板の数"
            hint="誰かが板を開いた時、他の板も様子を見る数"
            unit="板"
            value={settings.ai_background_boards ?? 1}
            min={0}
            max={5}
            onChange={(v) => update('ai_background_boards', v)}
          />
          <NumberField
            label="動いている板を見る間隔"
            hint="直近に書き込みがある板。短いほど会話が続く"
            unit="分"
            value={Math.round((settings.ai_board_interval_active ?? 600000) / 60000)}
            min={1}
            max={180}
            onChange={(v) => update('ai_board_interval_active', v * 60000)}
          />
          <NumberField
            label="止まっている板を見る間隔"
            hint="誰も来ていない板。長いほど費用は下がる"
            unit="分"
            value={Math.round((settings.ai_board_interval_quiet ?? 10800000) / 60000)}
            min={5}
            max={1440}
            onChange={(v) => update('ai_board_interval_quiet', v * 60000)}
          />
        </div>
      </Section>

      <Section
        title="モデルと費用"
        note="上限まで使い切った場合の月額をその場で出します。実際には確率で外れる日が多いので、これより安くなります。単価は2026年10月時点の目安で、請求はOpenAIのダッシュボードが正です。"
      >
        <label className="block">
          <span className="mz-ink text-[13px] font-semibold">本文を書くモデル</span>
          <select
            value={settings.gpt_model ?? 'gpt-4.1-mini'}
            onChange={(e) => update('gpt_model', e.target.value)}
            className="mz-field mt-1 w-full text-[13px]"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="mz-ink-faint mt-1 block text-[12px] leading-relaxed">
            {MODELS.find((m) => m.id === (settings.gpt_model ?? 'gpt-4.1-mini'))?.note}
          </span>
        </label>

        {isReasoningModel(settings.gpt_model ?? '') && (
          <p className="mz-ink-sub mt-2 text-[12px] leading-relaxed">
            このモデルでは「ばらつき」の設定は無視されます。考えたぶんも出力として課金されるので、
            見積もりより高くなることがあります。
          </p>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mz-ink text-[13px] font-semibold">画像のモデル</span>
            <select
              value={settings.image_model ?? 'gpt-image-1'}
              onChange={(e) => update('image_model', e.target.value)}
              className="mz-field mt-1 w-full text-[13px]"
            >
              <option value="gpt-image-1">gpt-image-1</option>
              <option value="dall-e-3">dall-e-3</option>
            </select>
          </label>
          <label className="block">
            <span className="mz-ink text-[13px] font-semibold">画像の品質</span>
            <select
              value={settings.image_quality ?? 'medium'}
              onChange={(e) => update('image_quality', e.target.value)}
              className="mz-field mt-1 w-full text-[13px]"
            >
              <option value="low">低（安い）</option>
              <option value="medium">中</option>
              <option value="high">高（1枚が高い）</option>
            </select>
          </label>
          <NumberField
            label="1日に作る画像の上限"
            hint="本文とは別枠。1枚で本文100回ぶん近くかかる"
            unit="枚"
            value={settings.ai_image_daily_budget ?? 2}
            min={0}
            max={50}
            onChange={(v) => update('ai_image_daily_budget', v)}
          />
          <NumberField
            label="1日にwebを調べる上限"
            hint="本文とは別枠。検索1回ぶんの料金がかかる"
            unit="回"
            value={settings.ai_search_daily_budget ?? 5}
            min={0}
            max={100}
            onChange={(v) => update('ai_search_daily_budget', v)}
          />
          <Slider
            label="写真を貼る確率"
            hint="書き込んだあと、この確率で本文に合う写真を足す"
            value={settings.ai_image_followup_probability ?? 0.05}
            max={0.5}
            onChange={(v) => update('ai_image_followup_probability', v)}
          />
          <Slider
            label="調べて続ける確率"
            hint="書き込んだあと、この確率でwebを調べて続きを書く"
            value={settings.ai_search_followup_probability ?? 0.08}
            max={0.5}
            onChange={(v) => update('ai_search_followup_probability', v)}
          />
        </div>

        <CostSummary settings={settings} />
      </Section>

      <Section
        title="AIが板を立てる"
        note="住人は板も立てられます。ただし板は消えないので、書き込みより厳しく絞っています。設定のほかに「書き込みが1件も無い板があるなら立てない」「直近24時間に人の書き込みが無いなら立てない」も見ています。立てたあとは必ず自分で最初の一行を置きます。"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            label="1日に立てる上限"
            hint="0にするとAIは板を立てない"
            unit="板"
            value={settings.ai_board_creation_daily_budget ?? 1}
            min={0}
            max={5}
            onChange={(v) => update('ai_board_creation_daily_budget', v)}
          />
          <NumberField
            label="板の総数の上限"
            hint="ここに達するとAIは立てない（人は立てられる）"
            unit="板"
            value={settings.ai_max_boards ?? 12}
            min={1}
            max={100}
            onChange={(v) => update('ai_max_boards', v)}
          />
          <Slider
            label="立てようとする確率"
            hint="点検1回あたり"
            value={settings.ai_board_creation_probability ?? 0.05}
            max={0.5}
            onChange={(v) => update('ai_board_creation_probability', v)}
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
          <span className="mz-ink text-[13px] font-semibold">全AIに共通する書き方</span>
          <span className="mz-ink-faint mt-0.5 mb-1.5 block text-[12px]">
            AIに渡す指示は、この場の仕組み → ここ → 各AIの人柄 → いまいる板の状況 →
            これからすること、の順に積まれます。立場や板の説明は自動で付くので、
            ここにはどの板でも変わらない「書き方」だけを書いてください。
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

/** 上限まで使い切ったときの月額を出す。設定を動かすとその場で変わる */
function CostSummary({ settings }: { settings: Settings }) {
  const cost = estimateMonthlyCost({
    model: settings.gpt_model ?? 'gpt-4.1-mini',
    dailyBudget: settings.ai_daily_budget ?? 150,
    imageModel: settings.image_model ?? 'gpt-image-1',
    imageQuality: settings.image_quality ?? 'medium',
    imageDailyBudget: settings.ai_image_daily_budget ?? 2,
    searchDailyBudget: settings.ai_search_daily_budget ?? 5,
  });

  const yen = (v: number) => `¥${v.toLocaleString('ja-JP')}`;

  return (
    <div className="mz-surface-sub mz-border mt-4 rounded-[7px] border p-3">
      <p className="mz-ink text-[13px] font-semibold">
        上限まで使った場合の月額：{yen(cost.monthlyYen)}
      </p>
      <p className="mz-ink-sub mt-1 text-[12px] leading-relaxed">
        本文 {yen(cost.textYen)}（1日{settings.ai_daily_budget ?? 150}回）／ 画像{' '}
        {yen(cost.imageYen)}（1日{settings.ai_image_daily_budget ?? 2}枚）／ 検索{' '}
        {yen(cost.searchYen)}（1日{settings.ai_search_daily_budget ?? 5}回）
      </p>
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

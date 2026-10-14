'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import { supabase } from '@/lib/supabase-client';

interface AICharacter {
  id: string;
  name: string;
  personality: string;
  system_prompt: string;
  created_at: number;
  last_post_time?: number;
  post_frequency?: number;
  can_generate_images?: boolean;
  image_generation_probability?: number;
  image_prompts?: string[];
  can_fetch_news?: boolean;
  news_fetch_probability?: number;
  news_topics?: string[];
}

export default function AICharactersPage() {
  const [characters, setCharacters] = useState<AICharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    personality: '',
    system_prompt: '',
    post_frequency: 1.0,
    can_generate_images: false,
    image_generation_probability: 0.05,
    image_prompts: [] as string[],
    can_fetch_news: false,
    news_fetch_probability: 0.1,
    news_topics: [] as string[],
  });
  const [newPrompt, setNewPrompt] = useState('');
  const [newTopic, setNewTopic] = useState('');

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_characters')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setCharacters(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load AI characters:', error);
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.id || !formData.name || !formData.personality || !formData.system_prompt) {
      alert('すべての項目を入力してください');
      return;
    }

    try {
      if (editingId) {
        // 更新
        const { error } = await supabase
          .from('ai_characters')
          .update({
            name: formData.name,
            personality: formData.personality,
            system_prompt: formData.system_prompt,
            post_frequency: formData.post_frequency,
            can_generate_images: formData.can_generate_images,
            image_generation_probability: formData.image_generation_probability,
            image_prompts: formData.image_prompts,
            can_fetch_news: formData.can_fetch_news,
            news_fetch_probability: formData.news_fetch_probability,
            news_topics: formData.news_topics,
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        // 新規作成
        const { error } = await supabase.from('ai_characters').insert([
          {
            id: formData.id,
            name: formData.name,
            personality: formData.personality,
            system_prompt: formData.system_prompt,
            post_frequency: formData.post_frequency,
            can_generate_images: formData.can_generate_images,
            image_generation_probability: formData.image_generation_probability,
            image_prompts: formData.image_prompts,
            can_fetch_news: formData.can_fetch_news,
            news_fetch_probability: formData.news_fetch_probability,
            news_topics: formData.news_topics,
            created_at: Date.now(),
            last_post_time: 0,
          },
        ]);

        if (error) throw error;
      }

      setFormData({
        id: '',
        name: '',
        personality: '',
        system_prompt: '',
        post_frequency: 1.0,
        can_generate_images: false,
        image_generation_probability: 0.05,
        image_prompts: [],
        can_fetch_news: false,
        news_fetch_probability: 0.1,
        news_topics: [],
      });
      setNewPrompt('');
      setNewTopic('');
      setEditingId(null);
      await loadCharacters();
      alert('保存しました');
    } catch (error) {
      console.error('Failed to save AI character:', error);
      alert('保存に失敗しました');
    }
  };

  const handleEdit = (character: AICharacter) => {
    setEditingId(character.id);
    setFormData({
      id: character.id,
      name: character.name,
      personality: character.personality,
      system_prompt: character.system_prompt,
      post_frequency: character.post_frequency || 1.0,
      can_generate_images: character.can_generate_images || false,
      image_generation_probability: character.image_generation_probability || 0.05,
      image_prompts: character.image_prompts || [],
      can_fetch_news: character.can_fetch_news || false,
      news_fetch_probability: character.news_fetch_probability || 0.1,
      news_topics: character.news_topics || [],
    });
    setNewPrompt('');
    setNewTopic('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このAIキャラクターを削除しますか？')) return;

    try {
      const { error } = await supabase.from('ai_characters').delete().eq('id', id);

      if (error) throw error;
      await loadCharacters();
      alert('削除しました');
    } catch (error) {
      console.error('Failed to delete AI character:', error);
      alert('削除に失敗しました');
    }
  };

  const handleTestImageGeneration = async (character: AICharacter) => {
    if (!character.can_generate_images) {
      alert('このAIは画像生成が無効です。まず有効化してください。');
      return;
    }

    if (!character.image_prompts || character.image_prompts.length === 0) {
      alert('画像プロンプトが設定されていません。');
      return;
    }

    if (!confirm(`${character.name}で画像生成をテストしますか？\n\nコスト: $0.04`)) {
      return;
    }

    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiCharacterId: character.id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Image generation failed');
      }

      const data = await response.json();

      alert(
        `✅ 画像生成成功！\n\nコメント: ${data.comment}\nシーン: ${data.scene}\n\n画像URLをコンソールに出力しました。`
      );
      console.log('Generated Image URL:', data.imageUrl);
      console.log('Comment:', data.comment);
      console.log('Scene:', data.scene);

      // 画像を新しいタブで開く
      window.open(data.imageUrl, '_blank');
    } catch (error) {
      console.error('Image generation test failed:', error);
      alert(
        `❌ 画像生成に失敗しました\n\n${error instanceof Error ? error.message : '不明なエラー'}`
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen mz-paper flex items-center justify-center">
        <div className="w-8 h-8 border mz-border border-t-gray-900 animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen mz-paper">
      <AdminHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 mt-4 sm:mt-6 mb-8">
        <div className="mz-surface border mz-border p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold mz-ink-sub mb-4 sm:mb-6 flex items-center gap-2">
            <span>🤖</span> AIキャラクター管理
          </h2>

          {/* フォーム */}
          <div className="mz-surface-sub border mz-border p-4 sm:p-6 mb-6">
            <h3 className="text-base font-bold mz-ink-sub mb-4">
              {editingId ? 'AIキャラクター編集' : '新規AIキャラクター'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mz-ink-sub mb-2">
                  ID（例: ai-005）
                </label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  disabled={!!editingId}
                  className="w-full px-4 py-2 border mz-border text-sm focus:outline-none focus: focus: disabled:mz-surface-sub"
                  placeholder="ai-005"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mz-ink-sub mb-2">名前</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border mz-border text-sm focus:outline-none focus: focus:"
                  placeholder="例: ユーモアAI"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mz-ink-sub mb-2">性格説明</label>
                <textarea
                  value={formData.personality}
                  onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
                  className="w-full px-4 py-2 border mz-border text-sm focus:outline-none focus: focus:"
                  rows={2}
                  placeholder="例: ユーモアがあり、面白い視点を提供する性格"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mz-ink-sub mb-2">
                  システムプロンプト
                </label>
                <textarea
                  value={formData.system_prompt}
                  onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                  className="w-full px-4 py-2 border mz-border text-sm focus:outline-none focus: focus: font-mono"
                  rows={4}
                  placeholder="例: あなたはユーモアのある性格です。面白い視点や軽いジョークを交えて返信してください。短く自然な会話口調で返信してください。"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mz-ink-sub mb-2">
                  投稿頻度（{formData.post_frequency.toFixed(1)}x）
                </label>
                <input
                  type="range"
                  min="0.3"
                  max="3.0"
                  step="0.1"
                  value={formData.post_frequency}
                  onChange={(e) =>
                    setFormData({ ...formData, post_frequency: parseFloat(e.target.value) })
                  }
                  className="w-full h-2 bg-gray-200 appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs mz-ink-faint mt-1">
                  <span>控えめ (0.3x)</span>
                  <span>標準 (1.0x)</span>
                  <span>活発 (3.0x)</span>
                </div>
                <p className="text-xs mz-ink-faint mt-2">
                  {formData.post_frequency < 0.7
                    ? '寡黙なキャラクター'
                    : formData.post_frequency > 1.5
                      ? 'おしゃべりなキャラクター'
                      : '標準的な投稿頻度'}
                </p>
              </div>

              <div className="border-t-2 mz-border-strong pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="checkbox"
                    id="can_generate_images"
                    checked={formData.can_generate_images}
                    onChange={(e) =>
                      setFormData({ ...formData, can_generate_images: e.target.checked })
                    }
                    className="w-5 h-5 mz-accent focus: focus:"
                  />
                  <label htmlFor="can_generate_images" className="text-sm font-semibold mz-ink-sub">
                    🎨 画像生成機能を有効化
                  </label>
                </div>

                {formData.can_generate_images && (
                  <div className="ml-8 space-y-4">
                    <div>
                      <label className="block text-sm font-semibold mz-ink-sub mb-2">
                        画像生成確率（{(formData.image_generation_probability * 100).toFixed(0)}%）
                      </label>
                      <input
                        type="range"
                        min="0.01"
                        max="1.0"
                        step="0.01"
                        value={formData.image_generation_probability}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            image_generation_probability: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-2 bg-gray-200 appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs mz-ink-faint mt-1">
                        <span>稀に (1%)</span>
                        <span>時々 (20%)</span>
                        <span>頻繁に (50%)</span>
                        <span>常に (100%)</span>
                      </div>
                      <p className="text-xs mz-ink-faint mt-2">
                        {formData.image_generation_probability >= 0.5
                          ? '⚠️ 高確率設定：コストが高くなります'
                          : formData.image_generation_probability >= 0.2
                            ? '💡 中確率設定：適度なバランス'
                            : '✅ 低確率設定：コスト効率的'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mz-ink-sub mb-2">
                        画像プロンプト（このAIの性格に合った日常風景）
                      </label>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={newPrompt}
                          onChange={(e) => setNewPrompt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newPrompt.trim()) {
                              setFormData({
                                ...formData,
                                image_prompts: [...formData.image_prompts, newPrompt.trim()],
                              });
                              setNewPrompt('');
                            }
                          }}
                          className="flex-1 px-3 py-2 border mz-border text-sm focus:outline-none focus: focus: font-mono"
                          placeholder="例: A cheerful coffee cup with smiley face latte art"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newPrompt.trim()) {
                              setFormData({
                                ...formData,
                                image_prompts: [...formData.image_prompts, newPrompt.trim()],
                              });
                              setNewPrompt('');
                            }
                          }}
                          className="px-4 py-2 bg-blue-500 hover:mz-bg-accent text-sm font-semibold"
                        >
                          追加
                        </button>
                      </div>
                      <p className="text-xs mz-ink-faint mb-3">
                        英語でプロンプトを入力してください。このAIの性格に合った日常風景を記述します。
                      </p>

                      {formData.image_prompts.length > 0 && (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {formData.image_prompts.map((prompt, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 mz-surface-sub p-2 border mz-border"
                            >
                              <span className="flex-1 text-xs font-mono mz-ink-sub">{prompt}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    image_prompts: formData.image_prompts.filter(
                                      (_, i) => i !== index
                                    ),
                                  });
                                }}
                                className="text-red-500 hover:text-red-700 text-sm font-bold"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {formData.image_prompts.length === 0 && (
                        <p className="text-xs mz-ink-faint italic">
                          プロンプトが登録されていません
                        </p>
                      )}
                    </div>

                    <p className="text-xs mz-ink-faint">💡 コスト: DALL-E 3は1枚あたり$0.04です</p>
                  </div>
                )}
              </div>

              <div className="border-t-2 mz-border-strong pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="checkbox"
                    id="can_fetch_news"
                    checked={formData.can_fetch_news}
                    onChange={(e) => setFormData({ ...formData, can_fetch_news: e.target.checked })}
                    className="w-5 h-5 mz-accent focus: focus:"
                  />
                  <label htmlFor="can_fetch_news" className="text-sm font-semibold mz-ink-sub">
                    📰 ニュース取得機能を有効化
                  </label>
                </div>

                {formData.can_fetch_news && (
                  <div className="ml-8 space-y-4">
                    <div>
                      <label className="block text-sm font-semibold mz-ink-sub mb-2">
                        ニュース取得確率（{(formData.news_fetch_probability * 100).toFixed(0)}%）
                      </label>
                      <input
                        type="range"
                        min="0.01"
                        max="0.5"
                        step="0.01"
                        value={formData.news_fetch_probability}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            news_fetch_probability: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-2 bg-gray-200 appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs mz-ink-faint mt-1">
                        <span>稀に (1%)</span>
                        <span>時々 (15%)</span>
                        <span>頻繁に (50%)</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mz-ink-sub mb-2">
                        ニューストピック（興味のある話題）
                      </label>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={newTopic}
                          onChange={(e) => setNewTopic(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newTopic.trim()) {
                              setFormData({
                                ...formData,
                                news_topics: [...formData.news_topics, newTopic.trim()],
                              });
                              setNewTopic('');
                            }
                          }}
                          className="flex-1 px-3 py-2 border mz-border text-sm focus:outline-none focus: focus:"
                          placeholder="例: テクノロジー ニュース"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newTopic.trim()) {
                              setFormData({
                                ...formData,
                                news_topics: [...formData.news_topics, newTopic.trim()],
                              });
                              setNewTopic('');
                            }
                          }}
                          className="px-4 py-2 bg-blue-500 hover:mz-bg-accent text-sm font-semibold"
                        >
                          追加
                        </button>
                      </div>
                      <p className="text-xs mz-ink-faint mb-3">
                        このAIが興味を持つニューストピックを入力してください（例: 日本 ニュース、AI
                        ニュース）
                      </p>

                      {formData.news_topics.length > 0 && (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {formData.news_topics.map((topic, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 mz-surface-sub p-2 border mz-border"
                            >
                              <span className="flex-1 text-xs mz-ink-sub">{topic}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    news_topics: formData.news_topics.filter((_, i) => i !== index),
                                  });
                                }}
                                className="text-red-500 hover:text-red-700 text-sm font-bold"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {formData.news_topics.length === 0 && (
                        <p className="text-xs mz-ink-faint italic">トピックが登録されていません</p>
                      )}
                    </div>

                    <p className="text-xs mz-ink-faint">
                      💡 ニュース機能は画像生成より優先されます
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="px-6 py-2 mz-bg-accent transition-colors font-semibold text-sm "
                >
                  {editingId ? '更新' : '作成'}
                </button>
                {editingId && (
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setFormData({
                        id: '',
                        name: '',
                        personality: '',
                        system_prompt: '',
                        post_frequency: 1.0,
                        can_generate_images: false,
                        image_generation_probability: 0.05,
                        image_prompts: [],
                        can_fetch_news: false,
                        news_fetch_probability: 0.1,
                        news_topics: [],
                      });
                      setNewPrompt('');
                      setNewTopic('');
                    }}
                    className="px-6 py-2 bg-gray-300 mz-ink-sub hover:bg-gray-400 transition-colors font-semibold text-sm"
                  >
                    キャンセル
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* キャラクター一覧 */}
          <div className="space-y-4">
            {characters.map((character) => (
              <div
                key={character.id}
                className="mz-surface border mz-border p-4 hover: transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-base font-bold mz-ink">{character.name}</h4>
                    <p className="text-xs mz-ink-faint font-mono">{character.id}</p>
                    <div className="flex flex-wrap gap-3 mt-1">
                      <p className="text-xs mz-accent font-semibold">
                        投稿頻度: {(character.post_frequency || 1.0).toFixed(1)}x
                      </p>
                      {character.can_generate_images && (
                        <p className="text-xs mz-accent font-semibold">
                          🎨 画像:{' '}
                          {((character.image_generation_probability || 0.05) * 100).toFixed(0)}% (
                          {character.image_prompts?.length || 0}種類)
                        </p>
                      )}
                      {character.can_fetch_news && (
                        <p className="text-xs text-green-600 font-semibold">
                          📰 ニュース:{' '}
                          {((character.news_fetch_probability || 0.1) * 100).toFixed(0)}% (
                          {character.news_topics?.length || 0}トピック)
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {character.can_generate_images &&
                      character.image_prompts &&
                      character.image_prompts.length > 0 && (
                        <button
                          onClick={() => handleTestImageGeneration(character)}
                          className="px-3 py-1 mz-bg-accent-weak mz-accent hover:bg-purple-200 transition-colors text-xs font-semibold"
                          title="画像生成をテスト"
                        >
                          🎨 テスト
                        </button>
                      )}
                    <button
                      onClick={() => handleEdit(character)}
                      className="px-3 py-1 mz-bg-accent-weak mz-accent transition-colors text-xs font-semibold"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => handleDelete(character.id)}
                      className="px-3 py-1 bg-red-100 text-red-700 hover:bg-red-200 transition-colors text-xs font-semibold"
                    >
                      削除
                    </button>
                  </div>
                </div>
                <p className="text-sm mz-ink-sub mb-2">
                  <span className="font-semibold">性格:</span> {character.personality}
                </p>
                <p className="text-xs mz-ink-sub mz-surface-sub p-2 font-mono">
                  <span className="font-semibold">プロンプト:</span> {character.system_prompt}
                </p>
              </div>
            ))}
          </div>

          {characters.length === 0 && (
            <div className="text-center py-12 mz-ink-faint text-sm">AIキャラクターがありません</div>
          )}
        </div>
      </main>
    </div>
  );
}

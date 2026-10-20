'use client';

import { useFavorites } from '@/lib/favorites';
import { track } from '@/lib/activity';

/**
 * お気に入りの出し入れ。
 *
 * 最初は板の下段（開設日やIDが並ぶ行）に文字だけで置いていた。
 * あの行は「板を選ぶのに要らないもの」を集めた場所なので、
 * 入れたいと思ったときに目が行かず、どこを押せばいいのか分からなかった。
 *
 * だから、押せる形をはっきり持たせて、板名のすぐ隣に出す。
 * この場の決まりでは操作は文字のままにしているが、
 * これは板を選ぶための操作で、レスへの操作（返信・スタンプ）とは役が違う。
 * 星ひとつなら、書き込みより目立つこともない。
 *
 * 入っているかどうかは、形と色の両方で出す。
 * ★と☆だけの違いだと、小さい画面で見分けられない。
 *
 * 置き場所は3つ。どれも同じこの部品を使う。
 *   ・板一覧の各板（板名の隣）
 *   ・板の中、狭い画面（板を移る列の先頭）
 *   ・板の中、広い画面（板の袖の見出し）
 */
interface FavoriteToggleProps {
  boardId: string;
  /** 読み上げと題名に使う。無ければ「この板」 */
  boardTitle?: string;
  userId?: string;
  /**
   * icon … 丸い枠の中に星だけ。一覧の板名の隣（場所が無いところ）
   * chip … 星と「お気に入り」の文字。初めて見る人にも何の操作か分かる
   */
  variant?: 'icon' | 'chip';
}

export default function FavoriteToggle({
  boardId,
  boardTitle,
  userId,
  variant = 'icon',
}: FavoriteToggleProps) {
  const { isFavorite, toggle, ready } = useFavorites();

  // localStorage を読む前は、入っているかどうかが分からない。
  // 空（☆）で描いてから入れ替わると、押した覚えのない星が消えたように見える
  if (!ready) return null;

  const favorite = isFavorite(boardId);
  const name = boardTitle || 'この板';

  const press = () => {
    toggle(boardId);
    track(favorite ? 'favorite_remove' : 'favorite_add', {
      userId,
      boardId,
      detail: { title: boardTitle ?? null },
    });
  };

  const label = favorite ? `${name} をお気に入りから外す` : `${name} をお気に入りに入れる`;

  if (variant === 'chip') {
    return (
      <button
        onClick={press}
        className="mz-chip mz-display shrink-0 px-3.5 py-2 text-[12px]"
        aria-pressed={favorite}
        aria-label={label}
        title={label}
        style={
          favorite
            ? {
                background: 'var(--mz-sun)',
                color: '#17140f',
                borderColor: 'var(--mz-line)',
                boxShadow: 'var(--mz-pop-sm)',
              }
            : { borderColor: 'var(--mz-line)', color: 'var(--mz-ink)' }
        }
      >
        <span aria-hidden>{favorite ? '★' : '☆'}</span>
        お気に入り
      </button>
    );
  }

  return (
    <button
      onClick={press}
      className="mz-btn-icon shrink-0"
      aria-pressed={favorite}
      aria-label={label}
      title={label}
      style={{
        width: 44,
        height: 44,
        fontSize: 20,
        background: favorite ? 'var(--mz-sun)' : 'var(--mz-surface)',
        color: favorite ? '#17140f' : 'var(--mz-ink-faint)',
      }}
    >
      <span aria-hidden>{favorite ? '★' : '☆'}</span>
    </button>
  );
}

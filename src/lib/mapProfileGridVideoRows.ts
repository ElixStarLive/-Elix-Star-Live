/**
 * Map liked/saved API rows → Profile grid video cards.
 */

import { resolveGridThumbnailUrl } from './bunnyStorage';

export type ProfileGridVideoApiRow = {
  id: string;
  thumbnail?: string;
  thumbnail_url?: string;
  url?: string;
  views?: number;
};

export type ProfileGridVideoCard = {
  id: string;
  thumbnail_url: string;
  url: string;
  views: number;
  is_public: true;
};

export function mapProfileGridVideoRows(
  vids: ProfileGridVideoApiRow[],
): ProfileGridVideoCard[] {
  return vids.map((v) => ({
    id: v.id,
    thumbnail_url: resolveGridThumbnailUrl(v.thumbnail || v.thumbnail_url, v.url),
    url: v.url || '',
    views: v.views || 0,
    is_public: true,
  }));
}

export type ProfileRepostApiItem = {
  target_type: string;
  target_id: string;
  is_live?: boolean;
  avatar_url?: string;
  views?: number;
  viewer_count?: number;
  thumbnail_url?: string;
  video_url?: string;
};

export function mapProfileRepostItemsToGrid(
  items: ProfileRepostApiItem[],
): Array<
  | (ProfileGridVideoCard & {
      content_kind: 'live';
      stream_key: string;
      is_live?: boolean;
    })
  | (ProfileGridVideoCard & { content_kind: 'video' })
> {
  return items.map((item) => {
    if (item.target_type === 'live') {
      return {
        id: `live:${item.target_id}`,
        content_kind: 'live' as const,
        stream_key: item.target_id,
        is_live: item.is_live,
        thumbnail_url: item.avatar_url || '',
        url: '',
        views: item.views || item.viewer_count || 0,
        is_public: true as const,
      };
    }
    return {
      id: item.target_id,
      content_kind: 'video' as const,
      thumbnail_url: resolveGridThumbnailUrl(item.thumbnail_url, item.video_url),
      url: item.video_url || '',
      views: item.views || 0,
      is_public: true as const,
    };
  });
}

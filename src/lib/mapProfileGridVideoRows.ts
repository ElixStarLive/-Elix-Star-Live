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

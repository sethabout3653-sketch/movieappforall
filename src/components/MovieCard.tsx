import React, { useState, useEffect } from 'react';
import { Play, Star, Info, Film, Tv, Bookmark, Check, Calendar } from 'lucide-react';
import { motion } from 'motion/react';
import { MediaItem, MediaType } from '../types';
import { getCertification } from '../services/tmdb';

interface MovieCardProps {
  item: MediaItem;
  fullWidth?: boolean;
  onPlay: (item: MediaItem) => void;
  onMoreInfo?: (item: MediaItem) => void;
  isSaved?: boolean;
  onToggleWatchlist?: (item: MediaItem) => void;
}

export const MovieCard: React.FC<MovieCardProps> = ({
  item,
  fullWidth = false,
  onPlay,
  onMoreInfo,
  isSaved = false,
  onToggleWatchlist,
}) => {
  const [certification, setCertification] = useState<string>(item.certification || '');
  const [imgError, setImgError] = useState<boolean>(false);
  const [triedBackdrop, setTriedBackdrop] = useState<boolean>(false);

  const mediaType: MediaType = item.media_type || (item.title ? 'movie' : 'tv');
  const title = item.title || item.name || 'Untitled';
  const releaseDateStr = item.release_date || item.first_air_date;
  const releaseYear = (releaseDateStr || '').split('-')[0];
  
  const isUnreleased = releaseDateStr ? new Date(releaseDateStr) > new Date() : false;
  const formattedReleaseDate = releaseDateStr 
    ? new Date(releaseDateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  // Determine current image URL
  const getPosterUrl = () => {
    if (imgError) return null;
    if (!triedBackdrop && item.poster_path) {
      return `https://image.tmdb.org/t/p/w500${item.poster_path}`;
    }
    if (item.backdrop_path) {
      return `https://image.tmdb.org/t/p/w500${item.backdrop_path}`;
    }
    if (item.poster_path) {
      return `https://image.tmdb.org/t/p/w500${item.poster_path}`;
    }
    return null;
  };

  const currentPosterUrl = getPosterUrl();

  const handleImgError = () => {
    if (!triedBackdrop && item.backdrop_path && item.poster_path) {
      setTriedBackdrop(true);
    } else {
      setImgError(true);
    }
  };

  useEffect(() => {
    if (!certification) {
      getCertification(item.id, mediaType).then((cert) => {
        setCertification(cert);
      });
    }
  }, [item.id, mediaType, certification]);

  const ratingNumber = item.vote_average ? item.vote_average.toFixed(1) : '8.1';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      whileHover={{ scale: 1.05, y: -6, zIndex: 30 }}
      onClick={() => !isUnreleased && onPlay(item)}
      className={`relative group ${
        fullWidth ? 'w-full' : 'w-36 sm:w-48 md:w-52 flex-shrink-0'
      } rounded-3xl overflow-hidden bg-gradient-to-b from-zinc-900/90 via-zinc-900/60 to-black border border-white/10 hover:border-white shadow-xl hover:shadow-[0_12px_40px_rgba(255,255,255,0.15)] transition-colors duration-300 ${isUnreleased ? 'opacity-60 grayscale-[30%] cursor-not-allowed hover:border-white/20' : 'cursor-pointer'}`}
    >
      {/* Poster Image Container */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-950 rounded-t-3xl">
        {currentPosterUrl ? (
          <img
            src={currentPosterUrl}
            alt={title}
            loading="lazy"
            onError={handleImgError}
            className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-110"
          />
        ) : (
          /* Styled Fallback Poster Card */
          <div className="w-full h-full bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-4 flex flex-col justify-between relative overflow-hidden border border-white/5">
            <div className="relative z-10 pt-8">
              {mediaType === 'movie' ? (
                <Film className="w-8 h-8 text-white/80 mb-2" />
              ) : (
                <Tv className="w-8 h-8 text-white/80 mb-2" />
              )}
              <p className="font-black text-sm text-white line-clamp-3 leading-snug drop-shadow-md">
                {title}
              </p>
              {releaseYear && (
                <span className="inline-block mt-2 text-[10px] font-bold text-zinc-400 bg-black/60 px-2 py-0.5 rounded border border-white/10">
                  {releaseYear}
                </span>
              )}
            </div>
            <div className="relative z-10 flex items-center justify-between text-[10px] text-zinc-400 border-t border-white/10 pt-2">
              <span className="uppercase font-bold text-white">{mediaType}</span>
              <span className="flex items-center gap-0.5 text-white">
                <Star className="w-3 h-3 fill-white" />
                {ratingNumber}
              </span>
            </div>
          </div>
        )}

        {/* ALWAYS ON FRONT Rating & Badge */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10">
          <span className="bg-black/80  text-white border border-white/30 text-[10px] sm:text-xs font-black px-1.5 py-0.5 rounded-md shadow-lg tracking-wide uppercase">
            {certification || (mediaType === 'movie' ? 'PG-13' : 'TV-MA')}
          </span>
          {!isUnreleased && (
            <span className="bg-black/80  text-white border border-white/30 text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded-md shadow-lg flex items-center gap-1">
              <Star className="w-3 h-3 fill-white stroke-none" />
              {ratingNumber}
            </span>
          )}
        </div>

        {/* Play Button or Coming Soon Overlay on Hover */}
        <div
          onClick={(e) => { 
            if (isUnreleased) {
              e.stopPropagation(); 
            } else {
              onPlay(item);
            }
          }}
          className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2 z-20 ${isUnreleased ? 'opacity-100' : ''}`}
        >
          {isUnreleased ? (
             <div className="text-center px-2">
                <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-white/70 mx-auto mb-2" />
                <p className="text-white font-extrabold text-[10px] sm:text-xs uppercase tracking-wider mb-1">Coming Soon</p>
                <p className="text-zinc-300 font-bold text-xs sm:text-sm">{formattedReleaseDate}</p>
             </div>
          ) : (
            <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center transform hover:scale-110 hover:bg-white hover:text-black transition-all border border-white/30">
              <Play className="w-6 h-6 fill-current ml-0.5" />
            </div>
          )}
        </div>
      </div>

      {/* Card Info Details */}
      <div className="p-3 space-y-1">
        <div className="flex items-start justify-between gap-1">
          <h3 className="font-extrabold text-xs sm:text-sm text-white truncate max-w-[70%]" title={title}>
            {title}
          </h3>
          <div className="flex items-center gap-1">
            {onToggleWatchlist && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleWatchlist(item);
                }}
                className={`p-1 rounded-full transition-colors ${
                  isSaved
                    ? 'text-white bg-white/20'
                    : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title={isSaved ? 'Remove from Watchlist' : 'Add to Watchlist'}
              >
                {isSaved ? <Check className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
              </button>
            )}
            {onMoreInfo && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMoreInfo(item);
                }}
                className="text-zinc-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                title="More Info"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Secondary Info Line */}
        <div className="flex items-center justify-between text-[10px] sm:text-xs text-zinc-400 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="uppercase font-extrabold text-white">
              {mediaType.toUpperCase()}
            </span>
            {releaseYear && <span className="text-zinc-500">• {releaseYear}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

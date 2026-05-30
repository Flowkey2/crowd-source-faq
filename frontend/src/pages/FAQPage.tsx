import React, { useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import SearchBar from '../components/ui/SearchBar';
import WordCloud from '../components/ui/WordCloud';
import { FAQDoodles } from '../components/ui/PageDoodles';
import api from '../utils/api';
import type { TrendingQuery } from '../types/ui';

// Icon components
const IconBook = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5h7a3 3 0 0 1 3 3v11H6a3 3 0 0 0-3 3z" />
    <path d="M21 5h-7a3 3 0 0 0-3 3v11h7a3 3 0 0 1 3 3z" />
  </svg>
);

const IconUsers = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="3" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M3 19a5 5 0 0 1 10 0" />
    <path d="M14 19a4 4 0 0 1 7 0" />
  </svg>
);

const IconClock = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
  </svg>
);

const IconShieldDoc = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3h6l4 4v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M14 3v4h4" />
    <path d="M9 14l2 2 4-4" />
  </svg>
);

const IconFileText = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3h6l4 4v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M14 3v4h4" />
    <path d="M8 13h8" />
    <path d="M8 17h8" />
  </svg>
);

const IconFolderCode = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 13l-2 2 2 2" />
    <path d="M15 13l2 2-2 2" />
  </svg>
);

const IconLayers = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l9 5-9 5-9-5 9-5z" />
    <path d="M3 12l9 5 9-5" />
    <path d="M3 17l9 5 9-5" />
  </svg>
);

const IconBadge = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M8 12l-2 8 4-2 2 2 2-2 4 2-2-8" />
  </svg>
);

const IconBriefcase = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M3 13h18" />
  </svg>
);

const IconGrid = (): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

// FAQ item type — covers both /faq GET response items and search results
export interface FAQItem {
  _id: string;
  question?: string;
  title?: string;
  answer?: string;
  body?: string;
  category?: string;
  categoryDescription?: string;
  description?: string;
  summary?: string;
  source?: 'faq' | 'community';
  status?: string;
  updatedAt?: string;
  createdAt?: string;
  [key: string]: unknown;
}

// Category tone helper
const getCategoryTone = (name: string = ''): { accent: string; halo: string } => {
  return { accent: 'text-accent', halo: 'bg-accent/10' };
};

// Helper functions
const getCategoryIcon = (name: string = ''): React.ReactNode => {
  const key = name.toLowerCase();
  if (key.includes('vibe') || key.includes('learning')) return <IconBook />;
  if (key.includes('team')) return <IconUsers />;
  if (key.includes('timing') || key.includes('schedule')) return <IconClock />;
  if (key.includes('noc') || key.includes('no objection')) return <IconShieldDoc />;
  if (key.includes('offer')) return <IconFileText />;
  if (key.includes('project')) return <IconFolderCode />;
  if (key.includes('rosetta')) return <IconLayers />;
  if (key.includes('cert')) return <IconBadge />;
  if (key.includes('interview')) return <IconBriefcase />;
  return <IconGrid />;
};

const getCategoryDescription = (items: FAQItem[] = []): string => {
  if (!items.length) return '';
  const candidate = items[0]?.categoryDescription
    || items[0]?.description
    || items[0]?.summary
    || '';
  return typeof candidate === 'string' ? candidate : '';
};

const formatCategoryName = (name: string = ''): string => (
  name.replace(/^\s*\d+\s*[.)-]?\s*/g, '').trim()
);

const getQuestionTitle = (item: FAQItem): string => item?.question || item?.title || 'Untitled question';
const getAnswerText = (item: FAQItem): string => item?.answer || item?.body || '';

const formatDate = (value: unknown): string => {
  if (!value) return '';
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Sub-component props interfaces
interface CategoryPillsProps {
  categories: string[];
  activeCategory: string;
  onSelect: (name: string) => void;
}

interface CategoryCardProps {
  name: string;
  items: FAQItem[];
  onOpen: (name: string) => void;
}

interface CategoryGridProps {
  categories: string[];
  grouped: Record<string, FAQItem[]>;
  onOpen: (name: string) => void;
}

interface QuestionItemProps {
  item: FAQItem;
  onSelect: (item: FAQItem) => void;
}

interface QuestionListProps {
  items: FAQItem[];
  loading: boolean;
  sortOption: string;
  onSortChange: (option: string) => void;
  onSelect: (item: FAQItem) => void;
  visibleCount: number;
  onLoadMore: () => void;
  emptyMessage: string;
}

interface QuestionDetailProps {
  item: FAQItem;
  relatedItems: FAQItem[];
  onBack: () => void;
  onSelectRelated: (item: FAQItem) => void;
}

interface SearchDropdownProps {
  query: string;
  items: FAQItem[];
  categories: string[];
  onSelectQuestion: (item: FAQItem) => void;
  onSelectCategory: (name: string) => void;
  onClear: () => void;
  loading: boolean;
}

// Sub-components
function CategoryPills({ categories, activeCategory, onSelect }: CategoryPillsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: number) => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollBy({ left: direction * 240, behavior: 'smooth' });
  };

  const allActive = !activeCategory;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">
          Browse categories
        </p>
        <span className="text-xs text-ink-soft">{categories.length} categories</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleScroll(-1)}
          className="shrink-0 w-8 h-8 rounded-full border border-border/80 bg-white/90 shadow-subtle flex items-center justify-center text-ink-faint hover:text-ink hover:border-ink/20 hover:bg-cream transition-all"
          aria-label="Scroll categories left"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div
          ref={scrollerRef}
          className="flex-1 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
        >
          <button
            onClick={() => onSelect('')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0
              ${allActive
                ? 'bg-ink text-white border-ink'
                : 'bg-white/80 text-ink border-border/70 hover:bg-cream hover:-translate-y-0.5 hover:shadow-subtle'
              }`}
          >
            <span className={allActive ? 'text-white' : 'text-ink-faint'}>
              <IconGrid />
            </span>
            All
          </button>

          {categories.map((name) => {
            const isActive = activeCategory?.toLowerCase() === name.toLowerCase();
            const tone = getCategoryTone(name);
            return (
              <button
                key={name}
                onClick={() => onSelect(name)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0
                  ${isActive
                    ? 'bg-accent text-white border-accent/60 shadow-[0_10px_26px_rgba(90,122,90,0.25)]'
                    : 'bg-white/80 text-ink border-border/70 hover:bg-cream hover:-translate-y-0.5 hover:shadow-subtle'
                  }`}
              >
                <span className={isActive ? 'text-white' : tone.accent}>
                  {getCategoryIcon(name)}
                </span>
                {formatCategoryName(name)}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => handleScroll(1)}
          className="shrink-0 w-8 h-8 rounded-full border border-border/80 bg-white/90 shadow-subtle flex items-center justify-center text-ink-faint hover:text-ink hover:border-ink/20 hover:bg-cream transition-all"
          aria-label="Scroll categories right"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CategoryCard({ name, items, onOpen }: CategoryCardProps) {
  const tone = getCategoryTone(name);
  const description = getCategoryDescription(items);
  const previewPrimary = items.slice(0, 2);
  const previewSecondary = items.slice(2, 4);

  return (
    <button
      onClick={() => onOpen(name)}
      className="group relative text-left rounded-2xl border border-border/70 bg-white/80 p-5 shadow-subtle transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover overflow-hidden"
    >
      <div className={`absolute -top-6 -right-8 w-24 h-24 rounded-full blur-2xl ${tone.halo}`} />
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div className={`w-10 h-10 rounded-xl bg-cream border border-border/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] flex items-center justify-center ${tone.accent}`}>
          {getCategoryIcon(name)}
        </div>
        <span className="text-[11px] font-semibold text-ink-faint">
          {items.length} questions
        </span>
      </div>

      <h3 className="mt-4 text-base font-semibold text-ink">
        {formatCategoryName(name)}
      </h3>

      {description && (
        <p className="mt-1 text-xs text-ink-soft leading-relaxed line-clamp-2">
          {description}
        </p>
      )}

      <div className="mt-4">
        <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">Top questions</p>
        <ul className="mt-2 space-y-1.5">
          {previewPrimary.map((item) => (
            <li key={item._id} className="text-xs text-ink-soft line-clamp-1">
              {getQuestionTitle(item)}
            </li>
          ))}
        </ul>
        {previewSecondary.length > 0 && (
          <div className="mt-2 overflow-hidden max-h-0 opacity-0 group-hover:max-h-20 group-hover:opacity-100 transition-all duration-300">
            <ul className="space-y-1.5">
              {previewSecondary.map((item) => (
                <li key={item._id} className="text-xs text-ink-soft line-clamp-1">
                  {getQuestionTitle(item)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-ink-faint">
        <span>Explore category</span>
        <span className="text-accent opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
          View all
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </span>
      </div>
    </button>
  );
}

function CategoryGrid({ categories, grouped, onOpen }: CategoryGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {categories.map((name) => (
        <CategoryCard
          key={name}
          name={name}
          items={grouped[name] || []}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function QuestionItem({ item, onSelect }: QuestionItemProps) {
  const title = getQuestionTitle(item);
  const answer = getAnswerText(item);
  const metaDate = formatDate(item?.updatedAt || item?.createdAt);
  const sourceLabel = item?.source ? (item.source === 'faq' ? 'FAQ' : 'Community') : '';

  return (
    <button
      onClick={() => onSelect(item)}
      className="w-full text-left px-5 py-4 hover:bg-cream transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink leading-snug line-clamp-2">
            {title}
          </p>
          {answer && (
            <p className="mt-1 text-xs text-ink-soft leading-relaxed line-clamp-2">
              {answer}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
            {sourceLabel && (
              <span className="px-2 py-0.5 rounded-full bg-mist text-ink-soft">
                {sourceLabel}
              </span>
            )}
            {item?.category && <span>{formatCategoryName(item.category)}</span>}
            {metaDate && <span>{metaDate}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

function QuestionList({
  items,
  loading,
  sortOption,
  onSortChange,
  onSelect,
  visibleCount,
  onLoadMore,
  emptyMessage,
}: QuestionListProps) {
  const sortedItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    if (sortOption === 'recent') {
      return [...items].sort((a, b) => {
        const aDate = new Date(a?.createdAt || 0).getTime();
        const bDate = new Date(b?.createdAt || 0).getTime();
        return bDate - aDate;
      });
    }
    return items;
  }, [items, sortOption]);

  const visibleItems = sortedItems.slice(0, visibleCount);

  return (
    <div className="bg-card rounded-2xl border border-border shadow-subtle overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border/60">
        <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">
          {sortedItems.length} questions
        </p>
        <div className="flex items-center gap-2 text-xs text-ink-soft">
          <span>Sort</span>
          <select
            value={sortOption}
            onChange={(e) => onSortChange(e.target.value)}
            className="rounded-full border border-border bg-white px-3 py-1 text-xs text-ink focus:outline-none"
          >
            <option value="relevant">Most relevant</option>
            <option value="recent">Most recent</option>
          </select>
        </div>
      </div>

      <div className="divide-y divide-border/60">
        {loading && (
          <div className="p-5 space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-mist" />
            ))}
          </div>
        )}

        {!loading && visibleItems.map((item, idx) => (
          <QuestionItem
            key={item._id || item.title || item.question || idx}
            item={item}
            onSelect={onSelect}
          />
        ))}

        {!loading && sortedItems.length === 0 && (
          <div className="px-5 py-6 text-sm text-ink-soft">
            {emptyMessage}
          </div>
        )}
      </div>

      {!loading && visibleCount < sortedItems.length && (
        <div className="px-5 py-4 border-t border-border/60">
          <button
            onClick={onLoadMore}
            className="w-full rounded-full border border-border bg-white px-4 py-2 text-xs font-semibold text-ink hover:bg-cream transition-colors"
          >
            Load more questions
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionDetail({ item, relatedItems, onBack, onSelectRelated }: QuestionDetailProps) {
  const title = getQuestionTitle(item);
  const answer = getAnswerText(item);
  const metaDate = formatDate(item?.updatedAt || item?.createdAt);
  const sourceLabel = item?.source ? (item.source === 'faq' ? 'FAQ' : 'Community') : '';
  const highlight = answer ? answer.split('. ').slice(0, 1).join('. ') : '';

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6">
      <aside className="hidden lg:flex flex-col gap-4">
        <div className="rounded-2xl border border-border/70 bg-white/80 p-4">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">Category</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-ink">
            <span className="w-8 h-8 rounded-xl bg-mist flex items-center justify-center text-ink-faint">
              {getCategoryIcon(item?.category || '')}
            </span>
            <span>{formatCategoryName(item?.category || 'General')}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-white/80 p-4">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">Related questions</p>
          <div className="mt-3 space-y-2">
            {relatedItems.length === 0 && (
              <p className="text-xs text-ink-soft">No related questions yet.</p>
            )}
            {relatedItems.map((rel) => (
              <button
                key={rel._id}
                onClick={() => onSelectRelated(rel)}
                className="w-full text-left text-xs text-ink hover:text-accent transition-colors line-clamp-2"
              >
                {getQuestionTitle(rel)}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div className="bg-card rounded-2xl border border-border shadow-subtle p-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {sourceLabel && (
            <span className="px-2.5 py-1 rounded-full bg-mist text-[11px] font-semibold text-ink-soft">
              {sourceLabel}
            </span>
          )}
          {metaDate && (
            <span className="text-[11px] text-ink-faint">Updated {metaDate}</span>
          )}
        </div>

        <h2 className="mt-4 text-xl font-semibold text-ink leading-snug">
          {title}
        </h2>

        {answer ? (
          <div className="mt-4 space-y-4 text-sm text-ink-soft leading-relaxed whitespace-pre-wrap">
            {answer}
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">No answer available yet.</p>
        )}

        {highlight && (
          <div className="mt-5 rounded-xl border border-accent/15 bg-accent-light p-4">
            <p className="text-[11px] font-semibold text-accent uppercase tracking-wide">Key takeaway</p>
            <p className="mt-2 text-sm text-ink/70">{highlight}.</p>
          </div>
        )}

        {relatedItems.length > 0 && (
          <div className="mt-6">
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">Related questions</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {relatedItems.map((rel) => (
                <button
                  key={rel._id}
                  onClick={() => onSelectRelated(rel)}
                  className="px-3 py-1.5 rounded-full border border-border/70 bg-white text-xs text-ink hover:border-accent/50 hover:text-accent transition-colors"
                >
                  {getQuestionTitle(rel)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Report FAQ */}
        <ReportFAQButton item={item} />
      </div>
    </div>
  );
}

// ─── Report FAQ Button ─────────────────────────────────────────────────────────

interface ReportFAQButtonProps {
  item: FAQItem;
}

function ReportFAQButton({ item }: ReportFAQButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || reason.trim().length < 10) return;
    setError('');
    setLoading(true);
    try {
      await api.post(`/faq/${item._id}/report`, { reason });
      setDone(true);
      setReason('');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to submit report.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-6 flex items-center gap-1.5 text-[11px] text-ink-faint hover:text-danger transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Report this question
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl border border-border shadow-float w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-ink">Report FAQ</h3>
              <button onClick={() => { setOpen(false); setDone(false); setError(''); }} className="w-7 h-7 rounded-full bg-mist flex items-center justify-center text-ink-faint hover:text-ink transition-colors">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {done ? (
              <div className="text-center py-4">
                <span className="text-2xl">✅</span>
                <p className="mt-2 text-sm font-medium text-ink">Report submitted.</p>
                <p className="mt-1 text-xs text-ink-faint">Thank you for helping keep the FAQ accurate.</p>
                <button onClick={() => { setOpen(false); setDone(false); }} className="mt-4 px-4 py-2 rounded-full bg-mist text-xs font-medium text-ink hover:bg-border transition-colors">
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <p className="text-xs text-ink-soft leading-relaxed">
                  Is this FAQ inaccurate, outdated, or incorrect? Let us know why.
                </p>
                <div>
                  <label className="block text-xs font-medium text-ink-soft mb-1.5">Reason</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. This answer is outdated, the policy changed, or the info is incorrect…"
                    className="w-full rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all resize-none"
                  />
                  <p className="text-[10px] text-ink-faint mt-1 text-right">{reason.length}/500</p>
                </div>
                {error && (
                  <p className="text-xs text-danger bg-danger-light border border-danger/15 rounded-xl px-3 py-2">{error}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={reason.trim().length < 10 || loading}
                    className="flex-1 py-2.5 rounded-full bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <span className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin inline-block" />
                        Submitting…
                      </>
                    ) : 'Submit Report'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); setError(''); }}
                    className="px-4 py-2.5 rounded-full border border-border text-xs font-semibold text-ink hover:bg-mist transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SearchDropdown({
  query,
  items,
  categories,
  onSelectQuestion,
  onSelectCategory,
  onClear,
  loading,
}: SearchDropdownProps) {
  return (
    <div className="absolute left-0 right-0 top-full mt-3 z-40 animate-fade-in">
      <div className="rounded-3xl border border-border bg-card/95 backdrop-blur-xl shadow-float">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
              Search suggestions
            </p>
            <p className="text-sm text-ink mt-1">
              Results for <span className="font-semibold">"{query}"</span>
            </p>
          </div>
          <button
            onClick={onClear}
            className="text-xs font-medium text-ink-soft hover:text-ink transition-colors"
          >
            Clear
          </button>
        </div>

        <div className="grid gap-4 px-4 pb-4 lg:grid-cols-[1.35fr_0.95fr]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
                Matching questions
              </p>
              <span className="text-xs text-ink-faint">{items.length} found</span>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {loading && (
                [1, 2, 3].map((i) => (
                  <div key={i} className="h-[72px] rounded-2xl border border-border/60 bg-white/70 animate-pulse" />
                ))
              )}
              {!loading && items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border bg-white/70 p-4 text-xs text-ink-soft">
                  No matches yet. Keep typing or browse a category.
                </div>
              )}
              {!loading && items.map((item, idx) => (
                <button
                  key={item._id || item.title || item.question || idx}
                  onClick={() => onSelectQuestion(item)}
                  className="w-full text-left rounded-2xl border border-border/60 bg-white/70 px-3 py-2 hover:bg-cream transition-colors"
                >
                  <p className="text-sm font-semibold text-ink line-clamp-1">
                    {getQuestionTitle(item)}
                  </p>
                  <p className="text-xs text-ink-soft line-clamp-1 mt-1">
                    {getAnswerText(item)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
              Categories
            </p>
            <div className="mt-2 space-y-1">
              {categories.slice(0, 7).map((name) => (
                <button
                  key={name}
                  onClick={() => onSelectCategory(name)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-2xl border border-border/60 bg-white/70 text-left hover:bg-cream transition-colors"
                >
                  <span className="text-ink-faint">{getCategoryIcon(name)}</span>
                  <span className="text-sm text-ink">{formatCategoryName(name)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



// Search Feedback Prompt
interface SearchFeedbackProps {
  searchQuery: string;
  resultFaqId?: string;
}

function SearchFeedback({ searchQuery, resultFaqId }: SearchFeedbackProps) {
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<'prompt' | 'form' | 'done'>('prompt');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDismissed(false);
      setPhase('prompt');
    }, 8000);
    return () => clearTimeout(timer);
  }, [searchQuery, resultFaqId]);

  useEffect(() => {
    setDismissed(false);
    setPhase('prompt');
    setFeedback('');
    setError('');
  }, [searchQuery]);

  const handleYes = () => {
    setDismissed(true);
    setPhase('done');
  };

  const handleNo = () => {
    setPhase('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/search/unresolved', {
        query: searchQuery,
        faqId: resultFaqId || undefined,
        feedback: feedback.trim(),
      });
      setPhase('done');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (dismissed || phase === 'done') return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
      <div className="bg-card rounded-2xl border border-border shadow-float p-4">
        {phase === 'prompt' ? (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-ink">Did this answer your question?</p>
            <button
              onClick={handleYes}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors"
            >
              <span>👍</span> Yes, I am good
            </button>
            <button
              onClick={handleNo}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border bg-white text-xs font-semibold text-ink hover:bg-mist transition-colors"
            >
              No, I need more help
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">What specifically did not work?</p>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-ink-faint hover:text-ink transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder="e.g. This FAQ did not mention deadlines for submissions..."
              className="w-full rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all resize-none"
              autoFocus
            />
            {error && (
              <p className="text-xs text-danger">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={feedback.trim().length < 10 || loading}
                className="flex-1 py-2.5 rounded-full bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin inline-block" /> Submitting...</>
                ) : 'Submit'}
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="px-4 py-2.5 rounded-full border border-border text-xs font-semibold text-ink hover:bg-mist transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


export default function FAQPage() {
  const [grouped, setGrouped] = useState<Record<string, FAQItem[]>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [activeQuestion, setActiveQuestion] = useState<FAQItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FAQItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortOption, setSortOption] = useState('relevant');
  const [visibleCount, setVisibleCount] = useState(8);
  const searchBarRef = useRef<HTMLInputElement>(null);
  const [trendingWords, setTrendingWords] = useState<TrendingQuery[]>([]);

  const [resultFaqId, setResultFaqId] = useState<string | undefined>(undefined);

  // Track top result FAQ ID when search results arrive
  useEffect(() => {
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      setResultFaqId((searchResults[0] as FAQItem)._id);
    }
  }, [searchResults]);

  useEffect(() => {
    api.get('/faq')
      .then((res) => {
        setGrouped(res.data.grouped || {});
        setTotal(res.data.total || 0);
      })
      .catch((err: unknown) => {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load FAQs. Please try again.';
        setError(message);
      })
      .finally(() => setLoading(false));

    // Fetch trending queries for the word cloud
    api.get('/search/trending')
      .then((res) => setTrendingWords((res.data.trending || []).map((t: { query: string; count: number }) => ({ query: t.query, count: t.count }))))
      .catch((err: unknown) => {
        console.error('Failed to load trending queries:', err);
      });
  }, []);

  const categories = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  const flatQuestions = useMemo(() => (
    categories.flatMap((name) => (grouped[name] || []).map((item) => ({
      ...item,
      category: item.category || name,
      source: item.source || 'faq',
    })))
  ), [categories, grouped]);

  useEffect(() => {
    // Check for pre-selected FAQ from HomePage search navigation
    // Guard: only run once grouped data is actually available (race condition fix)
    if (!grouped || Object.keys(grouped).length === 0) return;

    const highlightStr = sessionStorage.getItem('yaksha_faq_highlight');
    if (highlightStr) {
      try {
        const highlight = JSON.parse(highlightStr) as FAQItem;
        sessionStorage.removeItem('yaksha_faq_highlight');
        const category = highlight.category || '';
        if (category && grouped[category]) {
          const found = grouped[category].find((item) => item._id === highlight._id);
          if (found) {
            setActiveQuestion({ ...found, category });
            setActiveCategory(category);
          }
        }
      } catch {
        sessionStorage.removeItem('yaksha_faq_highlight');
      }
    }
  }, [grouped]);

  useEffect(() => {
    setVisibleCount(8);
  }, [activeCategory, searchResults, searchQuery]);

  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults(null);
      setSearchLoading(false);
    }
  }, [searchQuery]);

  const activeCategoryItems = activeCategory ? (grouped[activeCategory] || []) : [];
  const activeCategoryMeta = getCategoryDescription(activeCategoryItems);

  const searchActive = searchQuery.trim().length >= 3 && Array.isArray(searchResults);
  const showDropdown = searchQuery.trim().length > 0;

  const dropdownItems = useMemo(() => {
    if (Array.isArray(searchResults) && searchQuery.trim().length >= 3) {
      return searchResults;
    }
    if (!searchQuery.trim()) {
      return flatQuestions.slice(0, 5);
    }
    const normalized = searchQuery.trim().toLowerCase();
    return flatQuestions.filter((item) => (
      getQuestionTitle(item).toLowerCase().includes(normalized)
    )).slice(0, 5);
  }, [flatQuestions, searchResults, searchQuery]);

  const relatedItems = useMemo(() => {
    if (!activeQuestion?.category) return [];
    const pool = grouped[activeQuestion.category] || [];
    return pool.filter((item) => item._id !== activeQuestion._id).slice(0, 5);
  }, [activeQuestion, grouped]);

  const handleCategoryOpen = (name: string) => {
    setActiveCategory(name);
    setActiveQuestion(null);
    setSearchQuery('');
    setSearchResults(null);
    setSearchLoading(false);
  };

  const handleQuestionOpen = (item: FAQItem) => {
    setActiveQuestion(item);
  };

  const handleBackToCategories = () => {
    setActiveCategory('');
    setActiveQuestion(null);
  };

  const handleBackFromDetail = () => {
    setActiveQuestion(null);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      setActiveCategory('');
      setActiveQuestion(null);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchLoading(false);
  };

  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <FAQDoodles />
      <Navbar />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-10 relative z-10">
        <div className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-serif text-ink tracking-tight">
            Frequently Asked Questions
          </h1>
          {total > 0 && (
            <p className="mt-2 text-sm text-ink-soft">
              {total} questions across {categories.length} categories
            </p>
          )}
        </div>

        {/* Backdrop blur overlay when search is active */}
        {showDropdown && (
          <div
            className="fixed inset-0 z-30 bg-ink/20 backdrop-blur-sm transition-opacity duration-300"
            onClick={handleClearSearch}
            aria-hidden="true"
          />
        )}

        <section className="relative mb-10 sm:mb-12">
          <div className={`relative max-w-3xl mx-auto ${showDropdown ? 'z-40' : 'z-20'}`}>
            <SearchBar
              ref={searchBarRef}
              value={searchQuery}
              onQueryChange={handleSearchChange}
              onResults={setSearchResults}
              onLoading={setSearchLoading}
              placeholder="Search for topics, keywords, or questions..."
            />

            {showDropdown && (
              <SearchDropdown
                query={searchQuery}
                items={dropdownItems}
                categories={categories}
                onSelectQuestion={handleQuestionOpen}
                onSelectCategory={handleCategoryOpen}
                onClear={handleClearSearch}
                loading={searchLoading}
              />
            )}
          </div>

          <div className={`mt-5 sm:mt-6 transition-all duration-300 ${
            showDropdown ? 'opacity-70 translate-y-1' : 'opacity-100'
          }`}>
            <CategoryPills
              categories={categories}
              activeCategory={activeCategory}
              onSelect={handleCategoryOpen}
            />
          </div>

          {/* Trending Queries Word Cloud */}
          {trendingWords.length > 0 && !showDropdown && !activeCategory && !activeQuestion && !searchActive && (
            <div className="mt-5 transition-all duration-300">
              <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Trending searches</p>
              <div className="bg-card/60 rounded-2xl border border-border/50 shadow-subtle">
                <WordCloud
                  words={trendingWords}
                  onWordClick={(query: string) => {
                    setSearchQuery(query);
                    handleSearchChange(query);
                  }}
                  maxWords={20}
                />
              </div>
            </div>
          )}
        </section>

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[220px] rounded-2xl border border-border bg-white/70 animate-pulse" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl bg-danger-light border border-danger/15 p-6 text-center space-y-3">
            <p className="text-sm text-danger font-medium">{error}</p>
            <button
              onClick={() => { setError(''); setLoading(true); api.get('/faq').then(res => { setGrouped(res.data.grouped || {}); setTotal(res.data.total || 0); }).catch((err: unknown) => { const m = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load FAQs.'; setError(m); }).finally(() => setLoading(false)); }}
              className="px-5 py-2 text-sm font-medium bg-danger text-white rounded-full hover:bg-danger/90 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && activeQuestion && (
          <QuestionDetail
            item={activeQuestion}
            relatedItems={relatedItems}
            onBack={handleBackFromDetail}
            onSelectRelated={handleQuestionOpen}
          />
        )}

        {!loading && !error && !activeQuestion && searchActive && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">Search results</p>
                <h2 className="text-lg font-semibold text-ink">Results for "{searchQuery}"</h2>
              </div>
              <button
                onClick={handleClearSearch}
                className="text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
              >
                Clear search
              </button>
            </div>

            <QuestionList
              items={searchResults || []}
              loading={searchLoading}
              sortOption={sortOption}
              onSortChange={setSortOption}
              onSelect={handleQuestionOpen}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((prev) => prev + 6)}
              emptyMessage="No results yet. Try another keyword or browse a category."
            />
          </section>
        )}

        {!loading && !error && !activeQuestion && !searchActive && activeCategory && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <button
                  onClick={handleBackToCategories}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Back to categories
                </button>
                <h2 className="mt-3 text-xl font-semibold text-ink flex items-center gap-2">
                  <span className="w-9 h-9 rounded-xl bg-mist flex items-center justify-center text-ink-faint">
                    {getCategoryIcon(activeCategory)}
                  </span>
                  {formatCategoryName(activeCategory)}
                </h2>
                {activeCategoryMeta && (
                  <p className="mt-2 text-sm text-ink-soft max-w-2xl">
                    {activeCategoryMeta}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-soft">
                <span>{activeCategoryItems.length} questions</span>
              </div>
            </div>

            <QuestionList
              items={activeCategoryItems.map((item) => ({
                ...item,
                category: activeCategory,
                source: item.source || 'faq',
              }))}
              loading={false}
              sortOption={sortOption}
              onSortChange={setSortOption}
              onSelect={handleQuestionOpen}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((prev) => prev + 6)}
              emptyMessage="No questions in this category yet."
            />
          </section>
        )}

        {!loading && !error && !activeQuestion && !searchActive && !activeCategory && (
          <CategoryGrid
            categories={categories}
            grouped={grouped}
            onOpen={handleCategoryOpen}
          />
        )}
      </main>

      <Footer />

      {searchActive && (
        <SearchFeedback searchQuery={searchQuery} resultFaqId={resultFaqId} />
      )}
    </div>
  );
}
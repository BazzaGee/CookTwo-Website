import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Sparkles, Clock, Plus, Check, CalendarDays, Bookmark, Send, ShoppingCart, Package, ChevronDown, ChevronUp, Trash2, ImageIcon, RefreshCw, AlertCircle } from 'lucide-react';
import { useMealChat, type ChatMessage } from '../hooks/useMealChat';
import { useRecipes } from '../hooks/useRecipes';
import { useWeekPlan } from '../hooks/useWeekPlan';
import { useGroceryList } from '../hooks/useGroceryList';
import { useMealImage } from '../hooks/useMealImage';

import type { GeneratedMeal } from '../types/meal';

// Version: 2026-06-08-fix-no-mock
console.log('[MealPlanTab] v2026-06-08-fix-no-mock loaded');

const DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const;

export default function MealPlanTab() {
  const [view, setView] = useState<'single' | 'week' | 'saved'>('single');

  return (
    <div className="px-6 py-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-text-primary text-3xl font-semibold tracking-tight">
            {view === 'single' ? 'What should we cook?' : view === 'saved' ? 'Our recipes' : 'Our week'}
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            {view === 'single'
              ? 'Chat with AI to plan your meal.'
              : view === 'saved'
                ? 'Meals you love, saved for later.'
                : 'Plan the week. Shop once.'}
          </p>
        </div>
        <div className="flex bg-cream-dark rounded-xl p-1">
          <button
            type="button"
            onClick={() => setView('single')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              view === 'single' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary'
            }`}
          >
            Tonight
          </button>
          <button
            type="button"
            onClick={() => setView('saved')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              view === 'saved' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary'
            }`}
          >
            Saved
          </button>
          <button
            type="button"
            onClick={() => setView('week')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              view === 'week' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary'
            }`}
          >
            Week
          </button>
        </div>
      </div>

      {view === 'single' ? <MealChatView /> : view === 'saved' ? <SavedRecipesView /> : <WeekView />}
    </div>
  );
}

function MealChatView() {
  const { messages, isTyping, error, sendMessage, clearChat } = useMealChat();
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const lastMsgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lastMsgRef.current) {
      lastMsgRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isTyping]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || isTyping) return;
    sendMessage(input);
    setInput('');
  }

  function handleGenerateMeal() {
    sendMessage("Suggest a meal for tonight based on what we have in the pantry");
    setInput('');
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 220px)' }}>
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && !isTyping && (
          <div className="text-center pt-12 pb-4">
            <div className="w-16 h-16 bg-sage/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <Sparkles size={28} className="text-sage" />
            </div>
            <p className="text-text-primary text-xl font-semibold mb-1">
              What should we cook?
            </p>
            <p className="text-text-secondary text-sm leading-relaxed mb-6 max-w-[260px] mx-auto">
              One tap to check your pantry and suggest a meal.
            </p>
            <button
              type="button"
              onClick={handleGenerateMeal}
              className="bg-sage text-white font-medium py-3.5 px-8 rounded-2xl hover:bg-sage-dark active:scale-[0.98] transition-all inline-flex items-center gap-2 text-base"
            >
              <Sparkles size={20} />
              Generate a meal
            </button>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={msg.id} ref={i === messages.length - 1 ? lastMsgRef : undefined}>
            <ChatBubble message={msg} />
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-cream border border-border rounded-2xl rounded-bl-md px-4 py-3 max-w-[85%]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-sage/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-sage/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-sage/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center">
            <p className="text-error text-sm">{error}</p>
            <button
              type="button"
              onClick={clearChat}
              className="mt-2 text-sage text-sm font-medium hover:text-sage-dark"
            >
              Start over
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-3 mt-2">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Questions? Substitutions? Ask here..."
            disabled={isTyping}
            className="flex-1 bg-white border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-sage/30 focus:border-sage/50 disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="bg-sage text-white px-4 py-3 rounded-xl hover:bg-sage-dark active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center"
          >
            <Send size={18} />
          </button>
        </form>
        {messages.length > 0 && (
          <div className="flex items-center justify-between mt-2">
            <button
              type="button"
              onClick={handleGenerateMeal}
              className="text-sage text-xs font-medium hover:text-sage-dark transition-colors flex items-center gap-1"
            >
              <Sparkles size={12} />
              New meal
            </button>
            <button
              type="button"
              onClick={clearChat}
              className="text-text-secondary text-xs hover:text-error transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl ${
          isUser
            ? 'bg-sage text-white rounded-br-md px-4 py-3'
            : 'bg-white border border-border rounded-bl-md px-4 py-3'
        }`}
      >
        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isUser ? 'text-white' : 'text-text-primary'}`}>
          {message.content}
        </p>

        {!isUser && message.meal && (
          <div className="mt-3">
            <InlineMealCard meal={message.meal} />
          </div>
        )}

        {!isUser && (message.addedToList || message.addedToPantry) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.addedToPantry && message.addedToPantry.length > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-sage/10 text-sage text-xs font-medium px-2.5 py-1 rounded-lg">
                <Package size={12} />
                {message.addedToPantry.length} item{message.addedToPantry.length > 1 ? 's' : ''} added to pantry
              </span>
            )}
            {message.addedToList && message.addedToList.length > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-terracotta/10 text-terracotta text-xs font-medium px-2.5 py-1 rounded-lg">
                <ShoppingCart size={12} />
                {message.addedToList.length} item{message.addedToList.length > 1 ? 's' : ''} added to list
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InlineMealCard({ meal }: { meal: GeneratedMeal }) {
  const [expanded, setExpanded] = useState(false);
  const { saveRecipe, isSaving, hasSaved } = useMealSave(meal);
  const missingCount = meal.ingredients.filter((i) => !i.have).length;
  const haveCount = meal.ingredients.filter((i) => i.have).length;
  const { addItem } = useGroceryList();
  const [addedMissing, setAddedMissing] = useState(false);
  const { url: imageUrl, generating: imageGenerating, error: imageError, generate: generateImage } = useMealImage(meal.name);

  function handleAddMissing() {
    const missing = meal.ingredients.filter((i) => !i.have);
    for (const item of missing) {
      addItem({ name: item.name });
    }
    setAddedMissing(true);
  }

  return (
    <div className="bg-cream/60 rounded-xl overflow-hidden border border-border/50">
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-text-primary text-base font-semibold">{meal.name}</h3>
            <p className="text-text-secondary text-xs mt-0.5">{meal.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2 text-xs">
          <span className="flex items-center gap-1 text-text-secondary">
            <Clock size={12} />
            {meal.timeMinutes}m
          </span>
          <span className="flex items-center gap-1 text-sage font-medium">
            <Check size={12} />
            {haveCount} in pantry
          </span>
          {missingCount > 0 && (
            <span className="flex items-center gap-1 text-terracotta font-medium">
              <Plus size={12} />
              {missingCount} to buy
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { label: 'Cal', value: meal.calories },
            { label: 'P', value: `${meal.protein}g` },
            { label: 'C', value: `${meal.carbs}g` },
            { label: 'F', value: `${meal.fat}g` },
          ].map((stat) => (
            <div key={stat.label} className="text-center bg-white/60 rounded-lg py-1.5">
              <p className="text-text-secondary text-[10px] uppercase">{stat.label}</p>
              <p className="text-text-primary text-sm font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-center text-xs text-sage font-medium py-2 border-t border-border/50 hover:bg-cream/80 transition-colors"
      >
        {expanded ? 'Hide' : 'Show'} ingredients & steps
      </button>

      {expanded && (
        <div className="px-4 py-3 border-t border-border/50 space-y-3">
          {imageUrl && (
            <div>
              <p className="text-text-secondary text-[10px] uppercase tracking-[0.15em] font-medium mb-2">Photo</p>
              <img src={imageUrl} alt={meal.name} className="w-full rounded-lg object-cover aspect-square mb-2" loading="lazy" />
            </div>
          )}
          {imageError && !imageGenerating && (
            <p className="text-error text-xs flex items-center gap-1"><AlertCircle size={12} /> {imageError}</p>
          )}
          <div>
            <p className="text-text-secondary text-[10px] uppercase tracking-[0.15em] font-medium mb-2">Ingredients</p>
            <ul className="space-y-1.5">
              {meal.ingredients.map((ing, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ing.have ? 'bg-sage' : 'bg-terracotta'}`} />
                  <span className={ing.have ? 'text-text-primary' : 'text-text-secondary'}>
                    {ing.quantity && <span className="text-text-secondary">{ing.quantity} </span>}
                    {ing.name}
                  </span>
                  {!ing.have && <span className="text-terracotta font-medium ml-auto">need</span>}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-text-secondary text-[10px] uppercase tracking-[0.15em] font-medium mb-2">Steps</p>
            <ol className="space-y-2">
              {meal.steps.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sage/10 text-sage text-[10px] font-semibold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <p className="text-text-primary text-xs leading-relaxed pt-0.5">{step}</p>
                </li>
              ))}
            </ol>
          </div>

          {meal.plating && meal.plating.length > 0 && (
            <div>
              <p className="text-text-secondary text-[10px] uppercase tracking-[0.15em] font-medium mb-2">Plating</p>
              <div className="grid grid-cols-2 gap-2">
                {meal.plating.map((p) => (
                  <PlatingCard key={p.partnerSlot} plating={p} compact />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-2.5 border-t border-border/50 flex gap-2">
        <button
          type="button"
          onClick={() => generateImage(meal)}
          disabled={imageGenerating}
          className={`text-xs font-medium py-2 px-3 rounded-lg transition-all flex items-center gap-1.5 ${
            imageUrl
              ? 'bg-sage/10 text-sage border border-sage/30'
              : 'bg-white text-text-secondary border border-border hover:bg-cream'
          } disabled:opacity-40`}
        >
          {imageGenerating
            ? <RefreshCw size={12} className="animate-spin" />
            : <ImageIcon size={12} />
          }
          {imageGenerating ? 'Generating...' : imageUrl ? 'Regenerate' : 'Image'}
        </button>
        <button
          type="button"
          onClick={handleAddMissing}
          disabled={missingCount === 0 || addedMissing}
          className="flex-1 bg-sage text-white text-xs font-medium py-2 px-3 rounded-lg hover:bg-sage-dark active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <Plus size={12} />
          {addedMissing ? 'Added' : `Add ${missingCount} to list`}
        </button>
        <button
          type="button"
          onClick={saveRecipe}
          disabled={isSaving || hasSaved}
          className={`text-xs font-medium py-2 px-3 rounded-lg transition-all flex items-center gap-1.5 ${
            hasSaved
              ? 'bg-sage/10 text-sage border border-sage/30'
              : 'bg-white text-text-secondary border border-border hover:bg-cream'
          } disabled:opacity-40`}
        >
          <Bookmark size={12} fill={hasSaved ? 'currentColor' : 'none'} />
          {hasSaved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function useMealSave(meal: GeneratedMeal) {
  const { recipes, saveRecipe, isSaving } = useRecipes();
  const hasSaved = recipes.some((r) => r.name === meal.name);

  return {
    hasSaved,
    isSaving,
    saveRecipe: () => {
      if (!hasSaved && !isSaving) {
        saveRecipe(meal);
      }
    },
  };
}

function PlatingCard({
  plating,
  compact = false,
}: {
  plating: { partnerSlot: number; partnerName: string; targetCalories: number; plate: string; protein: number; carbs: number; fat: number };
  compact?: boolean;
}) {
  const dotColor = plating.partnerSlot === 1 ? 'bg-sage' : 'bg-terracotta';
  const borderColor = plating.partnerSlot === 1 ? 'border-sage/30' : 'border-terracotta/30';

  return (
    <div className={`border ${borderColor} rounded-xl p-3 ${compact ? 'bg-white/60' : 'bg-cream/50'}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} aria-hidden />
        <h4 className={`font-semibold ${compact ? 'text-xs' : 'text-sm'} text-text-primary`}>{plating.partnerName}'s plate</h4>
        <span className="ml-auto text-text-secondary text-[10px]">{plating.targetCalories} cal</span>
      </div>
      <p className={`text-text-primary leading-relaxed mb-1 ${compact ? 'text-[11px]' : 'text-sm'}`}>{plating.plate}</p>
      <div className="flex gap-3 text-[10px] text-text-secondary">
        <span>P: {plating.protein}g</span>
        <span>C: {plating.carbs}g</span>
        <span>F: {plating.fat}g</span>
      </div>
    </div>
  );
}

function SavedRecipesView() {
  const { recipes, isLoading, hasRecipes, getMeal, deleteRecipe } = useRecipes();

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary text-sm">Loading your recipes…</p>
      </div>
    );
  }

  if (!hasRecipes) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-sage/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Bookmark size={28} className="text-sage" />
        </div>
        <p className="text-text-primary text-xl font-semibold mb-2">
          No saved recipes yet
        </p>
        <p className="text-text-secondary text-base leading-relaxed max-w-sm mx-auto">
          Generate a meal and save the ones you love. They'll appear here for quick access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {recipes.map((recipe) => {
        const meal = getMeal(recipe);
        if (!meal) return null;
        return (
          <SavedRecipeCard
            key={recipe.id}
            meal={meal}
            onDelete={() => deleteRecipe(recipe.id)}
          />
        );
      })}
    </div>
  );
}

function SavedRecipeCard({
  meal,
  onDelete,
}: {
  meal: GeneratedMeal;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { addItem } = useGroceryList();
  const [addedMissing, setAddedMissing] = useState(false);
  const { url: imageUrl, generating: imageGenerating, error: imageError, generate: generateImage } = useMealImage(meal.name);

  const missingCount = meal.ingredients.filter((i) => !i.have).length;

  function handleAddMissing() {
    const missing = meal.ingredients.filter((i) => !i.have);
    for (const item of missing) {
      addItem({ name: item.name });
    }
    setAddedMissing(true);
  }

  function handleDeleteClick() {
    if (confirmDelete) {
      onDelete();
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    } else {
      setConfirmDelete(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmDelete(false);
        confirmTimerRef.current = null;
      }, 3000);
    }
  }

  function handleToggleExpand() {
    setExpanded((prev) => !prev);
    setConfirmDelete(false);
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={handleToggleExpand}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-cream/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-text-primary text-sm font-medium">{meal.name}</p>
          <p className="text-text-secondary text-xs mt-0.5">
            {meal.timeMinutes}min · {meal.calories}cal
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {missingCount > 0 && (
            <span className="flex items-center gap-1 text-terracotta text-xs font-medium">
              <Plus size={12} />
              {missingCount} to buy
            </span>
          )}
          {expanded
            ? <ChevronUp size={16} className="text-text-secondary" />
            : <ChevronDown size={16} className="text-text-secondary" />
          }
        </div>
      </button>

      {expanded && (
        <>
          <div className="border-t border-border">
            <div className="px-5 py-3">
              <p className="text-text-secondary text-xs mb-2">{meal.description}</p>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[
                  { label: 'Cal', value: meal.calories },
                  { label: 'P', value: `${meal.protein}g` },
                  { label: 'C', value: `${meal.carbs}g` },
                  { label: 'F', value: `${meal.fat}g` },
                ].map((stat) => (
                  <div key={stat.label} className="text-center bg-cream/50 rounded-lg py-1.5">
                    <p className="text-text-secondary text-[10px] uppercase">{stat.label}</p>
                    <p className="text-text-primary text-sm font-semibold">{stat.value}</p>
                  </div>
                ))}
              </div>
              {imageUrl && (
                <div className="mb-3">
                  <p className="text-text-secondary text-[10px] uppercase tracking-[0.15em] font-medium mb-2">Photo</p>
                  <img src={imageUrl} alt={meal.name} className="w-full rounded-lg object-cover aspect-square" loading="lazy" />
                </div>
              )}
              {imageError && !imageGenerating && (
                <p className="text-error text-xs flex items-center gap-1 mb-3"><AlertCircle size={12} /> {imageError}</p>
              )}
            </div>

            <div className="px-5 pb-3">
              <p className="text-text-secondary text-[10px] uppercase tracking-[0.15em] font-medium mb-2">Ingredients</p>
              <ul className="space-y-1.5">
                {meal.ingredients.map((ing, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ing.have ? 'bg-sage' : 'bg-terracotta'}`} />
                    <span className={ing.have ? 'text-text-primary' : 'text-text-secondary'}>
                      {ing.quantity && <span className="text-text-secondary">{ing.quantity} </span>}
                      {ing.name}
                    </span>
                    {!ing.have && <span className="text-terracotta font-medium ml-auto">need</span>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="px-5 pb-3">
              <p className="text-text-secondary text-[10px] uppercase tracking-[0.15em] font-medium mb-2">Steps</p>
              <ol className="space-y-2">
                {meal.steps.map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sage/10 text-sage text-[10px] font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <p className="text-text-primary text-xs leading-relaxed pt-0.5">{step}</p>
                  </li>
                ))}
              </ol>
            </div>

            {meal.plating && meal.plating.length > 0 && (
              <div className="px-5 pb-3">
                <p className="text-text-secondary text-[10px] uppercase tracking-[0.15em] font-medium mb-2">Plating</p>
                <div className="grid grid-cols-2 gap-2">
                  {meal.plating.map((p) => (
                    <PlatingCard key={p.partnerSlot} plating={p} compact />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border px-5 py-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => generateImage(meal)}
              disabled={imageGenerating}
              className={`text-xs font-medium py-2 px-3 rounded-lg transition-all flex items-center gap-1.5 ${
                imageUrl
                  ? 'bg-sage/10 text-sage border border-sage/30'
                  : 'bg-cream text-text-secondary border border-border hover:bg-cream-dark'
              } disabled:opacity-40`}
            >
              {imageGenerating
                ? <RefreshCw size={12} className="animate-spin" />
                : <ImageIcon size={12} />
              }
              {imageGenerating ? 'Generating...' : imageUrl ? 'Regenerate' : 'Image'}
            </button>
            <button
              type="button"
              onClick={handleAddMissing}
              disabled={missingCount === 0 || addedMissing}
              className="flex-1 bg-sage text-white text-xs font-medium py-2 px-3 rounded-lg hover:bg-sage-dark active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <Plus size={12} />
              {addedMissing ? 'Added' : `Add ${missingCount} to list`}
            </button>
            <button
              type="button"
              onClick={handleDeleteClick}
              className={`text-xs font-medium py-2 px-3 rounded-lg transition-all flex items-center gap-1.5 ${
                confirmDelete
                  ? 'bg-terracotta text-white'
                  : 'bg-cream text-text-secondary border border-border hover:bg-cream-dark hover:text-error'
              }`}
            >
              <Trash2 size={12} />
              {confirmDelete ? 'Delete this recipe?' : 'Delete'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function WeekView() {
  const { isGenerating, generateWeek, getMeal, hasPlan } = useWeekPlan();
  const { addItem } = useGroceryList();

  async function handlePopulateList() {
    const allMissing = new Set<string>();
    for (const day of DAYS) {
      const meal = getMeal(day.key);
      if (meal) {
        for (const ing of meal.ingredients) {
          if (!ing.have) allMissing.add(ing.name);
        }
      }
    }
    for (const name of allMissing) {
      addItem({ name });
    }
  }

  const totalMissing = new Set<string>();
  for (const day of DAYS) {
    const meal = getMeal(day.key);
    if (meal) {
      for (const ing of meal.ingredients) {
        if (!ing.have) totalMissing.add(ing.name);
      }
    }
  }

  if (!hasPlan && !isGenerating) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-sage/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <CalendarDays size={28} className="text-sage" />
        </div>
        <p className="text-text-primary text-xl font-semibold mb-2">
          Plan the whole week
        </p>
        <p className="text-text-secondary text-base leading-relaxed max-w-sm mx-auto mb-8">
          One tap generates 7 dinners. Missing ingredients go straight to your grocery list.
        </p>
        <button
          type="button"
          onClick={generateWeek}
          disabled={isGenerating}
          className="bg-sage text-white font-medium py-4 px-8 rounded-2xl hover:bg-sage-dark active:scale-[0.99] transition-all inline-flex items-center gap-2 disabled:opacity-50"
        >
          <CalendarDays size={18} />
          Generate the week
        </button>
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-sage/10 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
          <CalendarDays size={28} className="text-sage" />
        </div>
        <p className="text-text-primary text-lg font-medium">Planning your week…</p>
        <p className="text-text-secondary text-sm mt-2">This takes a moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3">
        {DAYS.map((day) => {
          const meal = getMeal(day.key);
          return (
            <div
              key={day.key}
              className="bg-white border border-border rounded-xl px-5 py-4 flex items-center gap-4"
            >
              <span className="w-10 text-text-secondary text-sm font-medium text-center">
                {day.label}
              </span>
              {meal ? (
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-sm font-medium truncate">{meal.name}</p>
                  <p className="text-text-secondary text-xs">
                    {meal.timeMinutes}min · {meal.calories}cal
                  </p>
                </div>
              ) : (
                <p className="flex-1 text-text-secondary text-sm italic">Not planned</p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handlePopulateList}
        disabled={totalMissing.size === 0}
        className="w-full bg-sage text-white font-medium py-3 px-6 rounded-xl hover:bg-sage-dark active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Plus size={16} />
        Add {totalMissing.size} missing ingredients to list
      </button>

      <button
        type="button"
        onClick={generateWeek}
        className="w-full bg-cream text-text-secondary font-medium py-3 px-6 rounded-xl border border-border hover:bg-cream-dark transition-colors flex items-center justify-center gap-2"
      >
        <Sparkles size={16} />
        Regenerate the week
      </button>
    </div>
  );
}

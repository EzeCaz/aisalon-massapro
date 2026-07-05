"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TestimonialCard,
  Testimonial,
} from "@/components/testimonials/testimonial-card";
import { Button } from "@/components/ui/button";
import { Sparkles, EyeOff, Eye, Trash2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Props = { meId: string };

/**
 * AdminTestimonials — admin moderation view.
 *
 * Unlike the public TestimonialFeed, this one:
 *   - Includes HIDDEN testimonials in the list
 *   - Shows admin action buttons on each card (Feature, Hide/Unhide, Delete)
 *   - Has a "show hidden only" filter
 *   - Has a refresh button
 */
export function AdminTestimonials({ meId }: Props) {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "200", sort: "recent" });
      const res = await fetch(`/api/testimonials?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // The API returns hidden ones for admins.
      setItems(data.testimonials || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function patch(id: string, patch: { featured?: boolean; hidden?: boolean }) {
    try {
      const res = await fetch(`/api/testimonials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      // Update local state in-place so the UI updates instantly.
      setItems((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                featured: patch.featured ?? t.featured,
                hidden: patch.hidden ?? t.hidden,
              }
            : t
        )
      );
      toast.success(
        patch.featured === true
          ? "Marked as featured"
          : patch.featured === false
          ? "Removed from featured"
          : patch.hidden === true
          ? "Testimonial hidden"
          : patch.hidden === false
          ? "Testimonial unhidden"
          : "Updated"
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this testimonial permanently?")) return;
    try {
      const res = await fetch(`/api/testimonials/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((t) => t.id !== id));
      toast.success("Deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Client-side filter for hidden / featured
  const visible = items.filter((t) => {
    if (hiddenOnly && !t.hidden) return false;
    if (featuredOnly && !t.featured) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Admin toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-white p-3">
        <span className="text-xs font-bold uppercase tracking-widest text-black/80">
          {items.length} total
        </span>
        <Button
          variant={featuredOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setFeaturedOnly((v) => !v)}
          className="h-8 gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {featuredOnly ? "Showing featured" : "Featured only"}
        </Button>
        <Button
          variant={hiddenOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setHiddenOnly((v) => !v)}
          className="h-8 gap-1.5"
        >
          <EyeOff className="h-3.5 w-3.5" />
          {hiddenOnly ? "Showing hidden" : "Hidden only"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchItems}
          className="h-8 gap-1.5 ml-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Items */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-black/80">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-[#FF005A]/30 bg-[#FF005A]/5 p-4 text-sm text-[#FF005A]">
          Couldn&apos;t load testimonials: {error}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/15 p-8 text-center text-sm text-black/80">
          No testimonials match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map((t) => (
            <div key={t.id} className="space-y-2">
              <TestimonialCard
                testimonial={t}
                meId={meId}
                isAdmin={true}
                onChanged={fetchItems}
              />
              {/* Admin actions */}
              <div className="flex items-center gap-1.5 px-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => patch(t.id, { featured: !t.featured })}
                  className="h-7 text-xs gap-1"
                >
                  <Sparkles className="h-3 w-3" />
                  {t.featured ? "Unfeature" : "Feature"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => patch(t.id, { hidden: !t.hidden })}
                  className="h-7 text-xs gap-1"
                >
                  {t.hidden ? (
                    <>
                      <Eye className="h-3 w-3" /> Unhide
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-3 w-3" /> Hide
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => del(t.id)}
                  className="h-7 text-xs gap-1 ml-auto text-[#FF005A] hover:bg-[#FF005A]/10"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

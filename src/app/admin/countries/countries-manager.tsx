"use client";

/**
 * <CountriesManager />
 * ────────────────────
 * Super-Admin-only UI for managing countries.
 * Lists all countries with their chapter + user counts, lets the
 * Super Admin create new countries inline, and links to per-country
 * chapter management.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Globe2, Plus, Loader2, MapPin, Users, ArrowRight, Pencil } from "lucide-react";
import Link from "next/link";

type Country = {
  id: string;
  name: string;
  code: string;
  slug: string;
  flagEmoji: string | null;
  defaultEmailDomain: string | null;
  isActive: boolean;
  _count: { chapters: number; users: number };
};

export function CountriesManager({ countries: initial }: { countries: Country[] }) {
  const [countries, setCountries] = useState<Country[]>(initial);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [flagEmoji, setFlagEmoji] = useState("");
  const [emailDomain, setEmailDomain] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    const n = name.trim();
    const c = code.trim().toUpperCase();
    if (!n) return toast.error("Country name is required");
    if (c.length !== 2) return toast.error("Country code must be 2 letters");
    setCreating(true);
    const t = toast.loading(`Creating country "${n}"…`);
    try {
      const res = await fetch("/api/admin/countries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          code: c,
          flagEmoji: flagEmoji.trim() || null,
          defaultEmailDomain: emailDomain.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCountries((prev) =>
        [...prev, { ...data.country, _count: { chapters: 0, users: 0 } }].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setOpen(false);
      setName("");
      setCode("");
      setFlagEmoji("");
      setEmailDomain("");
      toast.success(`Country "${n}" created`, { id: t });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-black">Countries</h2>
          <p className="text-xs text-black/60">
            {countries.length} country{countries.length === 1 ? "" : "s"} in the platform. Each country contains chapters.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#820A7D] hover:bg-[#820A7D]/90 h-9">
              <Plus className="h-4 w-4 mr-1" /> Create country
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new country</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-black/70 -mt-2">
              Add a new country to the V7 hierarchy. After creating it, you can add chapters inside it
              and assign members / events / speakers to those chapters.
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-black/80 mb-1 block">Name *</span>
                  <input
                    type="text"
                    placeholder="e.g. Israel"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-md border border-black/15 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-black/80 mb-1 block">Code (ISO 3166-1 alpha-2) *</span>
                  <input
                    type="text"
                    placeholder="e.g. IL"
                    maxLength={2}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full rounded-md border border-black/15 px-3 py-2 text-sm uppercase"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-black/80 mb-1 block">Flag emoji</span>
                  <input
                    type="text"
                    placeholder="🇮🇱"
                    value={flagEmoji}
                    onChange={(e) => setFlagEmoji(e.target.value)}
                    className="w-full rounded-md border border-black/15 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-black/80 mb-1 block">Default email domain (optional)</span>
                  <input
                    type="text"
                    placeholder="aisalon.co.il"
                    value={emailDomain}
                    onChange={(e) => setEmailDomain(e.target.value)}
                    className="w-full rounded-md border border-black/15 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                disabled={creating}
                onClick={handleCreate}
                className="bg-[#820A7D] hover:bg-[#820A7D]/90 text-white"
              >
                {creating ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Creating…</>
                ) : (
                  <><Plus className="h-4 w-4 mr-1.5" /> Create country</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {countries.length === 0 ? (
        <Card className="p-12 text-center border border-black/10">
          <Globe2 className="h-10 w-10 mx-auto text-black/30 mb-3" />
          <p className="text-sm text-black/80 mb-2">No countries yet.</p>
          <p className="text-xs text-black/60">Create your first country to start building your chapter hierarchy.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {countries.map((c) => (
            <Card key={c.id} className="p-4 border border-black/10 bg-white">
              <div className="flex items-start gap-3">
                <span className="text-3xl leading-none">{c.flagEmoji ?? "🏳️"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-black">{c.name}</div>
                  <div className="text-xs text-black/60 font-mono">
                    {c.code} · /{c.slug}
                  </div>
                </div>
              </div>
              {c.defaultEmailDomain && (
                <div className="mt-2 text-xs text-black/60">
                  Email domain: <code className="bg-black/5 px-1 rounded">{c.defaultEmailDomain}</code>
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-black/5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 text-black/70">
                    <MapPin className="h-3 w-3" />
                    <strong>{c._count.chapters}</strong> chapters
                  </span>
                  <span className="inline-flex items-center gap-1 text-black/70">
                    <Users className="h-3 w-3" />
                    <strong>{c._count.users}</strong> users
                  </span>
                </div>
                <Link
                  href={`/admin/chapters/new?countryId=${c.id}`}
                  className="inline-flex items-center gap-1 text-[#820A7D] font-semibold hover:underline"
                >
                  Add chapter <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

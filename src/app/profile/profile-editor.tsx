"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Upload,
  Save,
  Check,
  X,
  Linkedin,
  Globe,
  Building2,
  Briefcase,
  User as UserIcon,
  AtSign,
  Camera,
  Trash2,
} from "lucide-react";
import { tagColor } from "@/lib/tags";

type ProfileUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  photoUrl: string | null;
  bio: string | null;
  company: string | null;
  companyUrl: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  role: string;
  tags: { id: string; label: string; color: string | null }[];
};

export function ProfileEditor({ initial }: { initial: ProfileUser }) {
  const [user, setUser] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectivePhoto = user.photoUrl || user.image;
  const initials = (user.name || user.email)
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const handleChange = useCallback(
    (field: keyof ProfileUser, value: string) => {
      setUser((u) => ({ ...u, [field]: value }));
    },
    []
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user.name,
          bio: user.bio,
          company: user.company,
          companyUrl: user.companyUrl,
          linkedinUrl: user.linkedinUrl,
          portfolioUrl: user.portfolioUrl,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save profile");
      }
      const data = await res.json();
      setUser(data.user);
      toast.success("Profile saved", {
        description: "Your changes are now live across the platform.",
      });
    } catch (e) {
      toast.error("Could not save profile", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/profile/photo", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to upload photo");
      }
      const data = await res.json();
      setUser((u) => ({ ...u, photoUrl: data.photoUrl }));
      toast.success("Photo updated");
    } catch (e) {
      toast.error("Photo upload failed", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoDelete = async () => {
    setUploading(true);
    try {
      const res = await fetch("/api/profile/photo", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete photo");
      setUser((u) => ({ ...u, photoUrl: null }));
      toast.success("Photo removed");
    } catch {
      toast.error("Could not delete photo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_2fr] gap-6">
      {/* LEFT — preview card */}
      <div className="space-y-4">
        <Card className="p-6 border border-black/10 bg-white">
          {/* Photo */}
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <Avatar className="h-32 w-32 border-4 border-white shadow-lg ais-gradient-ring">
                {effectivePhoto ? (
                  <AvatarImage src={effectivePhoto} alt={user.name || user.email} />
                ) : null}
                <AvatarFallback className="bg-black text-white text-3xl font-extrabold">
                  {initials || "?"}
                </AvatarFallback>
              </Avatar>
              {uploading && (
                <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePhotoUpload(f);
                e.target.value = "";
              }}
            />

            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Camera className="mr-2 h-3.5 w-3.5" />
                {user.photoUrl ? "Change photo" : "Upload photo"}
              </Button>
              {user.photoUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handlePhotoDelete}
                  disabled={uploading}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>

            <p className="mt-2 text-[10px] text-black/80">
              JPG, PNG, WebP up to 8 MB · cropped to 512×512 square
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-black/10">
            <div className="font-extrabold text-lg text-black">
              {user.name || user.email.split("@")[0]}
            </div>
            <div className="text-xs text-black/50 font-mono truncate">{user.email}</div>

            {user.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                {user.tags.map((t) => (
                  <Badge
                    key={t.id}
                    variant="outline"
                    className="border-transparent"
                    style={{
                      backgroundColor: `${t.color || tagColor(t.label)}20`,
                      color: t.color || tagColor(t.label),
                    }}
                  >
                    {t.label}
                  </Badge>
                ))}
              </div>
            )}

            {user.bio && (
              <p className="mt-4 text-sm text-black/70 leading-relaxed line-clamp-6">
                {user.bio}
              </p>
            )}

            <div className="mt-4 space-y-1.5 text-xs">
              {user.company && (
                <div className="flex items-center gap-1.5 text-black/70">
                  <Building2 className="h-3 w-3" />
                  {user.companyUrl ? (
                    <a
                      href={user.companyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#004F98] hover:underline"
                    >
                      {user.company}
                    </a>
                  ) : (
                    <span>{user.company}</span>
                  )}
                </div>
              )}
              {user.linkedinUrl && (
                <a
                  href={user.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[#0A66C2] hover:underline"
                >
                  <Linkedin className="h-3 w-3" /> LinkedIn
                </a>
              )}
              {user.portfolioUrl && (
                <a
                  href={user.portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[#004F98] hover:underline"
                >
                  <Globe className="h-3 w-3" /> Portfolio
                </a>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-4 border border-black/10 bg-black/[0.02]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-black/80 mb-1">
            Note
          </p>
          <p className="text-xs text-black/80 leading-relaxed">
            Your email is your identity on the platform and cannot be changed. Tags are assigned
            by the admin (e.g. <span className="font-semibold">Speaker</span>,{" "}
            <span className="font-semibold">Builder</span>,{" "}
            <span className="font-semibold">Investor</span>).
          </p>
        </Card>
      </div>

      {/* RIGHT — edit form */}
      <Card className="p-6 sm:p-8 border border-black/10 bg-white">
        <div className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5" /> Display name
            </Label>
            <Input
              id="name"
              value={user.name || ""}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Your full name"
              maxLength={100}
            />
            <p className="text-[11px] text-black/80">Shown on your member card and photo credits.</p>
          </div>

          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-1.5">
              <AtSign className="h-3.5 w-3.5" /> Email
            </Label>
            <Input id="email" value={user.email} disabled className="bg-black/5 font-mono text-sm" />
            <p className="text-[11px] text-black/80">Identity — cannot be changed.</p>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="bio" className="flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" /> Short bio
            </Label>
            <Textarea
              id="bio"
              value={user.bio || ""}
              onChange={(e) => handleChange("bio", e.target.value)}
              placeholder="Two or three sentences about who you are, what you build, and what excites you about AI."
              rows={4}
              maxLength={2000}
            />
            <p className="text-[11px] text-black/80">
              {(user.bio || "").length} / 2000 characters
            </p>
          </div>

          {/* Company + Company URL */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company" className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Company
              </Label>
              <Input
                id="company"
                value={user.company || ""}
                onChange={(e) => handleChange("company", e.target.value)}
                placeholder="MassaPro"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyUrl" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Company URL
              </Label>
              <Input
                id="companyUrl"
                type="url"
                value={user.companyUrl || ""}
                onChange={(e) => handleChange("companyUrl", e.target.value)}
                placeholder="https://massapro.com"
                maxLength={500}
              />
            </div>
          </div>

          {/* LinkedIn + Portfolio */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="linkedinUrl" className="flex items-center gap-1.5">
                <Linkedin className="h-3.5 w-3.5" /> LinkedIn
              </Label>
              <Input
                id="linkedinUrl"
                type="url"
                value={user.linkedinUrl || ""}
                onChange={(e) => handleChange("linkedinUrl", e.target.value)}
                placeholder="https://www.linkedin.com/in/you"
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portfolioUrl" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Portfolio URL
              </Label>
              <Input
                id="portfolioUrl"
                type="url"
                value={user.portfolioUrl || ""}
                onChange={(e) => handleChange("portfolioUrl", e.target.value)}
                placeholder="https://you.dev"
                maxLength={500}
              />
            </div>
          </div>

          {/* Save bar */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/10">
            <Button
              type="button"
              variant="outline"
              onClick={() => setUser(initial)}
              disabled={saving}
            >
              <X className="mr-2 h-4 w-4" /> Reset
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-black hover:bg-black/90 text-white"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

"use client";

import { useState, useRef } from "react";
import { Upload, Trash2, Loader2, UserCircle2 } from "lucide-react";

/**
 * PhotoUploadField — reusable profile-photo upload widget.
 *
 * Used by:
 *   - EditMemberDialog (POST /api/admin/members/[id]/photo)
 *   - SpeakerEditor (POST /api/admin/speakers/[id]/photo)
 *   - EditRegistrantDialog (POST /api/admin/members/[id]/photo — acts on
 *     the linked user)
 *
 * Shows:
 *   - The current photo (or a placeholder avatar if none).
 *   - An "Upload" button that opens a file picker.
 *   - A "Remove" button (only when a photo is set).
 *   - A URL display + copy field so the admin can grab the URL for use
 *     in mockup JSON.
 *
 * Upload flow:
 *   1. Admin clicks "Upload" → file picker opens.
 *   2. Admin picks a JPG/PNG/WebP file → POST to `uploadUrl` as multipart.
 *   3. On success: `onUploaded(newUrl)` is called so the parent can update
 *      its local state.
 *   4. On error: a red error message is shown inline.
 *
 * Remove flow:
 *   1. Admin clicks "Remove" → DELETE to `uploadUrl`.
 *   2. On success: `onUploaded(null)` is called (null = no photo).
 *
 * Props:
 *   - photoUrl: current photo URL (null/empty = no photo).
 *   - uploadUrl: the API endpoint to POST/DELETE the photo.
 *   - onUploaded: callback that receives the new URL (or null on delete).
 *   - size: avatar diameter in px. Default 96.
 *   - disabled: when true, hide the upload/remove buttons (read-only).
 */
type Props = {
  photoUrl: string | null | undefined;
  uploadUrl: string;
  onUploaded: (url: string | null) => void;
  size?: number;
  disabled?: boolean;
};

export function PhotoUploadField({
  photoUrl,
  uploadUrl,
  onUploaded,
  size = 96,
  disabled = false,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onUploaded(data.photoUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Reset the input so the same file can be picked again if needed.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (!confirm("Remove this photo? The member will fall back to their Google avatar (if any).")) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(uploadUrl, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      onUploaded(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-md border border-black/10 p-3 space-y-3 bg-white">
      <div className="text-[0.65rem] font-bold uppercase tracking-widest text-black/40">
        Profile photo
      </div>
      <div className="flex items-start gap-4">
        {/* Preview */}
        <div
          className="relative shrink-0 rounded-full overflow-hidden border-2 border-black/10 bg-black/[0.03] flex items-center justify-center"
          style={{ width: `${size}px`, height: `${size}px` }}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          ) : (
            <UserCircle2
              className="text-black/30"
              style={{ width: `${size * 0.7}px`, height: `${size * 0.7}px` }}
            />
          )}
          {uploading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[#FF005A]" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || disabled}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#FF005A] text-white px-3 py-1.5 text-xs font-semibold hover:bg-[#FF005A]/90 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {photoUrl ? "Replace photo" : "Upload photo"}
            </button>
            {photoUrl && !disabled && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-300 text-red-600 px-3 py-1.5 text-xs font-semibold hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif"
            onChange={handleFileChange}
            className="hidden"
          />
          <p className="text-[0.65rem] text-black/50 leading-relaxed">
            JPG, PNG, WebP, GIF, or HEIC. Max 8 MB. The image is auto-cropped
            to a square 512×512 WebP.
          </p>
          {photoUrl && (
            <div className="rounded bg-black/[0.03] px-2 py-1.5">
              <p className="text-[0.6rem] font-mono text-black/50 break-all">
                {photoUrl}
              </p>
              <p className="text-[0.6rem] text-black/40 mt-1">
                ↑ use this URL in mockup JSON to bind this member&apos;s photo
              </p>
            </div>
          )}
          {error && (
            <p className="text-[0.7rem] text-red-600 font-semibold">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

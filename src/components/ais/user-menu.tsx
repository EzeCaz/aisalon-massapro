"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon, Shield } from "lucide-react";
import { tagColor } from "@/lib/tags";

type Props = {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: string;
    tags: { id: string; label: string; color: string | null }[];
  };
  isAdmin: boolean;
};

export function UserMenu({ user, isAdmin }: Props) {
  const initials = (user.name || user.email)
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="ml-2 inline-flex items-center gap-2 rounded-full hover:bg-black/5 p-1 pr-2 transition-colors">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image || undefined} alt={user.name || user.email} />
            <AvatarFallback className="bg-black text-white text-xs font-semibold">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
          <span className="hidden lg:inline text-sm font-medium text-black max-w-[140px] truncate">
            {user.name || user.email.split("@")[0]}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="font-semibold text-sm">{user.name || user.email.split("@")[0]}</span>
          <span className="text-xs text-black/50 font-normal">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.tags.length > 0 && (
          <>
            <div className="px-2 py-1.5 flex flex-wrap gap-1">
              {user.tags.map((t) => (
                <span
                  key={t.id}
                  className="ais-tag"
                  style={{
                    backgroundColor: `${t.color || tagColor(t.label)}20`,
                    color: t.color || tagColor(t.label),
                  }}
                >
                  {t.label}
                </span>
              ))}
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield className="mr-2 h-4 w-4" /> Admin Panel
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/events">
            <UserIcon className="mr-2 h-4 w-4" /> Events
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-[#FF005A] focus:text-[#FF005A]"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

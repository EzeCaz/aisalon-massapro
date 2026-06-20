"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { Menu, LogOut, Shield } from "lucide-react";

type Props = {
  links: { href: string; label: string }[];
  user: {
    name: string | null;
    email: string;
    image: string | null;
    photoUrl?: string | null;
    role: string;
  } | null;
  isAdmin: boolean;
};

export function MobileNav({ links, user, isAdmin }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle className="text-left">AI Salon TLV</SheetTitle>
        </SheetHeader>
        <nav className="mt-6 flex flex-col gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-md text-sm font-medium text-black/80 hover:bg-black/5"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="px-3 py-2 rounded-md text-sm font-medium text-black/80 hover:bg-black/5"
          >
            My Profile
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-md text-sm font-medium text-black/80 hover:bg-black/5 inline-flex items-center gap-2"
            >
              <Shield className="h-4 w-4" /> Admin
            </Link>
          )}
        </nav>
        {user && (
          <div className="absolute bottom-6 left-6 right-6">
            <div className="px-1 py-2 text-xs text-black/50">{user.email}</div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

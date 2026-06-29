"use client";

import {
  ScanSearch,
  Timer,
  HeartHandshake,
  TrendingUp,
  Users,
  BarChart3,
  LayoutGrid,
  Compass,
  UserPlus,
  SquareSigma,
  ShieldCheck,
  Zap,
  Quote,
  CreditCard,
  PenTool,
  Map,
  Sparkles,
  FileSignature,
  Scale,
  RefreshCw,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** Map tool-data icon strings to Lucide components. */
const ICONS: Record<string, LucideIcon> = {
  ScanSearch,
  Timer,
  HeartHandshake,
  TrendingUp,
  Users,
  Spectrum: BarChart3, // Spectrum doesn't exist in lucide-react; use BarChart3 for "Human Qualities Spectrum"
  LayoutGrid,
  Compass,
  UserPlus,
  SquareSigma,
  ShieldCheck,
  Zap,
  Quote,
  CreditCard,
  PenTool,
  Map,
  Sparkles,
  FileSignature,
  Scale,
  RefreshCw,
  Wrench,
};

export function getToolIcon(name: string): LucideIcon {
  return ICONS[name] ?? Wrench;
}

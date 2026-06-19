/**
 * Catalog of available member tags.
 * Admin can assign any subset of these to any user.
 *
 * Colors follow the AIS palette:
 *   AIS RED      #FF005A
 *   AIS CYAN     #00E6FF
 *   AIS ACCENT 1 #FFAC30  (orange)
 *   AIS ACCENT 2 #007E72  (teal)
 *   AIS ACCENT 3 #004F98  (dark blue)
 *   AIS ACCENT 4 #820A7D  (purple)
 *   AIS BLACK    #000000
 */
export type MemberTagDef = {
  label: string;
  color: string;
  description?: string;
};

export const MEMBER_TAG_CATALOG: MemberTagDef[] = [
  { label: "Speaker", color: "#FF005A", description: "Has spoken at an AI Salon event" },
  { label: "Builder", color: "#00E6FF", description: "Actively building AI products" },
  { label: "Investor", color: "#820A7D", description: "Invests in AI startups" },
  { label: "Founder", color: "#FFAC30", description: "Company founder" },
  { label: "CMO", color: "#007E72", description: "Chief Marketing Officer" },
  { label: "Product Leader", color: "#004F98", description: "Product / PM leadership" },
  { label: "Growth Marketer", color: "#FF005A", description: "Growth / performance marketing" },
  { label: "Community Member", color: "#52525B", description: "General community member" },
];

export function tagColor(label: string): string {
  return MEMBER_TAG_CATALOG.find((t) => t.label === label)?.color || "#52525B";
}

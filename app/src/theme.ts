export const C = {
  bg: "#0B1020",
  card: "#141B33",
  cardHi: "#1B2445",
  line: "#26305A",
  text: "#F4F6FF",
  dim: "#9AA6D1",
  saffron: "#FF9933",
  magenta: "#FF4D8D",
  green: "#2DD4A0",
  red: "#FF6B6B",
};

export const GRADIENT: [string, string] = [C.saffron, C.magenta];

export const CAT_COLORS: Record<string, string> = {
  "Food & Dining": "#FF9933",
  Groceries: "#7BD88F",
  Transport: "#4DA3FF",
  Shopping: "#FF4D8D",
  "Bills & Utilities": "#A78BFA",
  "Rent & Housing": "#5EEAD4",
  Health: "#F87171",
  Education: "#FACC15",
  Entertainment: "#F472B6",
  Travel: "#38BDF8",
  Subscriptions: "#C084FC",
  "Investments & Savings": "#2DD4A0",
  "Personal Care": "#FB923C",
  "Gifts & Donations": "#E879F9",
  Other: "#94A3B8",
};

export const CATEGORIES = Object.keys(CAT_COLORS);

export const CAT_ICON: Record<string, string> = {
  "Food & Dining": "restaurant",
  Groceries: "basket",
  Transport: "car",
  Shopping: "bag-handle",
  "Bills & Utilities": "flash",
  "Rent & Housing": "home",
  Health: "medkit",
  Education: "school",
  Entertainment: "film",
  Travel: "airplane",
  Subscriptions: "repeat",
  "Investments & Savings": "trending-up",
  "Personal Care": "sparkles",
  "Gifts & Donations": "gift",
  Other: "ellipsis-horizontal",
};

/** paise -> "₹1,23,456.50" (Indian digit grouping, no Intl dependency). */
export function inr(minor: number, compact = false): string {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  if (compact && abs >= 10_000_000) return `${neg ? "-" : ""}₹${(abs / 10_000_000).toFixed(1)}Cr`;
  if (compact && abs >= 10_000_00) return `${neg ? "-" : ""}₹${(abs / 10_000_00).toFixed(1)}L`;
  if (compact && abs >= 100_000) return `${neg ? "-" : ""}₹${(abs / 100_000).toFixed(1)}k`;
  const rupees = Math.floor(abs / 100).toString();
  const paise = abs % 100;
  const last3 = rupees.slice(-3);
  const rest = rupees.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return `${neg ? "-" : ""}₹${grouped}${paise ? "." + String(paise).padStart(2, "0") : ""}`;
}

export const isoToday = () => new Date().toISOString().slice(0, 10);
export const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
export const thisMonth = () => new Date().toISOString().slice(0, 7);

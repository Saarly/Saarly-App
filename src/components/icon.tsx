import {
  BadgeDollarSign,
  BellRing,
  BookOpen,
  Building2,
  ChartNoAxesCombined,
  ClipboardList,
  CreditCard,
  FileScan,
  Gift,
  Headphones,
  Images,
  LayoutDashboard,
  Map,
  MapPin,
  MessagesSquare,
  SearchCheck,
  ShieldCheck,
  Store,
  Tags,
  Users
} from "lucide-react";

const iconMap = {
  BadgeDollarSign,
  BellRing,
  BookOpen,
  Building2,
  ChartNoAxesCombined,
  ClipboardList,
  CreditCard,
  FileScan,
  Gift,
  Headphones,
  Images,
  LayoutDashboard,
  Map,
  MapPin,
  MessagesSquare,
  SearchCheck,
  ShieldCheck,
  Store,
  Tags,
  Users
};

type IconName = keyof typeof iconMap;

export function AdminIcon({ name }: { name: string }) {
  const Icon = iconMap[name as IconName] ?? LayoutDashboard;
  return <Icon aria-hidden="true" size={19} strokeWidth={1.9} />;
}

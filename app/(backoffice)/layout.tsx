import { AppShell } from "@/components/shell/AppShell";

export default function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}

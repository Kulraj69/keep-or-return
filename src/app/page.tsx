import { KeepReturnApp } from "@/components/keep-return-app";
import { runtimeConfig } from "@/lib/config";
export const dynamic = "force-dynamic";
export default function Home() {
  return (
    <KeepReturnApp
      config={runtimeConfig()}
      initialToday={new Date().toISOString().slice(0, 10)}
    />
  );
}

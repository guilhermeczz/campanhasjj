"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";

export default function VendasVendedor() {
  const router = useRouter();
  useEffect(() => { router.replace("/painel"); }, [router]);
  return <AppShell role="vendedor" title="Minhas vendas" subtitle="Esta área foi desativada.">
    <div className="empty-state"><h2 className="font-bold">Consulte sua posição</h2><p className="mt-2 text-sm text-white/55">Vendedores veem apenas a posição em cada campanha. Pontos e valores são visíveis somente para a diretoria.</p><Link href="/painel" className="btn-primary mt-5">Ver minha posição</Link></div>
  </AppShell>;
}

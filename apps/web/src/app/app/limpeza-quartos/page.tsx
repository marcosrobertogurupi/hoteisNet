"use client";

import { Sparkles } from "lucide-react";
import EmConstrucao from "@/components/EmConstrucao";

export default function LimpezaQuartosPage() {
  return (
    <EmConstrucao
      icon={Sparkles}
      title="Mudar Status de Limpeza"
      description="Quartos em limpeza separados por andar, com opção de marcar todos como limpos de uma vez."
      color="#EAB308"
    />
  );
}

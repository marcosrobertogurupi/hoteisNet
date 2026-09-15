import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  CalendarCheck,
  FileSignature,
  MessageCircle,
  Radar,
  Users,
  Sparkles,
  Wallet,
  PackageSearch,
  type LucideIcon,
} from "lucide-react";

const serif = { fontFamily: "'Newsreader', Georgia, 'Times New Roman', serif" } as const;
const sans = { fontFamily: "'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif" } as const;
const mono = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" } as const;

// Mapa de quartos ilustrativo (visual do herói)
const ROOM_CELLS: Array<"occupied" | "dirty" | "vacant"> = [
  "occupied", "occupied", "dirty", "vacant",
  "occupied", "vacant", "occupied", "occupied",
  "dirty", "occupied", "vacant", "occupied",
];
const CELL_BG: Record<string, string> = {
  occupied: "#E7F1EF",
  dirty: "#FBF1DC",
  vacant: "#F1EEE7",
};
const CELL_DOT: Record<string, string | null> = {
  occupied: "#0F6E68",
  dirty: "#C98A2B",
  vacant: null,
};
// células que ganham "ping" ambiente
const PINGING = new Set([1, 6, 9]);

const FEATURES = [
  "Ficha do hóspede sem papel",
  "Atendimento automático no WhatsApp",
  "Faturamento para empresas parceiras",
  "Mapa de quartos em tempo real",
  "Um vigia que nunca dorme",
  "Fila de espera avisada na hora",
  "Governança que se organiza sozinha",
];

const FEATURE_CARDS: Array<{
  icon: LucideIcon;
  title: string;
  desc: string;
  autonomous?: boolean;
}> = [
  {
    icon: BedDouble,
    title: "Mapa de quartos ao vivo",
    desc: "O status de cada quarto muda de cor sozinho conforme a operação acontece. Um clique resolve: marcar como limpo, lançar um consumo, fazer o check-out.",
  },
  {
    icon: CalendarCheck,
    title: "Reservas sem risco de conflito",
    desc: "Toda tentativa de reservar um quarto que já está ocupado naquele período é barrada na hora, sem precisar de ninguém conferindo a planilha.",
    autonomous: true,
  },
  {
    icon: FileSignature,
    title: "Ficha do hóspede, preenchida à distância",
    desc: "Horas antes da chegada, o hóspede recebe um link pelo WhatsApp, preenche os próprios dados e assina pelo celular. O envio ao órgão do governo responsável acontece sozinho, sem ninguém precisar lembrar.",
    autonomous: true,
  },
  {
    icon: MessageCircle,
    title: "Atendimento pelo WhatsApp a qualquer hora",
    desc: "Um assistente automático informa disponibilidade e preços, envia fotos dos quartos e pode até fechar a reserva sozinho, sempre dentro das regras que você define. Quando algo foge do script, a recepção é avisada na hora.",
    autonomous: true,
  },
  {
    icon: Radar,
    title: "Um vigia que nunca tira folga",
    desc: "A operação é observada 24 horas por dia: um quarto parado demais na limpeza, um prazo perto de vencer, o WhatsApp do hotel fora do ar — o aviso chega para quem precisa saber assim que o problema aparece.",
    autonomous: true,
  },
  {
    icon: Users,
    title: "Fila de espera que se resolve sozinha",
    desc: "Sem vaga para o período pedido, o hóspede entra numa fila de espera. Assim que um quarto libera, o primeiro da fila é avisado automaticamente — sem planilha, sem ninguém de olho no calendário.",
    autonomous: true,
  },
  {
    icon: Sparkles,
    title: "Governança organizada sozinha",
    desc: "Todo dia, a arrumação dos quartos ocupados é distribuída automaticamente entre a equipe de limpeza, e os quartos com chegada prevista para hoje sobem para o topo da fila por conta própria.",
    autonomous: true,
  },
  {
    icon: Wallet,
    title: "Financeiro sempre fechado",
    desc: "Caixa da recepção, contas a pagar e a receber, faturamento para empresas parceiras — tudo em um só lugar, com cada centavo rastreado por operador e por turno.",
  },
  {
    icon: PackageSearch,
    title: "Loja e estoque ligados ao quarto",
    desc: "O consumo do frigobar ou do restaurante entra direto na conta do hóspede, e o estoque de cada ponto de venda se atualiza sozinho.",
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FBFAF7] text-[#1C1B18]" style={sans}>
      {/* Fontes e fundo claro só para a landing (o layout raiz é escuro) */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Hanken+Grotesk:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <style>{`
        body { background-color: #FBFAF7 !important; }

        @keyframes hn-rise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
        @keyframes hn-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes hn-drift { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(24px, -18px) scale(1.08); } }
        @keyframes hn-ping { 0% { transform: scale(1); opacity: .6; } 70%, 100% { transform: scale(2.6); opacity: 0; } }
        @keyframes hn-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes hn-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        .hn-rise { opacity: 0; animation: hn-rise .8s cubic-bezier(.2,.7,.2,1) forwards; }
        .hn-float { animation: hn-float 7s ease-in-out infinite; }
        .hn-blob { animation: hn-drift 18s ease-in-out infinite; }

        .hn-nav-link { position: relative; }
        .hn-nav-link::after {
          content: ""; position: absolute; left: 0; bottom: -5px; height: 1.5px; width: 100%;
          background: currentColor; transform: scaleX(0); transform-origin: left; transition: transform .3s cubic-bezier(.2,.7,.2,1);
        }
        .hn-nav-link:hover::after { transform: scaleX(1); }

        .hn-cta { transition: transform .25s cubic-bezier(.2,.7,.2,1), box-shadow .25s, background-color .2s, border-color .2s; }
        .hn-cta:hover { transform: translateY(-2px); }

        .hn-card { transition: transform .3s cubic-bezier(.2,.7,.2,1), box-shadow .3s, border-color .3s; }
        .hn-card:hover { transform: translateY(-6px); box-shadow: 0 26px 50px -30px rgba(15,110,104,.4); border-color: rgba(15,110,104,.5); }
        .hn-card:hover .hn-arrow { transform: translateX(6px); color: #0F6E68; }
        .hn-arrow { transition: transform .3s cubic-bezier(.2,.7,.2,1), color .3s; }

        .hn-bar { transform: scaleX(0); transform-origin: left; animation: hn-grow 1.1s cubic-bezier(.3,.8,.3,1) .35s forwards; }
        .hn-ping { animation: hn-ping 3.4s cubic-bezier(.2,.6,.3,1) infinite; }

        .hn-marquee-mask { -webkit-mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent); mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent); }
        .hn-marquee-track { display: flex; width: max-content; animation: hn-marquee 32s linear infinite; }
        .hn-marquee-mask:hover .hn-marquee-track { animation-play-state: paused; }

        @media (prefers-reduced-motion: reduce) {
          .hn-rise, .hn-float, .hn-blob, .hn-bar, .hn-ping, .hn-marquee-track { animation: none !important; }
          .hn-rise { opacity: 1; }
          .hn-bar { transform: none; }
        }
      `}</style>

      {/* Atmosfera de fundo */}
      <div
        className="hn-blob pointer-events-none absolute -left-40 -top-40 h-[30rem] w-[30rem] rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(15,110,104,0.10), transparent 70%)" }}
      />
      <div
        className="hn-blob pointer-events-none absolute -right-48 top-1/3 h-[34rem] w-[34rem] rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(201,138,43,0.10), transparent 70%)", animationDelay: "-6s" }}
      />

      <div className="relative mx-auto max-w-[1180px] px-6 pb-16 pt-8 md:px-[60px] md:pb-[60px] md:pt-11">
        {/* Nav */}
        <header className="hn-rise flex items-center justify-between gap-3 pb-14 md:pb-[72px]">
          <div className="flex items-center gap-3 md:gap-3.5">
            <img
              src="/brand/icon.png"
              alt="Hoteis.Net"
              className="h-11 w-11 shrink-0 rounded-xl object-contain shadow-sm ring-1 ring-[#E7E3DA] md:h-14 md:w-14"
            />
            <div>
              <span style={serif} className="block text-[21px] font-semibold leading-none tracking-tight md:text-[31px]">
                Hoteis.Net
              </span>
              <span className="mt-1.5 block whitespace-nowrap text-[9px] uppercase tracking-[0.18em] text-[#6B6862] md:text-[11px] md:tracking-[0.2em]">
                Gestão Hoteleira na Nuvem
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm md:gap-7">
            <Link
              href="/admin"
              className="hn-nav-link hidden font-medium text-[#1C1B18] sm:block"
            >
              Portal SuperAdmin
            </Link>
            <Link
              href="/principal"
              className="hn-cta whitespace-nowrap rounded-full border border-[#1C1B18] px-4 py-2 text-xs font-semibold text-[#1C1B18] hover:bg-[#1C1B18] hover:text-[#FBFAF7] md:px-5 md:py-2.5 md:text-sm"
            >
              Acesso Assinantes
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="grid grid-cols-1 items-center gap-9 pb-16 md:grid-cols-12 md:pb-[76px]">
          <div className="md:col-span-7">
            <p className="hn-rise mb-6 text-xs uppercase tracking-[0.16em] text-[#6B6862]" style={{ animationDelay: "80ms" }}>
              Gestão hoteleira na nuvem&nbsp;&nbsp;·&nbsp;&nbsp;hotéis e pousadas
            </p>
            <h1
              style={{ ...serif, animationDelay: "150ms" }}
              className="hn-rise text-[40px] font-medium leading-[1.05] tracking-tight md:text-[56px]"
            >
              Gestão hoteleira completa,{" "}
              <span className="italic text-[#0F6E68]">com boa parte da rotina no automático</span>.
            </h1>
            <p
              className="hn-rise mt-6 max-w-[30rem] text-base leading-relaxed text-[#4A4842] md:text-[17px]"
              style={{ animationDelay: "240ms" }}
            >
              Mapa de quartos em tempo real, ficha do hóspede assinada pelo próprio celular e um
              assistente que atende no WhatsApp e cuida da operação sozinho, 24 horas por dia.
            </p>
            <div className="hn-rise mt-8 flex flex-wrap gap-3.5" style={{ animationDelay: "330ms" }}>
              <Link
                href="/principal"
                className="hn-cta rounded-full bg-[#0F6E68] px-7 py-3 text-sm font-semibold text-[#FBFAF7] shadow-[0_10px_30px_-12px_rgba(15,110,104,0.6)] hover:bg-[#0B534E] hover:shadow-[0_16px_36px_-12px_rgba(15,110,104,0.7)]"
              >
                Acessar plataforma
              </Link>
              <Link
                href="/admin"
                className="hn-cta rounded-full border border-[#D8D3C7] px-7 py-3 text-sm font-semibold text-[#1C1B18] hover:border-[#1C1B18]"
              >
                Portal SuperAdmin
              </Link>
            </div>
          </div>

          {/* Mapa de quartos ilustrativo */}
          <div className="hn-rise md:col-span-5" style={{ animationDelay: "420ms" }}>
            <div className="hn-float rounded-[20px] border border-[#E7E3DA] bg-white p-[22px] shadow-[0_30px_60px_-40px_rgba(28,27,24,0.25)]">
              <div className="mb-2 flex items-center justify-between text-[11px] text-[#6B6862]" style={mono}>
                <span>MAPA DE QUARTOS</span>
                <span>18 / 24</span>
              </div>
              <div className="mb-3.5 h-[3px] w-full overflow-hidden rounded-full bg-[#EFEBE2]">
                <div className="hn-bar h-full w-3/4 rounded-full bg-[#0F6E68]" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {ROOM_CELLS.map((state, i) => (
                  <div
                    key={i}
                    className="relative h-[46px] rounded-[9px]"
                    style={{ backgroundColor: CELL_BG[state] }}
                  >
                    {CELL_DOT[state] && (
                      <span className="absolute right-2 top-2 h-[7px] w-[7px]">
                        {PINGING.has(i) && (
                          <span
                            className="hn-ping absolute inset-0 rounded-full"
                            style={{ backgroundColor: CELL_DOT[state] as string, animationDelay: `${i * 0.6}s` }}
                          />
                        )}
                        <span
                          className="absolute inset-0 rounded-full"
                          style={{ backgroundColor: CELL_DOT[state] as string }}
                        />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Recursos — operação com boa parte no automático */}
        <section className="pb-16 md:pb-[76px]">
          <div className="hn-rise mb-10 max-w-2xl" style={{ animationDelay: "460ms" }}>
            <p className="mb-3 text-xs uppercase tracking-[0.16em] text-[#6B6862]">Operação do dia a dia</p>
            <h2 style={serif} className="text-[28px] font-medium leading-tight tracking-tight md:text-[38px]">
              Uma equipe extra que <span className="italic text-[#0F6E68]">trabalha sozinha</span> nos bastidores.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[#4A4842] md:text-base">
              Boa parte da rotina do hotel acontece sem ninguém precisar acionar nada. Enquanto sua
              equipe cuida do hóspede, o sistema cuida do resto — e avisa na hora quando algo
              precisa de uma decisão sua.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_CARDS.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="hn-card hn-rise flex flex-col rounded-[20px] border border-[#E7E3DA] bg-white p-7"
                  style={{ animationDelay: `${520 + i * 60}ms` }}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1EEE7] text-[#0F6E68]">
                      <Icon className="h-5 w-5" />
                    </span>
                    {f.autonomous && (
                      <span className="rounded-full bg-[#FBF1DC] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#C98A2B]">
                        Trabalha sozinho
                      </span>
                    )}
                  </div>
                  <h3 style={serif} className="mb-2 text-[18px] font-medium leading-snug">
                    {f.title}
                  </h3>
                  <p className="text-[13.5px] leading-relaxed text-[#4A4842]">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Portais */}
        <section className="grid grid-cols-1 gap-5 pb-14 md:grid-cols-2">
          <Link
            href="/principal"
            className="hn-card hn-rise group flex flex-col rounded-[20px] border border-[#E7E3DA] bg-white p-8"
            style={{ animationDelay: "500ms" }}
          >
            <h2 style={serif} className="mb-2.5 flex items-center justify-between text-[25px] font-medium">
              Portal do Assinante
              <ArrowRight className="hn-arrow h-5 w-5 text-[#C9C3B6]" />
            </h2>
            <p className="mb-6 text-sm leading-relaxed text-[#4A4842]">
              Reservas, mapa de quartos, ficha digital do hóspede, governança, consumo e um
              assistente automático de atendimento — a operação do hotel em um só lugar.
            </p>
            <div className="mt-auto flex items-center justify-between border-t border-[#EFEBE2] pt-4 text-xs text-[#6B6862]">
              <span>Ambiente operacional do hotel</span>
              <span style={mono} className="text-[#0F6E68]">app.hoteisnet.com</span>
            </div>
          </Link>

          <Link
            href="/admin"
            className="hn-card hn-rise group flex flex-col rounded-[20px] border border-[#E7E3DA] bg-white p-8"
            style={{ animationDelay: "580ms" }}
          >
            <h2 style={serif} className="mb-2.5 flex items-center justify-between text-[25px] font-medium">
              Portal SuperAdmin
              <ArrowRight className="hn-arrow h-5 w-5 text-[#C9C3B6]" />
            </h2>
            <p className="mb-6 text-sm leading-relaxed text-[#4A4842]">
              Gestão dos hotéis assinantes, faturamento, acompanhamento do assistente de IA e
              central de suporte da plataforma.
            </p>
            <div className="mt-auto flex items-center justify-between border-t border-[#EFEBE2] pt-4 text-xs text-[#6B6862]">
              <span>Central de gestão da plataforma</span>
              <span style={mono} className="text-[#0F6E68]">admin.hoteisnet.com</span>
            </div>
          </Link>
        </section>

        {/* Recursos — faixa em movimento */}
        <div className="hn-rise hn-marquee-mask overflow-hidden border-t border-[#E7E3DA] pt-6" style={{ animationDelay: "660ms" }}>
          <div className="hn-marquee-track text-[13px] text-[#4A4842]">
            {[...FEATURES, ...FEATURES, ...FEATURES, ...FEATURES].map((f, i) => (
              <span key={i} className="flex items-center whitespace-nowrap">
                <span className="px-6">{f}</span>
                <span aria-hidden className="text-[#CFC9BC]">·</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

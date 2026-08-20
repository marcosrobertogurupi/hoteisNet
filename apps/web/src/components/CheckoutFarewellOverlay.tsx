"use client";

import { useEffect, useRef } from "react";
import { DoorOpen, Users, Luggage, Wind, Sparkles } from "lucide-react";

interface CheckoutFarewellOverlayProps {
  roomNumber?: string;
  onFinished: () => void;
}

export default function CheckoutFarewellOverlay({ roomNumber, onFinished }: CheckoutFarewellOverlayProps) {
  const finishedRef = useRef(false);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinished();
  };

  // Fallback caso o evento onAnimationEnd não dispare (ex: aba em segundo plano)
  useEffect(() => {
    const timer = setTimeout(finish, 2900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="checkout-farewell-overlay absolute inset-0 z-30 rounded-2xl overflow-hidden flex items-center justify-center bg-gradient-to-br from-[#D97706] to-[#78350F]"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && e.animationName === "checkoutOverlayFade") {
          finish();
        }
      }}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Cena 1: casal deixando o quarto, feliz com a estadia */}
        <div className="checkout-scene-leave absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
          <div className="relative w-12 h-9 flex items-center justify-center">
            <Luggage className="checkout-walk-out w-7 h-7 text-white absolute right-5" strokeWidth={1.75} />
            <DoorOpen className="w-9 h-9 text-white/60 scale-x-[-1]" strokeWidth={1.75} />
          </div>
          <Users className="w-4 h-4 text-white/80" strokeWidth={1.75} />
          <span className="text-[11px] font-semibold tracking-wide text-white/90">Deixando o quarto...</span>
        </div>

        {/* Cena 2: quarto liberado, pronto para higienização */}
        <div className="checkout-scene-aired absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
          <div className="relative">
            <Wind className="w-11 h-11 text-white" strokeWidth={1.5} />
            <Sparkles className="checkout-sparkle-1 w-3.5 h-3.5 text-amber-200 absolute -top-2 -left-1" />
            <Sparkles className="checkout-sparkle-2 w-3 h-3 text-amber-200 absolute -top-3 right-0" />
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-white/90 text-center px-4 truncate max-w-full">
            {roomNumber ? `Quarto ${roomNumber} liberado!` : "Quarto liberado!"}
          </span>
        </div>
      </div>
    </div>
  );
}

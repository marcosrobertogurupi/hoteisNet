"use client";

import { useEffect, useRef } from "react";
import { DoorOpen, Users, BedDouble, Heart, Sparkles } from "lucide-react";

interface CheckinCelebrationOverlayProps {
  guestName?: string;
  onFinished: () => void;
}

export default function CheckinCelebrationOverlay({ guestName, onFinished }: CheckinCelebrationOverlayProps) {
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
      className="checkin-celebration-overlay absolute inset-0 z-30 rounded-2xl overflow-hidden flex items-center justify-center bg-gradient-to-br from-[#184176] to-[#0F2A4D]"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && e.animationName === "checkinOverlayFade") {
          finish();
        }
      }}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Cena 1: casal entrando no quarto, feliz */}
        <div className="checkin-scene-walk absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
          <div className="relative w-12 h-9 flex items-center justify-center">
            <DoorOpen className="w-9 h-9 text-white/60" strokeWidth={1.75} />
            <Users className="checkin-walk-in w-7 h-7 text-white absolute left-5" strokeWidth={1.75} />
          </div>
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          <span className="text-[11px] font-semibold tracking-wide text-white/90">Entrando no quarto...</span>
        </div>

        {/* Cena 2: casal feliz, hospedagem iniciada */}
        <div className="checkin-scene-bed absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
          <div className="relative">
            <BedDouble className="w-11 h-11 text-white" strokeWidth={1.5} />
            <Heart className="checkin-heart-1 w-3.5 h-3.5 text-rose-300 fill-rose-300 absolute -top-3 left-1" />
            <Heart className="checkin-heart-2 w-3 h-3 text-rose-300 fill-rose-300 absolute -top-4 right-0" />
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-white/90 text-center px-4 truncate max-w-full">
            {guestName ? `${guestName.split(" ")[0]} fez check-in!` : "Hospedagem iniciada!"}
          </span>
        </div>
      </div>
    </div>
  );
}

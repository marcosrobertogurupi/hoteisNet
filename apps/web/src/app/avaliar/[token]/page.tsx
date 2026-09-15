"use client";

import { useState, useEffect, use } from "react";
import { Star, CheckCircle2, XCircle } from "lucide-react";

interface HotelInfo {
  name: string;
  logoUrl: string | null;
}

export default function ReviewFeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hotel, setHotel] = useState<HotelInfo | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<"REDIRECTED_TO_REVIEW" | "ESCALATED_INTERNALLY" | null>(null);

  useEffect(() => {
    fetch(`/api/public/review-feedback/${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          setErrorMsg(data.error || "Link inválido.");
        } else {
          setHotel(data.hotel);
        }
      })
      .catch(() => setErrorMsg("Não foi possível carregar esta página. Tente novamente."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (nota: number) => {
    setSelected(nota);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/review-feedback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ satisfaction: nota }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Não foi possível registrar sua avaliação.");
        return;
      }
      if (data.outcome === "REDIRECTED_TO_REVIEW" && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      setOutcome(data.outcome);
    } catch {
      setErrorMsg("Erro de conexão. Tente novamente em instantes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-xl p-8 text-center space-y-5">
        {loading && <p className="text-sm text-slate-500">Carregando...</p>}

        {!loading && errorMsg && (
          <>
            <XCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <p className="text-sm text-slate-700">{errorMsg}</p>
          </>
        )}

        {!loading && !errorMsg && !outcome && hotel && (
          <>
            {hotel.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hotel.logoUrl} alt={hotel.name} className="h-12 mx-auto object-contain" />
            ) : (
              <p className="text-sm font-bold text-slate-500">{hotel.name}</p>
            )}
            <h1 className="text-lg font-bold text-slate-900">Como foi sua estadia?</h1>
            <p className="text-xs text-slate-500">Toque numa nota de 1 a 5 — leva 10 segundos.</p>
            <div className="flex items-center justify-center gap-2 pt-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  disabled={submitting}
                  onClick={() => handleSubmit(n)}
                  className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center transition disabled:opacity-50 ${
                    selected === n ? "bg-amber-500 border-amber-500 text-white" : "border-slate-200 text-slate-400 hover:border-amber-400 hover:text-amber-500"
                  }`}
                >
                  <Star className={`w-5 h-5 ${selected === n ? "fill-white" : ""}`} />
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[11px] text-slate-400 px-1">
              <span>Muito ruim</span>
              <span>Excelente</span>
            </div>
          </>
        )}

        {!loading && outcome === "ESCALATED_INTERNALLY" && (
          <>
            <CheckCircle2 className="w-10 h-10 text-teal-500 mx-auto" />
            <h1 className="text-lg font-bold text-slate-900">Obrigado pelo retorno!</h1>
            <p className="text-sm text-slate-600">
              Sentimos muito que sua experiência não tenha sido a melhor. Nossa equipe já foi avisada e vai entrar em contato para resolver.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

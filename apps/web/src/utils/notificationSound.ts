// Toca um sinal sonoro curto (dois "beeps") via Web Audio API — não depende de nenhum arquivo de
// áudio externo, então funciona offline e sem custo de asset. Usado quando chega uma mensagem
// WhatsApp de um hóspede e a tela de conversa não está aberta.
let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContextClass();
  }
  return sharedAudioContext;
}

export function playWhatsappNotificationSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const playBeep = (startOffset: number, frequency: number) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, ctx.currentTime + startOffset);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + startOffset + 0.02);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startOffset + 0.18);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime + startOffset);
    oscillator.stop(ctx.currentTime + startOffset + 0.2);
  };

  playBeep(0, 880);
  playBeep(0.22, 1046.5);
}

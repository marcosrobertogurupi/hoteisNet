// Nome do evento global disparado no `window` sempre que o caixa do operador autenticado é
// aberto ou fechado, para que o CashRegisterGate (que vive no layout, fora da página de caixa)
// saiba reavaliar imediatamente se deve bloquear o app.
export const CAIXA_CHANGED_EVENT = "hoteisnet:caixa-changed";

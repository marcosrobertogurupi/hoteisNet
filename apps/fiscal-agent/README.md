# Agente Fiscal do PDV — contrato de implementação

Serviço local (Windows) que roda em **cada caixa** do restaurante. Responsável por: pegar da
API do HoteisNet as comandas que precisam de NFC-e, **assinar o XML e transmitir à SEFAZ-TO**
com o certificado A1 da máquina, **imprimir o DANFE** na impressora térmica do caixa e devolver
o resultado para a API.

O navegador **nunca** fala com este agente — ele é sempre *pull* da API (evita o problema de
_mixed content_ entre a página HTTPS e o `localhost`). Só a **NFC-e (modelo 65)** passa pelo
agente; a **NF-e (modelo 55)** é emitida no servidor (fase posterior).

> Status: **a implementação .NET ainda não existe.** Este documento é o contrato que o lado
> servidor (Next.js) já implementa e testa. Para escrever o agente é preciso um ambiente
> Windows com .NET 8, as bibliotecas ACBr e um certificado A1 de homologação.

---

## Stack sugerida

- **.NET 8**, rodando como **Windows Service** (`Microsoft.Extensions.Hosting`).
- Motor fiscal: **ACBrMonitorPLUS** empacotado junto (config via `.ini` gerada a partir do que
  a API entrega) — caminho de menor risco para o MVP. Alternativa: **ACBrLibNFe** via P/Invoke.
- Impressão: **ACBrPosPrinter** (Epson, Bematech, Elgin, Daruma, Control iD).
- Store local: **SQLite** para idempotência (nunca emitir 2× o mesmo `fiscalDocumentId`) e fila
  de retransmissão do callback se a API estiver momentaneamente fora.
- Certificado **A1** instalado no Windows Certificate Store da máquina (referência por
  _thumbprint_ na config); nunca vai para o banco.
- Config protegida com **DPAPI** (token do caixa, thumbprint do certificado).

## Configuração do agente (arquivo local)

```jsonc
{
  "apiBaseUrl": "https://<app>.vercel.app",   // ou o domínio do HoteisNet
  "terminalToken": "pdvt_...",                 // gerado no cadastro do caixa (Fiscal & PDV → Caixas)
  "certificateThumbprint": "….",               // A1 no Certificate Store
  "printer": { "model": "Epson TM-T20", "port": "USB" }
}
```

O token do caixa é gerado (e mostrado **uma única vez**) em **Fiscal & PDV → Caixas → novo
caixa** / botão de regenerar token. Regenerar invalida o token anterior.

---

## Ciclo do agente

### 1. Heartbeat — a cada ~30 s

```
POST {apiBaseUrl}/api/pdv/agente/heartbeat
Authorization: Bearer {terminalToken}
Content-Type: application/json

{
  "versao": "1.0.0",
  "statusSefaz": "OPERANTE",              // opcional
  "certificadoValidoAte": "2027-03-01",   // opcional (ISO) — alimenta o alerta de vencimento na UI
  "certificadoTitular": "HOTEL X LTDA"    // opcional
}
```
Resposta: `{ success, versaoMinimaAgente, pollIntervalSegundos }`.

### 2. Buscar pendentes — a cada `pollIntervalSegundos` (padrão 5 s)

```
GET {apiBaseUrl}/api/pdv/agente/pendentes
Authorization: Bearer {terminalToken}
```
Resposta:
```jsonc
{
  "success": true,
  "pendentes": [
    { "fiscalDocumentId": "uuid", "comanda": "12", "payload": { /* NfcePayload, ver abaixo */ } }
  ]
}
```
Se o payload de um documento estiver inválido (config incompleta, item sem NCM…), a API já o
marca como `REJEITADA` com o motivo e ele **não** aparece aqui — o operador vê na tela do PDV.

Para cada pendente, **em ordem** e respeitando idempotência (`fiscalDocumentId` já processado no
SQLite → pula):

1. Montar o XML da NFC-e a partir do `payload` (mapeamento na seção "Payload").
2. Assinar com o A1.
3. Transmitir à SEFAZ-TO (autorização normal — **sem contingência**; se a SEFAZ ou a internet
   estiverem fora, não emite, tenta de novo no próximo ciclo).
4. Imprimir o DANFE NFC-e na térmica.
5. Devolver o resultado (passo 3).

### 3. Devolver o resultado

```
POST {apiBaseUrl}/api/pdv/agente/documentos/{fiscalDocumentId}
Authorization: Bearer {terminalToken}
Content-Type: application/json
```

Autorizada:
```jsonc
{
  "status": "AUTORIZADA",
  "chave": "43xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",  // 44 dígitos
  "protocolo": "143250000…",
  "qrCodeData": "https://…?p=…",       // conteúdo do QR Code (opcional)
  "xmlBase64": "…",                     // XML autorizado (procNFe) — vai para o Storage
  "danfeBase64": "…"                    // PDF do DANFE (opcional) — vai para o Storage
}
```

Rejeitada / denegada:
```jsonc
{ "status": "REJEITADA", "motivoRejeicao": "Rejeição 539: …" }
```

A API atualiza o `FiscalDocument` e a comanda (`FISCAL_AUTORIZADA` / `FISCAL_REJEITADA`). Uma
comanda rejeitada volta para a fila quando o operador clica **Reemitir** (gera um documento
novo, com número novo).

---

## Payload da NFC-e (`payload` de cada pendente)

Estrutura montada em `apps/web/src/lib/fiscal/nfcePayload.ts` (fonte da verdade). Resumo:

```jsonc
{
  "modelo": 65,
  "serie": 1,
  "numero": 42,
  "ambiente": "HOMOLOGACAO",            // ou "PRODUCAO"
  "dhEmi": "2026-09-01T18:30:00.000Z",  // horário real da emissão (pode ser posterior à venda)
  "emitente": {
    "cnpj": "12345678000190",
    "razaoSocial": "…", "nomeFantasia": "…",
    "inscricaoEstadual": "…",
    "crt": "3",                          // 1 Simples/MEI · 3 regime normal (Lucro Presumido/Real)
    "endereco": { "logradouro": "…", "numero": "…", "bairro": "…",
                  "municipio": "…", "codigoMunicipioIbge": "1721000", "uf": "TO", "cep": "77400000" }
  },
  "destinatario": { "cpfCnpj": "12345678900" } | null,   // "CPF na nota", opcional
  "csc": { "id": "000001", "codigo": "<CSC>" },          // Código de Segurança do Contribuinte (QR Code)
  "itens": [
    {
      "numero": 1, "codigo": "…", "descricao": "…",
      "ncm": "22021000", "cfop": "5102", "cest": null, "ean": null,
      "unidade": "UN", "quantidade": 2, "valorUnitario": 8.0, "valorDesconto": 0, "valorTotal": 16.0,
      "origem": "0",
      "icms":   { "cst": "00", "csosn": null, "aliquota": 18, "reducaoBase": 0 },
      "pis":    { "cst": "07", "aliquota": 0 },
      "cofins": { "cst": "07", "aliquota": 0 }
    }
  ],
  "totais": { "produtos": 16.0, "desconto": 0, "total": 16.0 },
  "pagamentos": [ { "tPag": "01", "valor": 16.0 } ],      // 01 dinheiro · 03 crédito · 04 débito · 17 PIX · 99 outros
  "informacoesComplementares": "…" | null
}
```

Notas de mapeamento para o ACBr:
- `crt = 1` → usar `CSOSN` do item; `crt = 3` → usar `CST` do item (o hotel atual é Lucro
  Presumido, sempre CST).
- `pagamentos` com `tPag = "99"` (ex.: comanda de hóspede lançada na conta do quarto) — a nota
  é emitida mesmo assim; o valor foi para o folio da hospedagem.
- `ambiente = "HOMOLOGACAO"` → série e CSC de homologação; a razão social do destinatário em
  homologação deve ser "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" quando o ACBr
  não fizer isso automaticamente.

---

## Empacotamento (fase posterior)

Instalador MSI (Inno Setup / WiX) + assinatura **Authenticode** (senão SmartScreen/antivírus
barram) + auto-update consultando `versaoMinimaAgente` do heartbeat. Runbook de instalação:
certificado A1, impressora, token do caixa, checagem do relógio do SO (NFC-e rejeita hora fora
de faixa).

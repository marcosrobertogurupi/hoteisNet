"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

// Equivalente ao gIdUsuario / Win_Inicio.Edt_Usuario do sistema WinDev original:
// identifica qual operador está ativo no terminal para vincular os lançamentos de
// caixa (Cai_LanPor / HosP_IDOperador) a quem efetivamente realizou a operação.
export interface OperatorContextType {
  operatorId: string;
  operatorName: string;
  setOperator: (operatorId: string, operatorName: string) => void;
}

const DEFAULT_OPERATOR_ID = "USR-001";
const DEFAULT_OPERATOR_NAME = "OPERADOR RECEPÇÃO";

const OperatorContext = createContext<OperatorContextType | undefined>(undefined);

export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const [operatorId, setOperatorId] = useState<string>(DEFAULT_OPERATOR_ID);
  const [operatorName, setOperatorName] = useState<string>(DEFAULT_OPERATOR_NAME);

  useEffect(() => {
    try {
      const savedId = localStorage.getItem("hoteisnet_active_operator_id");
      const savedName = localStorage.getItem("hoteisnet_active_operator_name");
      if (savedId) setOperatorId(savedId);
      if (savedName) setOperatorName(savedName);
    } catch (e) {
      console.error("Failed to load active operator from localStorage", e);
    }
  }, []);

  const setOperator = (id: string, name: string) => {
    setOperatorId(id);
    setOperatorName(name.toUpperCase());
    localStorage.setItem("hoteisnet_active_operator_id", id);
    localStorage.setItem("hoteisnet_active_operator_name", name.toUpperCase());
  };

  return (
    <OperatorContext.Provider value={{ operatorId, operatorName, setOperator }}>
      {children}
    </OperatorContext.Provider>
  );
}

export function useOperator(): OperatorContextType {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error("useOperator must be used within an OperatorProvider");
  return ctx;
}

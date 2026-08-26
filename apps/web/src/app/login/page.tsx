"use client";

import React from "react";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-slate-100" />}>
      <LoginForm variant="page" />
    </React.Suspense>
  );
}

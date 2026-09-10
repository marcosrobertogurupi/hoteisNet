import { createClient } from "@supabase/supabase-js";

// Cliente Supabase com a chave de SERVICE ROLE — ignora RLS e enxerga todos os tenants.
// Vive em um módulo próprio, separado do cliente anônimo, para que um import descuidado do
// cliente de navegador nunca arraste a chave de serviço para o bundle do frontend. Só pode ser
// importado por código que roda no servidor (route handlers, libs de servidor).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

import { NextRequest, NextResponse } from "next/server";
import { getMaintenanceUser } from "@/lib/maintenanceSession";
import { MaintenanceError, addMaintenancePhoto } from "@/lib/maintenance";
import {
  MaintenancePhotoError,
  MAX_MAINTENANCE_PHOTO_BYTES,
  MAX_MAINTENANCE_PHOTOS_PER_TICKET,
  removeMaintenancePhoto,
  uploadMaintenancePhoto,
} from "@/lib/maintenancePhotoStorage";

// POST /api/manutencao-app/os/[id]/fotos — o colaborador atribuído fotografa o problema. Corpo
// multipart com o campo `foto` (o app já reduz a imagem no celular). O arquivo vai para o Storage
// (bucket privado) e o banco guarda só o caminho.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let uploadedPath: string | null = null;
  try {
    const user = await getMaintenanceUser(req);
    if (!user) return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    const { id } = await params;

    const form = await req.formData().catch(() => null);
    const file = form?.get("foto");
    if (!file || typeof file === "string") {
      return NextResponse.json({ success: false, error: "Envie a foto." }, { status: 400 });
    }
    if (file.size > MAX_MAINTENANCE_PHOTO_BYTES) {
      return NextResponse.json({ success: false, error: "A foto passa do tamanho máximo de 3 MB." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    uploadedPath = await uploadMaintenancePhoto(user.tenantId, id, buffer);
    const photo = await addMaintenancePhoto({
      tenantId: user.tenantId,
      ticketId: id,
      employeeId: user.employeeId,
      employeeName: user.name,
      storagePath: uploadedPath,
      maxPhotos: MAX_MAINTENANCE_PHOTOS_PER_TICKET,
    });
    uploadedPath = null; // gravado — não é mais órfão

    return NextResponse.json({ success: true, photoId: photo.id }, { status: 201 });
  } catch (error: any) {
    if (uploadedPath) await removeMaintenancePhoto(uploadedPath);
    if (error instanceof MaintenanceError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof MaintenancePhotoError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("[POST /api/manutencao-app/os/[id]/fotos] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao guardar a foto." }, { status: 500 });
  }
}

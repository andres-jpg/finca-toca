import { NOMBRE_PLATAFORMA } from "@/lib/plataforma";
import { MarcaPlataforma } from "@/components/marca-plataforma";
import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-sm border">
        <div className="text-center space-y-2">
          <MarcaPlataforma />
          <p className="text-sm text-gray-500">Inicia sesión en {NOMBRE_PLATAFORMA}</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}

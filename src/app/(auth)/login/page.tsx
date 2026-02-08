import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-sm border">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Finca Toca</h1>
          <p className="text-sm text-gray-500">Inicia sesión para continuar</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}

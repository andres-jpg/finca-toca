import { SignUpForm } from "@/features/auth/components/signup-form";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-sm border">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Finca Toca</h1>
          <p className="text-sm text-gray-500">Crea una cuenta nueva</p>
        </div>
        <SignUpForm />
      </div>
    </div>
  );
}

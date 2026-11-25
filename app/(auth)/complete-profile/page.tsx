import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server";
import CompleteProfileForm from "@/components/CompleteProfileForm";

export const instant = false;

export default async function CompleteProfilePage() {
  const user = await getCurrentUser();

  if (!user) redirect("/sign-in");

  if (user.onboardingComplete) {
    redirect(user.role === "admin" ? "/admin/dashboard" : "/dashboard");
  };
  
  return <CompleteProfileForm />;
}

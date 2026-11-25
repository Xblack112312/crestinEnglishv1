"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "next-auth/react";
import { requireAdmin } from "@/lib/server";
import { hasPermission } from "@/lib/authorization";

interface NavbarProps {
  session?: {
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      role?: "admin" | "student";
      avatar?: string;
    } | null;
  } | null;
  status?: string;
}

function getInitials(name?: string | null, email?: string | null) {
  if (name?.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  return email?.[0]?.toUpperCase() ?? "U";
}

export default function Navbar({ session, status }: NavbarProps) {
  const router = useRouter();

  const user = session?.user;
  const avatarSrc = user?.avatar;
  const initials = getInitials(user?.name, user?.email);

  const isAdmin = Boolean(user && hasPermission(user?.role, "admin:access"));

  return (
    <nav className="flex items-center justify-between pt-6">
      <Link href="/">
        <h1 className="text-xl font-bold">CrestInEnglish.</h1>
      </Link>

      <section className="flex items-center gap-2">
        {status === "unauthenticated" && (
          <button
            type="button"
            onClick={() => router.push("/sign-up")}
            className="
              flex items-center justify-center gap-1.5
              rounded-md border border-neutral-950
              bg-neutral-950 px-4 py-2.5 text-[14px]
              tracking-[-0.015em] text-white
              cursor-pointer
              transition-colors duration-150 ease-out
              hover:bg-neutral-800 hover:border-neutral-800
              active:bg-neutral-900
              focus-visible:outline-none
              focus-visible:ring-2
              focus-visible:ring-neutral-950
              focus-visible:ring-offset-2
              disabled:cursor-not-allowed disabled:opacity-50
              motion-reduce:transition-none
            "
          >
            <ChevronRight size={17} />
            Join Crest
          </button>
        )}

        {status === "authenticated" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Open account menu"
                className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2"
              >
                <Avatar className="size-9">
                  {avatarSrc && (
                    <AvatarImage
                      src={avatarSrc}
                      alt={`${user?.name ?? "User"} avatar`}
                    />
                  )}

                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal flex items-start flex-row gap-3">
                <Avatar className="size-9">
                  {avatarSrc && (
                    <AvatarImage
                      src={avatarSrc}
                      alt={`${user?.name ?? "User"} avatar`}
                    />
                  )}

                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-black!">
                    {user?.name ?? "My Account"}
                  </p>
                  {user?.email && (
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  )}
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuGroup>
                <DropdownMenuItem>Account</DropdownMenuItem>
                <DropdownMenuItem>Enrolls</DropdownMenuItem>
              </DropdownMenuGroup>

              {isAdmin && <DropdownMenuSeparator />}
              {isAdmin && <DropdownMenuItem className="cursor-pointer!" onClick={() => router.replace('/dashboard')}>Admin</DropdownMenuItem>}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="cursor-pointer!"
                onClick={async () => {
                  await signOut();
                }}
              >
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </section>
    </nav>
  );
}

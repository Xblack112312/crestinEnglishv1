"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";

import Sidebar, { type SidebarUser } from "@/components/Sidebar";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface DashboardShellProps {
  children: ReactNode;
  user: SidebarUser;
}

export function DashboardShell({ children, user }: DashboardShellProps) {
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateViewport = () => setIsDesktop(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="min-h-dvh bg-neutral-50! lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">

        {/* Desktop Sidebar */}
        <aside className="hidden min-w-0 lg:sticky lg:top-0 lg:block lg:h-dvh">
          {isDesktop ? <Sidebar user={user} /> : null}
        </aside>

        {/* Main Application */}
        <div className="flex min-h-dvh min-w-0 flex-col">

          {/* Mobile Navbar */}
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 lg:hidden">
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open navigation menu"
                className="size-10 shrink-0"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
          </header>

          {/* Page Content */}
          <main className="min-w-0 flex-1">
            <div className="w-full p-4 sm:p-6 lg:p-8">
              {children}
            </div>
          </main>

        </div>

        {/* Mobile Sheet */}
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-max! p-0 sm:max-w-none lg:hidden"
          onClickCapture={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("a")
            ) {
              setOpen(false);
            }
          }}
        >
          <SheetTitle className="sr-only">
            Dashboard navigation
          </SheetTitle>

          <Sidebar user={user} />
        </SheetContent>

      </div>
    </Sheet>
  );
}

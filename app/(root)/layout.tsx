"use client";
import Navbar from "@/components/Navbar";
import { useSession } from "next-auth/react";
import React from "react";

interface HomeLayout {
  children: React.ReactNode;
}

const HomeLayout = ({ children }: HomeLayout) => {
  const { data: session, status } = useSession();

  return (
    <div className="px-12">
      <Navbar session={session} status={status} />
      <main>{children}</main>
    </div>
  );
};

export default HomeLayout;

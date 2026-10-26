import type { ReactNode } from "react";

export default function Centered({ children }: { children: ReactNode }) {
  return <main className="centered">{children}</main>;
}

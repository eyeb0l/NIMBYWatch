"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Radar } from "lucide-react";
export function Header() {
  const path = usePathname();
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="NIMBYWatch home">
        <span className="brand-icon">
          <Radar size={25} />
        </span>
        NIMBY<span className="brand-light">Watch</span>
        <span className="edition">London</span>
      </Link>
      <nav aria-label="Main navigation">
        {[
          ["/", "Explore"],
          ["/analytics", "Analytics"],
          ["/methodology", "Our methodology"],
        ].map(([url, label]) => (
          <Link key={url} className={path === url ? "active" : ""} href={url}>
            {label}
          </Link>
        ))}
      </nav>
      <Link href="/analysis" className="contribute">
        Document analysis <ArrowUpRight size={15} />
      </Link>
    </header>
  );
}

"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  MapPin,
  Info,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Application } from "@/lib/types";
import {
  dateLabel,
  statusLabels,
  housingTotals,
  getHousingMetric,
} from "@/lib/presentation";
import { Status } from "./status";
const PlanningMap = dynamic(() => import("./planning-map"), {
  ssr: false,
  loading: () => (
    <div className="map-wrap map-loading">Loading interactive map…</div>
  ),
});
export type Coverage = {
  applicationId: string;
  categories: string[];
  hasObjectionEvidence: boolean;
};
const categories = [
  "traffic",
  "parking",
  "heritage",
  "overshadowing",
  "privacy",
  "neighbourhood_character",
  "ecology",
  "infrastructure",
  "other",
];
export function Explorer({
  applications,
  coverage,
}: {
  applications: Application[];
  coverage: Coverage[];
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [size, setSize] = useState("all"),
    [category, setCategory] = useState("all"),
    [authority, setAuthority] = useState("all"),
    [selected, setSelected] = useState<string | null>(null),
    [more, setMore] = useState(false);
  const filtered = useMemo(
    () =>
      applications.filter(
        (a) =>
          `${a.reference} ${a.address} ${a.ward ?? ""}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (status === "all" || a.status === status) &&
          (authority === "all" || a.authority === authority) &&
          (!from ||
            (a.registeredDate !== null &&
              a.registeredDate.slice(0, 10) >= from)) &&
          (!to ||
            (a.registeredDate !== null &&
              a.registeredDate.slice(0, 10) <= to)) &&
          (size === "all" ||
            (size === "unknown"
              ? getHousingMetric(a, "proposedUnits").value === null
              : getHousingMetric(a, "proposedUnits").value !== null &&
                (size === "major"
                  ? (getHousingMetric(a, "proposedUnits").value ?? 0) >= 10
                  : (getHousingMetric(a, "proposedUnits").value ?? 0) < 10))) &&
          (category === "all" ||
            coverage.some(
              (c) =>
                c.applicationId === a.id && c.categories.includes(category),
            )),
      ),
    [
      applications,
      search,
      status,
      authority,
      from,
      to,
      size,
      category,
      coverage,
    ],
  );
  const homes = housingTotals(filtered, "proposedUnits");
  const analysed = new Set(
    coverage
      .filter(
        (c) =>
          c.hasObjectionEvidence &&
          filtered.some((a) => a.id === c.applicationId),
      )
      .map((c) => c.applicationId),
  ).size;
  const active = filtered.find((a) => a.id === selected);
  const hasFilters =
    search ||
    status !== "all" ||
    authority !== "all" ||
    from ||
    to ||
    size !== "all" ||
    category !== "all";
  function reset() {
    setSearch("");
    setStatus("all");
    setAuthority("all");
    setFrom("");
    setTo("");
    setSize("all");
    setCategory("all");
    setSelected(null);
  }
  return (
    <main className="explorer">
      <section className="intro">
        <div>
          <h1>Planning, in public.</h1>
          <p>Follow the proposals shaping London. Start with Camden.</p>
        </div>
        <Link href="/methodology" className="source-chip">
          <span className="live-dot" />
          Real council records <ArrowUpRight size={15} />
        </Link>
      </section>
      <section className="stats-row" aria-label="Summary statistics">
        <Stat
          value={filtered.length.toLocaleString()}
          label="Applications"
          sub="Residential-related records"
        />
        <Stat
          value={homes.total?.toLocaleString() ?? "Unknown"}
          label="Proposed homes"
          sub={`${homes.known} of ${filtered.length} records · partial sum`}
          testId="proposed-homes-stat"
        />
        <Stat
          value={String(filtered.filter((a) => a.status === "approved").length)}
          label="Approved"
          sub="Applications, not homes"
          color="approved"
        />
        <Stat
          value={String(filtered.filter((a) => a.status === "refused").length)}
          label="Refused"
          sub="No causal inference"
          color="refused"
        />
        <Stat
          value={`${analysed} / ${filtered.length}`}
          label="Objection coverage"
          sub="Applications with reviewed evidence"
        />
      </section>
      <div className="housing-coverage" data-testid="housing-coverage">
        <span>
          <strong>Housing evidence:</strong> {homes.sourceReported}{" "}
          source-reported · {homes.aiExtracted} AI-extracted · {homes.unknown}{" "}
          unknown
        </span>
        <span>
          Counts across applications, not unique homes.{" "}
          <Link href="/methodology#housing-evidence">How we count</Link>
        </span>
      </div>
      <section className="workspace">
        <div className="filterbar">
          <div className="search-field">
            <Search size={18} />
            <Input
              aria-label="Search applications"
              placeholder="Search an address, postcode or reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button aria-label="Clear search" onClick={() => setSearch("")}>
                <X size={16} />
              </button>
            )}
          </div>
          <label className="filter-label">
            <span>Outcome</span>
            <select
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All outcomes</option>
              {Object.entries(statusLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-label">
            <span>Authority</span>
            <select
              aria-label="Authority"
              value={authority}
              onChange={(e) => setAuthority(e.target.value)}
            >
              <option value="all">All authorities</option>
              <option value="Camden">Camden</option>
            </select>
          </label>
          <Button
            variant="outline"
            onClick={() => setMore(!more)}
            aria-expanded={more}
          >
            <SlidersHorizontal data-icon="inline-start" />
            Filters {more ? "−" : "+"}
          </Button>
        </div>
        {more && (
          <div className="advanced-filters">
            <label>
              Registered from
              <input
                aria-label="Registered from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Registered to
              <input
                aria-label="Registered to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label>
              Development size
              <select
                aria-label="Development size"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              >
                <option value="all">All sizes</option>
                <option value="minor">Under 10 proposed homes</option>
                <option value="major">10+ proposed homes</option>
                <option value="unknown">Units unknown</option>
              </select>
            </label>
            <label>
              Objection category
              <select
                aria-label="Objection category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option value={c} key={c}>
                    {c.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="map-list">
          <aside className="results">
            <div className="results-heading">
              <div>
                <strong>{filtered.length} applications</strong>
                <span>Newest registered first</span>
              </div>
              {hasFilters && (
                <button className="text-button" onClick={reset}>
                  Reset filters
                </button>
              )}
            </div>
            <div className="results-scroll">
              {filtered.length === 0 ? (
                <div className="empty">
                  <Search size={28} />
                  <h2>No matching applications</h2>
                  <p>
                    Try a broader search or clear your filters. Objection
                    filters include reviewed evidence only.
                  </p>
                  <Button variant="outline" onClick={reset}>
                    Clear filters
                  </Button>
                </div>
              ) : (
                filtered.map((a) => (
                  <article
                    className={`result-item ${selected === a.id ? "selected" : ""}`}
                    key={a.id}
                  >
                    <div className="result-meta">
                      <span>{a.reference}</span>
                      <Status status={a.status} />
                    </div>
                    <Link
                      className="result-address"
                      href={`/applications/${a.id}`}
                    >
                      {a.address}
                      <ArrowUpRight size={17} />
                    </Link>
                    <p>{a.description}</p>
                    <div className="result-bottom">
                      <span>
                        {a.ward ?? "Camden"} · {dateLabel(a.registeredDate)}
                      </span>
                      {a.latitude !== null && a.longitude !== null && (
                        <button
                          aria-label={`Show ${a.reference} on map`}
                          onClick={() => setSelected(a.id)}
                        >
                          <MapPin size={15} />
                        </button>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
            <div className="list-foot">
              A sample of Camden records, not a borough census.
            </div>
          </aside>
          <div className="map-panel">
            <PlanningMap
              applications={filtered}
              selected={selected}
              onSelect={setSelected}
            />
            {active && (
              <div className="map-selection">
                <button
                  className="dismiss"
                  aria-label="Close selected application"
                  onClick={() => setSelected(null)}
                >
                  <X size={16} />
                </button>
                <Status status={active.status} />
                <strong>{active.address}</strong>
                <span>{active.reference}</span>
                <Link href={`/applications/${active.id}`}>
                  Explore application <ArrowRight size={16} />
                </Link>
              </div>
            )}
            <div className="map-legend">
              {Object.keys(statusLabels).map((s) => (
                <Status key={s} status={s as Application["status"]} />
              ))}
            </div>
          </div>
        </div>
      </section>
      <div className="coverage-note">
        <Info size={17} />
        <p>
          <strong>Evidence before assumptions.</strong> Objections, officer
          assessments and formal decisions are separate records. A refusal alone
          does not tell us why homes were not built.{" "}
          <Link href="/methodology">
            Read our methodology <ArrowUpRight size={12} />
          </Link>
        </p>
        <span>
          Imported{" "}
          {applications[0] ? dateLabel(applications[0].ingestedAt) : "not yet"}
        </span>
      </div>
    </main>
  );
}
function Stat({
  value,
  label,
  sub,
  color,
  testId,
}: {
  value: string;
  label: string;
  sub: string;
  color?: string;
  testId?: string;
}) {
  return (
    <div className={`stat ${color ?? ""}`} data-testid={testId}>
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import { FaSyncAlt } from "react-icons/fa";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts";

// =====================================================
// TYPES & API
// =====================================================

type RiskLevel = "High" | "Moderate" | "Low";

type AreaData = {
  id: string | number;
  name: string;
  safety: number;
  threats: number;
  resolved: number;
  active: number;
  risk: RiskLevel;
  latitude: number;
  longitude: number;
  createdAt?: string;
  updatedAt?: string;
};

type Incident = {
  id: string;
  title: string;
  area: string;
  category: string;
  date: string;
  priority: RiskLevel;
  status: "Under Review" | "Resolved" | "Pending";
  description: string;
  latitude: number;
  longitude: number;
};

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || "https://shurokkha-ai-server.vercel.app"
).replace(/\/$/, "");
const API_URL = `${API_BASE}/api/area-reports`;

// Loose component type used for react-leaflet components (fixes TS2322 prop errors)
type LooseComponent = ComponentType<
  Record<string, unknown> & { children?: ReactNode }
>;

// =====================================================
// INTERACTIVE MAP
// Dynamic loading keeps Leaflet browser-only.
// react-leaflet components are cast to a loose type so TypeScript
// does not fail when @types/leaflet is missing/unresolved.
// =====================================================

const SafetyMap = dynamic(
  async () => {
    const RL = await import("react-leaflet");

    const MapContainer = RL.MapContainer as unknown as LooseComponent;
    const TileLayer = RL.TileLayer as unknown as LooseComponent;
    const CircleMarker = RL.CircleMarker as unknown as LooseComponent;
    const Popup = RL.Popup as unknown as LooseComponent;

    function MapContent({
      areas,
      reports,
    }: {
      areas: AreaData[];
      reports: Incident[];
    }) {
      const centerLat =
        areas.length > 0 &&
        typeof areas[0].latitude === "number" &&
        !isNaN(areas[0].latitude)
          ? areas[0].latitude
          : 23.7806;
      const centerLng =
        areas.length > 0 &&
        typeof areas[0].longitude === "number" &&
        !isNaN(areas[0].longitude)
          ? areas[0].longitude
          : 90.4;

      return (
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={11}
          scrollWheelZoom
          style={{ height: "100%", width: "100%", background: "#061a38" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {areas.map((area) => {
            const color =
              area.risk === "High"
                ? "#ef4444"
                : area.risk === "Moderate"
                  ? "#f59e0b"
                  : "#04F06A";

            return (
              <CircleMarker
                key={`area-${area.id}`}
                center={[area.latitude, area.longitude]}
                radius={
                  area.risk === "High" ? 17 : area.risk === "Moderate" ? 12 : 8
                }
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.35,
                  weight: 2,
                }}
              >
                <Popup>
                  <div style={{ color: "#111", minWidth: 170 }}>
                    <strong>{area.name}</strong>
                    <p>Safety score: {area.safety}%</p>
                    <p>Reported threats: {area.threats}</p>
                    <p>Resolved: {area.resolved}</p>
                    <p>Active: {area.active}</p>
                    <strong style={{ color }}>Risk: {area.risk}</strong>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {reports.map((report) => (
            <CircleMarker
              key={`report-${report.id}`}
              center={[report.latitude, report.longitude]}
              radius={5}
              pathOptions={{
                color: "#fff",
                fillColor: "#ef4444",
                fillOpacity: 1,
                weight: 1,
              }}
            >
              <Popup>
                <div style={{ color: "#111", minWidth: 170 }}>
                  <strong>{report.title}</strong>
                  <p>{report.area}</p>
                  <p>{report.category}</p>
                  <p>{report.date}</p>
                  <p>Status: {report.status}</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      );
    }

    return MapContent;
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-white/60">
        Loading live map...
      </div>
    ),
  },
);

// =====================================================
// STYLING HELPERS
// =====================================================

const riskColors: Record<RiskLevel, string> = {
  High: "#ef4444",
  Moderate: "#f59e0b",
  Low: "#04F06A",
};

const statusClasses: Record<Incident["status"], string> = {
  Resolved: "border-[#04F06A]/20 bg-[#04F06A]/10 text-[#04F06A]",
  "Under Review": "border-amber-400/20 bg-amber-400/10 text-amber-300",
  Pending: "border-red-400/20 bg-red-400/10 text-red-300",
};

// =====================================================
// MAIN PAGE
// =====================================================

export default function AreaReportPage() {
  const [areas, setAreas] = useState<AreaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "All">("All");
  const [statusFilter, setStatusFilter] = useState<Incident["status"] | "All">(
    "All",
  );

  const fetchAreaReports = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(API_URL, { cache: "no-store" });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to load area reports from server");
      }

      const records = Array.isArray(result.data) ? result.data : [];
      const normalized: AreaData[] = records.map((item: any, index: number) => {
        const safetyVal = Number(item.safety);
        const threatsVal = Number(item.threats);
        const resolvedVal = Number(item.resolved);
        const activeVal = Number(item.active);
        const latVal = Number(item.latitude);
        const lngVal = Number(item.longitude);

        return {
          id: item._id || item.id || `area-${index + 1}`,
          name: item.name ? String(item.name).trim() : `Area ${index + 1}`,
          safety: isNaN(safetyVal) ? 0 : Math.min(100, Math.max(0, safetyVal)),
          threats: isNaN(threatsVal) ? 0 : Math.max(0, threatsVal),
          resolved: isNaN(resolvedVal) ? 0 : Math.max(0, resolvedVal),
          active: isNaN(activeVal) ? 0 : Math.max(0, activeVal),
          risk: (["High", "Moderate", "Low"].includes(item.risk)
            ? item.risk
            : "Moderate") as RiskLevel,
          latitude: isNaN(latVal) || latVal === 0 ? 23.8103 : latVal,
          longitude: isNaN(lngVal) || lngVal === 0 ? 90.4125 : lngVal,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt,
        };
      });

      setAreas(normalized);
    } catch (err) {
      console.error("Fetch area reports error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to connect to the area reports service.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAreaReports();
  }, [fetchAreaReports]);

  const filteredAreas = useMemo(
    () =>
      riskFilter === "All"
        ? areas
        : areas.filter((area) => area.risk === riskFilter),
    [areas, riskFilter],
  );

  const incidents: Incident[] = useMemo(() => {
    if (areas.length === 0) return [];

    return areas.map((area, index) => {
      const formattedDate = area.createdAt
        ? new Date(area.createdAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "Recent";

      let status: Incident["status"] = "Under Review";
      if (area.active === 0 && area.resolved > 0) {
        status = "Resolved";
      } else if (area.threats > 0 && area.resolved === 0) {
        status = "Pending";
      }

      return {
        id: `AR-${String(index + 1).padStart(4, "0")}`,
        title: `${area.name} Safety Report`,
        area: area.name,
        category: `${area.risk} Risk Sector`,
        date: formattedDate,
        priority: area.risk,
        status,
        description: `Monitored area with ${area.safety}% safety score. ${area.active} active threats requiring follow-up, ${area.resolved} resolved cases.`,
        latitude: area.latitude,
        longitude: area.longitude,
      };
    });
  }, [areas]);

  const filteredIncidents = useMemo(
    () =>
      statusFilter === "All"
        ? incidents
        : incidents.filter((item) => item.status === statusFilter),
    [incidents, statusFilter],
  );

  const totalThreats = useMemo(
    () => areas.reduce((sum, area) => sum + (area.threats || 0), 0),
    [areas],
  );
  const totalResolved = useMemo(
    () => areas.reduce((sum, area) => sum + (area.resolved || 0), 0),
    [areas],
  );
  const totalActive = useMemo(
    () => areas.reduce((sum, area) => sum + (area.active || 0), 0),
    [areas],
  );
  const avgSafety = useMemo(() => {
    if (areas.length === 0) return 0;
    return Math.round(
      areas.reduce((sum, area) => sum + (area.safety || 0), 0) / areas.length,
    );
  }, [areas]);

  const monthlyData = useMemo(() => {
    if (areas.length === 0) {
      return [
        { month: "May", threats: 0, resolved: 0 },
        { month: "Jun", threats: 0, resolved: 0 },
        { month: "Jul", threats: 0, resolved: 0 },
        { month: "Aug", threats: 0, resolved: 0 },
        { month: "Sep", threats: 0, resolved: 0 },
        { month: "Oct", threats: 0, resolved: 0 },
      ];
    }

    const now = new Date();
    const monthsMap = new Map<
      string,
      { month: string; threats: number; resolved: number }
    >();
    const defaultMonths: string[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mName = d.toLocaleString("en-US", { month: "short" });
      defaultMonths.push(mName);
      monthsMap.set(mName, { month: mName, threats: 0, resolved: 0 });
    }

    areas.forEach((area) => {
      const d = area.createdAt ? new Date(area.createdAt) : now;
      const mName = d.toLocaleString("en-US", { month: "short" });
      if (!monthsMap.has(mName)) {
        monthsMap.set(mName, { month: mName, threats: 0, resolved: 0 });
        defaultMonths.push(mName);
      }
      const current = monthsMap.get(mName)!;
      current.threats += area.threats;
      current.resolved += area.resolved;
    });

    return defaultMonths.map((m) => monthsMap.get(m)!);
  }, [areas]);

  const categoryData = useMemo(() => {
    if (areas.length === 0) {
      return [
        { name: "Active Threats", value: 50, color: "#ef4444" },
        { name: "Resolved Reports", value: 50, color: "#04F06A" },
      ];
    }

    const highThreats = areas
      .filter((a) => a.risk === "High")
      .reduce((s, a) => s + (a.threats || 0), 0);
    const modThreats = areas
      .filter((a) => a.risk === "Moderate")
      .reduce((s, a) => s + (a.threats || 0), 0);
    const lowThreats = areas
      .filter((a) => a.risk === "Low")
      .reduce((s, a) => s + (a.threats || 0), 0);

    const total = highThreats + modThreats + lowThreats;
    if (total === 0) {
      return [
        { name: "High Risk Zones", value: 0, color: "#ef4444" },
        { name: "Moderate Risk Zones", value: 0, color: "#f97316" },
        { name: "Low Risk Zones", value: 100, color: "#04F06A" },
      ];
    }

    const items = [
      {
        name: "High Risk Zones",
        value: Math.round((highThreats / total) * 100),
        color: "#ef4444",
      },
      {
        name: "Moderate Risk Zones",
        value: Math.round((modThreats / total) * 100),
        color: "#f97316",
      },
      {
        name: "Low Risk Zones",
        value: Math.round((lowThreats / total) * 100),
        color: "#04F06A",
      },
    ].filter((item) => item.value > 0);

    return items.length > 0
      ? items
      : [{ name: "Verified Areas", value: 100, color: "#04F06A" }];
  }, [areas]);

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_65%_40%,rgba(0,91,189,0.4),transparent_48%),linear-gradient(120deg,#061a38_0%,#020817_65%,#000000_100%)] px-4 py-8 text-[#F2EFEA] sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-10">
        {/* HEADER */}
        <header className="flex flex-col justify-between gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end">
          <div>
            <span className="inline-flex rounded-full border border-[#04F06A]/20 bg-[#04F06A]/10 px-3 py-1.5 text-xs font-semibold tracking-wider text-[#04F06A]">
              SHUROKKHAAI / AREA INTELLIGENCE
            </span>
            <h1 className="mt-18 text-3xl font-bold tracking-tight sm:text-4xl">
              Area Safety Report
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300/70">
              Explore area safety indicators, threats, resolved reports, and
              geographic incident patterns.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <button
              type="button"
              onClick={fetchAreaReports}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-[#04F06A]/30 bg-[#04F06A]/10 px-4 py-2 text-xs font-semibold text-[#04F06A] transition hover:bg-[#04F06A]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaSyncAlt className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Refreshing..." : "Refresh Live Data"}
            </button>

            <div className="hidden items-center gap-2 rounded-full border border-[#04F06A]/20 bg-[#04F06A]/10 px-4 py-2 text-xs font-medium text-[#04F06A] sm:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#04F06A]" />
              Live monitoring
            </div>
          </div>
        </header>

        {/* ERROR ALERT */}
        {error && (
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300 sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold text-white">Connection issue</p>
              <p className="mt-1">{error}</p>
            </div>
            <button
              type="button"
              onClick={fetchAreaReports}
              className="shrink-0 rounded-xl bg-red-500/20 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-500/30"
            >
              Try Again
            </button>
          </div>
        )}

        {/* SECTION 1: AREA CARDS */}
        <section>
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#04F06A]">
                Section 01
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                Area-by-Area Safety Matrix
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              {areas.length} monitored areas · Live database records
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-12 text-center text-sm text-slate-400 sm:col-span-2 xl:col-span-5">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#04F06A] border-t-transparent" />
                Loading live area safety reports...
              </div>
            ) : filteredAreas.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-12 text-center text-sm text-slate-400 sm:col-span-2 xl:col-span-5">
                No area reports found matching the selected filter.
              </div>
            ) : (
              filteredAreas.map((area) => (
              <article
                key={area.id}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-lg shadow-black/10 backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:border-[#04F06A]/30 hover:bg-slate-900/90"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{area.name}</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Dhaka Metropolitan Area
                    </p>
                  </div>
                  <span
                    className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      color: riskColors[area.risk],
                      borderColor: `${riskColors[area.risk]}40`,
                      backgroundColor: `${riskColors[area.risk]}12`,
                    }}
                  >
                    {area.risk} Risk
                  </span>
                </div>

                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <p
                      className="text-3xl font-bold"
                      style={{ color: riskColors[area.risk] }}
                    >
                      {area.safety}%
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Safety score</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{area.threats}</p>
                    <p className="text-xs text-slate-400">Total threats</p>
                  </div>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${area.safety}%`,
                      backgroundColor: riskColors[area.risk],
                    }}
                  />
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/[0.08] pt-4">
                  <div>
                    <p className="text-xs text-slate-400">Resolved</p>
                    <p className="mt-1 font-semibold text-[#04F06A]">
                      {area.resolved}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Active</p>
                    <p className="mt-1 font-semibold text-red-400">
                      {area.active}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Resolution</p>
                    <p className="mt-1 font-semibold text-slate-200">
                      {area.threats > 0
                        ? `${Math.round((area.resolved / area.threats) * 100)}%`
                        : "—"}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-xs text-slate-500">
                  Coordinates: {area.latitude.toFixed(4)},{" "}
                  {area.longitude.toFixed(4)}
                </p>
              </article>
            ))
          )}
        </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                label: "Reported threats",
                value: totalThreats,
                color: "#ef4444",
              },
              {
                label: "Resolved reports",
                value: totalResolved,
                color: "#04F06A",
              },
              { label: "Active reports", value: totalActive, color: "#f59e0b" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-4"
              >
                <p className="text-xs text-slate-400">{item.label}</p>
                <p
                  className="mt-2 text-2xl font-bold"
                  style={{ color: item.color }}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 2: FULL-WIDTH MAP */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 shadow-2xl shadow-black/20">
          <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#04F06A]">
                Section 02
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                Live Safety & Risk-Zone Map
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Select a marker to view the area or incident details.
              </p>
            </div>

            <select
              value={riskFilter}
              onChange={(event) =>
                setRiskFilter(event.target.value as RiskLevel | "All")
              }
              className="rounded-xl border border-white/10 bg-[#061a38] px-4 py-3 text-sm text-white outline-none focus:border-[#04F06A]"
              aria-label="Filter map by risk"
            >
              <option value="All">All risk levels</option>
              <option value="High">High risk</option>
              <option value="Moderate">Moderate risk</option>
              <option value="Low">Low risk</option>
            </select>
          </div>

          <div className="px-3 pb-3 sm:px-5 sm:pb-5">
            <div className="h-[420px] overflow-hidden rounded-xl border border-white/10 sm:h-[540px]">
              <SafetyMap areas={filteredAreas} reports={incidents} />
            </div>
          </div>

          <div className="flex flex-wrap gap-5 border-t border-white/10 px-5 py-4">
            {[
              { name: "High risk", color: "#ef4444" },
              { name: "Moderate risk", color: "#f59e0b" },
              { name: "Low risk", color: "#04F06A" },
            ].map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-slate-400">{item.name}</span>
              </div>
            ))}
          </div>

          <p className="px-5 pb-5 text-xs leading-5 text-slate-400">
            Live telemetry map: locations, safety indices, and threat levels are
            synchronized from published area reports in the database.
          </p>
        </section>

        {/* SECTION 3: MODERN SAFETY ANALYTICS */}
        <section className="relative">
          <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#04F06A]/20 bg-[#04F06A]/[0.07] px-3 py-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#04F06A]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#04F06A]">
                  Intelligence Overview
                </span>
              </div>

              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Safety <span className="text-[#04F06A]">Analytics</span>
              </h2>

              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                Discover reporting patterns, track resolution performance, and
                compare safety conditions across monitored areas.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 md:self-auto">
              <svg
                className="h-4 w-4 text-[#04F06A]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M3 3v18h18" />
                <path d="m7 14 4-4 4 4 6-7" />
              </svg>
              <span className="text-xs font-medium text-slate-300">
                Analytics dashboard
              </span>
            </div>
          </div>

          {/* KPI summary cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Total Threats",
                value: totalThreats,
                description: "Reports across all areas",
                icon: "!",
                color: "#F87171",
                change: "Reported",
              },
              {
                label: "Successfully Resolved",
                value: totalResolved,
                description: "Resolved reports",
                icon: "✓",
                color: "#04F06A",
                change: "Resolved",
              },
              {
                label: "Active Threats",
                value: totalActive,
                description: "Require attention",
                icon: "↗",
                color: "#FBBF24",
                change: "Active",
              },
              {
                label: "Average Safety",
                value: `${avgSafety}%`,
                description: "Across monitored areas",
                icon: "◎",
                color: "#60A5FA",
                change: "Area score",
              },
            ].map((metric) => (
              <article
                key={metric.label}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#07152b]/80 p-5 transition duration-300 hover:-translate-y-1 hover:border-white/20"
              >
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-[0.09] blur-2xl transition group-hover:opacity-20"
                  style={{ backgroundColor: metric.color }}
                />

                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-400">
                      {metric.label}
                    </p>
                    <p className="mt-3 text-3xl font-bold tracking-tight text-white">
                      {metric.value}
                    </p>
                  </div>

                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl border text-lg font-bold"
                    style={{
                      color: metric.color,
                      backgroundColor: `${metric.color}12`,
                      borderColor: `${metric.color}30`,
                    }}
                  >
                    {metric.icon}
                  </div>
                </div>

                <div className="relative mt-5 flex items-center justify-between gap-2 border-t border-white/[0.07] pt-3">
                  <span className="text-[11px] text-slate-500">
                    {metric.description}
                  </span>
                  <span
                    className="rounded-full px-2 py-1 text-[10px] font-semibold"
                    style={{
                      color: metric.color,
                      backgroundColor: `${metric.color}12`,
                    }}
                  >
                    {metric.change}
                  </span>
                </div>
              </article>
            ))}
          </div>

          {/* Main charts */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            {/* Monthly trend chart */}
            <article className="overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0b1c35]/95 to-[#050d1d]/95 p-5 sm:p-6 xl:col-span-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#04F06A]" />
                    <h3 className="text-base font-bold text-white">
                      Incident Activity
                    </h3>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Monthly reports and resolution performance
                  </p>
                </div>

                <span className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[10px] text-slate-400">
                  Last 6 months · Live telemetry
                </span>
              </div>

              <div className="mt-7 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={monthlyData}
                    margin={{ top: 10, right: 8, left: -22, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="threatFillModern"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#F87171"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#F87171"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="resolvedFillModern"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#04F06A"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="95%"
                          stopColor="#04F06A"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      stroke="#ffffff0b"
                      strokeDasharray="4 6"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#8191a9", fontSize: 11 }}
                      dy={10}
                    />

                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#8191a9", fontSize: 11 }}
                      allowDecimals={false}
                    />

                    <Tooltip
                      cursor={{ stroke: "#ffffff25", strokeDasharray: "4 4" }}
                      contentStyle={{
                        background: "#07152b",
                        border: "1px solid #ffffff18",
                        borderRadius: "12px",
                        color: "#F2EFEA",
                        fontSize: "12px",
                        boxShadow: "0 15px 40px #00000040",
                      }}
                    />

                    <Legend
                      iconType="circle"
                      iconSize={7}
                      wrapperStyle={{
                        fontSize: "11px",
                        color: "#a7b4c8",
                        paddingTop: "16px",
                      }}
                    />

                    <Area
                      type="monotone"
                      dataKey="threats"
                      name="Reported threats"
                      stroke="#F87171"
                      strokeWidth={2.5}
                      fill="url(#threatFillModern)"
                      activeDot={{ r: 5, strokeWidth: 0 }}
                    />

                    <Area
                      type="monotone"
                      dataKey="resolved"
                      name="Resolved reports"
                      stroke="#04F06A"
                      strokeWidth={2.5}
                      fill="url(#resolvedFillModern)"
                      activeDot={{ r: 5, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </article>

            {/* Incident category breakdown */}
            <article className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0b1c35]/95 to-[#050d1d]/95 p-5 sm:p-6 xl:col-span-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-400" />
                <h3 className="text-base font-bold text-white">
                  Threat Breakdown
                </h3>
              </div>

              <p className="mt-2 text-xs text-slate-400">
                Distribution by incident category
              </p>

              <div className="relative mt-3 h-[225px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={92}
                      paddingAngle={4}
                      stroke="none"
                    >
                      {categoryData.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Pie>

                    <Tooltip
                      contentStyle={{
                        background: "#07152b",
                        border: "1px solid #ffffff18",
                        borderRadius: "12px",
                        color: "#F2EFEA",
                        fontSize: "12px",
                      }}
                      formatter={(value: unknown) =>
                        [`${String(value ?? 0)}%`, "Share"] as [string, string]
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-white">
                    {categoryData.reduce((sum, item) => sum + item.value, 0)}%
                  </span>
                  <span className="mt-1 text-[10px] text-slate-500">
                    Total share
                  </span>
                </div>
              </div>

              <div className="mt-3 space-y-4">
                {categoryData.map((item) => (
                  <div key={item.name}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-xs text-slate-300">
                          {item.name}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-white">
                        {item.value}%
                      </span>
                    </div>

                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${item.value}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>

          {/* Area comparison */}
          <article className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-5 sm:p-6">
            <h3 className="text-lg font-semibold">Safety Score by Area</h3>
            <p className="mt-1 text-xs text-slate-400">
              Compare sample safety scores across monitored locations.
            </p>

            <div className="mt-5 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={areas}
                  margin={{ top: 10, right: 10, left: -20, bottom: 35 }}
                >
                  <defs>
                    <linearGradient
                      id="safetyGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#04F06A"
                        stopOpacity={0.35}
                      />
                      <stop offset="95%" stopColor="#04F06A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#ffffff12"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#061a38",
                      border: "1px solid #ffffff20",
                      borderRadius: 12,
                      color: "#F2EFEA",
                    }}
                    formatter={(value: unknown) =>
                      [`${String(value ?? 0)}%`, "Safety score"] as [
                        string,
                        string,
                      ]
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="safety"
                    name="Safety score"
                    stroke="#04F06A"
                    strokeWidth={2}
                    fill="url(#safetyGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <p className="mt-4 text-[11px] leading-5 text-slate-500">
            Analytics derived from current area safety records.
          </p>
        </section>

        {/* SECTION 4: REPORT CARDS */}
        <section>
          <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#04F06A]">
                Section 04
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                Recent Incident Reports
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Review incident descriptions, locations, priorities, and
                statuses.
              </p>
            </div>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as Incident["status"] | "All",
                )
              }
              className="rounded-xl border border-white/10 bg-[#061a38] px-4 py-3 text-sm text-white outline-none focus:border-[#04F06A]"
              aria-label="Filter reports by status"
            >
              <option value="All">All statuses</option>
              <option value="Under Review">Under Review</option>
              <option value="Resolved">Resolved</option>
              <option value="Pending">Pending</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredIncidents.map((report) => (
              <article
                key={report.id}
                className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 transition duration-300 hover:border-[#04F06A]/25 hover:bg-slate-900/90"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[#04F06A]">
                      {report.id}
                    </p>
                    <h3 className="mt-2 text-lg font-bold">{report.title}</h3>
                  </div>

                  <span
                    className="rounded-full border px-3 py-1 text-xs font-semibold"
                    style={{
                      color: riskColors[report.priority],
                      borderColor: `${riskColors[report.priority]}40`,
                      backgroundColor: `${riskColors[report.priority]}12`,
                    }}
                  >
                    {report.priority} Priority
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-400">
                  <span>⌖ {report.area}</span>
                  <span>▦ {report.category}</span>
                  <span>◷ {report.date}</span>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-300/80">
                  {report.description}
                </p>

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses[report.status]}`}
                  >
                    {report.status}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      window.open(
                        `https://www.openstreetmap.org/?mlat=${report.latitude}&mlon=${report.longitude}#map=16/${report.latitude}/${report.longitude}`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                    className="text-xs font-semibold text-sky-400 transition hover:text-[#04F06A]"
                  >
                    View location ↗
                  </button>
                </div>
              </article>
            ))}

            {filteredIncidents.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-center text-sm text-slate-400 lg:col-span-2">
                No reports found for this status.
              </div>
            )}
          </div>
        </section>

        <footer className="border-t border-white/10 py-5 text-center text-xs leading-5 text-slate-500">
          ShurokkhaAI · Area Safety Intelligence · Live Platform Data
        </footer>
      </div>
    </main>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import type { Application } from "@/lib/types";
import type { Map as LibreMap, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { statusColors } from "@/lib/presentation";
import { LocateFixed } from "lucide-react";
const center: [number, number] = [-0.153, 51.55];
export default function PlanningMap({
  applications,
  selected,
  onSelect,
}: {
  applications: Application[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<LibreMap | null>(null),
    onSelectRef = useRef(onSelect),
    appsRef = useRef(applications);
  onSelectRef.current = onSelect;
  appsRef.current = applications;
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        const engine = token
          ? await import("mapbox-gl")
          : await import("maplibre-gl");
        if (cancelled || !container.current) return;
        if (!token) {
          const libre = engine as typeof import("maplibre-gl");
          libre.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
          libre.setWorkerCount(2);
        }
        const m = new engine.Map({
          container: container.current,
          style: token
            ? "mapbox://styles/mapbox/light-v11"
            : process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
              "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
          center,
          zoom: 12.3,
          minZoom: 9,
          maxZoom: 18,
          attributionControl: false,
          ...(token ? { accessToken: token } : {}),
        } as never) as unknown as LibreMap;
        map.current = m;
        m.addControl(
          new engine.NavigationControl({ showCompass: false }) as never,
          "top-right",
        );
        m.addControl(
          new engine.AttributionControl({
            compact: true,
            customAttribution: token
              ? undefined
              : '<a href="https://carto.com/attributions">CARTO</a>',
          }) as never,
          "bottom-right",
        );
        m.on("error", () =>
          setError(
            "Some map layers could not load. The application list is still available.",
          ),
        );
        m.on("load", () => {
          m.addSource("applications", {
            type: "geojson",
            data: features(appsRef.current),
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 35,
          });
          m.addLayer({
            id: "clusters",
            type: "circle",
            source: "applications",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#3659a4",
              "circle-radius": [
                "step",
                ["get", "point_count"],
                18,
                10,
                23,
                30,
                28,
              ],
              "circle-stroke-width": 3,
              "circle-stroke-color": "#ffffff",
              "circle-opacity": 0.92,
            },
          });
          m.addLayer({
            id: "cluster-count",
            type: "symbol",
            source: "applications",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 12,
              ...(!token ? { "text-font": ["Open Sans Regular"] } : {}),
            },
            paint: { "text-color": "#ffffff" },
          });
          m.addLayer({
            id: "points",
            type: "circle",
            source: "applications",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": ["get", "color"],
              "circle-radius": 7,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            },
          });
          m.addLayer({
            id: "selected",
            type: "circle",
            source: "applications",
            filter: ["==", ["get", "id"], ""],
            paint: {
              "circle-color": "transparent",
              "circle-radius": 12,
              "circle-stroke-width": 3,
              "circle-stroke-color": "#254fcd",
            },
          });
          m.on("click", "points", (e) => {
            const id = e.features?.[0]?.properties?.id;
            if (id) onSelectRef.current(String(id));
          });
          m.on("click", "clusters", async (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const source = m.getSource("applications");
            const clusterId = Number(f.properties.cluster_id);
            const zoom = token
              ? await new Promise<number>((resolve, reject) =>
                  (
                    source as unknown as import("mapbox-gl").GeoJSONSource
                  ).getClusterExpansionZoom(clusterId, (err, z) =>
                    err ? reject(err) : resolve(z ?? 14),
                  ),
                )
              : await (source as GeoJSONSource).getClusterExpansionZoom(
                  clusterId,
                );
            m.easeTo({
              center: (f.geometry as Point).coordinates as [number, number],
              zoom,
            });
          });
          for (const layer of ["points", "clusters"]) {
            m.on("mouseenter", layer, () => {
              m.getCanvas().style.cursor = "pointer";
            });
            m.on("mouseleave", layer, () => {
              m.getCanvas().style.cursor = "";
            });
          }
          setReady(true);
        });
      } catch {
        setError(
          "The interactive map is unavailable in this browser. Explore the same records in the list.",
        );
      }
    }
    void init();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (ready)
      (
        map.current?.getSource("applications") as GeoJSONSource | undefined
      )?.setData(features(applications));
  }, [applications, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    m.setFilter("selected", ["==", ["get", "id"], selected ?? ""]);
    const a = applications.find((a) => a.id === selected);
    if (a?.longitude != null && a.latitude != null)
      m.easeTo({ center: [a.longitude, a.latitude], zoom: 15, duration: 600 });
  }, [selected, ready, applications]);
  return (
    <div className="map-wrap" data-testid="planning-map" data-map-ready={ready}>
      <div
        className="map-canvas"
        ref={container}
        aria-label="Interactive map of Camden planning applications"
      />
      {!ready && !error && (
        <div className="map-loading" role="status">
          Loading Camden map…
        </div>
      )}
      <div className="map-label">
        <span className="live-dot" />
        Camden, London{" "}
        <span>
          {
            applications.filter(
              (a) => a.latitude !== null && a.longitude !== null,
            ).length
          }{" "}
          mapped
        </span>
      </div>
      <button
        className="map-reset"
        onClick={() => map.current?.easeTo({ center, zoom: 12.3 })}
      >
        <LocateFixed size={17} /> Reset view
      </button>
      {error && (
        <div className="map-error" role="status">
          {error}
        </div>
      )}
      <div className="map-note">Approximate locations · postcode centroids</div>
    </div>
  );
}
function features(apps: Application[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: apps
      .filter((a) => a.longitude !== null && a.latitude !== null)
      .map((a) => ({
        type: "Feature",
        properties: { id: a.id, color: statusColors[a.status] },
        geometry: { type: "Point", coordinates: [a.longitude!, a.latitude!] },
      })),
  };
}

"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Echo } from "@/lib/api";

const COLORS: Record<Echo["kind"], string> = {
  voice: "#ff5c8a",
  doodle: "#ffd23f",
  creature: "#3fe0c5",
};

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

export default function EchoMap({
  center,
  echoes,
  heat,
}: {
  center: [number, number];
  echoes: Echo[];
  heat: boolean;
}) {
  return (
    <MapContainer center={center} zoom={16} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <Recenter center={center} />
      {heat &&
        echoes.map((e) => (
          <Circle
            key={`heat-${e.id}`}
            center={[e.lat, e.lon]}
            radius={60}
            pathOptions={{ stroke: false, fillColor: "#ff3d00", fillOpacity: 0.12 + 0.2 * e.strength }}
          />
        ))}
      {echoes.map((e) => (
        <CircleMarker
          key={e.id}
          center={[e.lat, e.lon]}
          radius={5 + 7 * e.strength}
          pathOptions={{ color: COLORS[e.kind], fillColor: COLORS[e.kind], fillOpacity: 0.8, weight: 1 }}
        >
          <Tooltip>
            {e.kind}
            {e.creature ? ` (${e.creature})` : ""} · {Math.round(e.strength * 100)}% strength · {e.interactions} visits
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

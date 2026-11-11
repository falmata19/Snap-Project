"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import EchoList from "@/components/EchoList";
import { Echo, fetchMine, fetchNearby, removeEcho } from "@/lib/api";

const EchoMap = dynamic(() => import("@/components/EchoMap"), { ssr: false });

const FALLBACK: [number, number] = [44.9778, -93.265];
const RADII = [500, 2000, 10000, 50000];

export default function Page() {
  const [center, setCenter] = useState<[number, number]>(FALLBACK);
  const [radius, setRadius] = useState(2000);
  const [heat, setHeat] = useState(true);
  const [echoes, setEchoes] = useState<Echo[]>([]);
  const [mine, setMine] = useState<Echo[]>([]);
  const [creatorId, setCreatorId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("echoes_creator_id");
    if (saved) {
      setCreatorId(saved);
    }
    navigator.geolocation?.getCurrentPosition((p) => setCenter([p.coords.latitude, p.coords.longitude]));
  }, []);

  const refresh = useCallback(async () => {
    try {
      setEchoes(await fetchNearby(center[0], center[1], radius));
      setMine(creatorId.length >= 8 ? await fetchMine(creatorId) : []);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, [center, radius, creatorId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  const saveCreatorId = (value: string) => {
    setCreatorId(value);
    localStorage.setItem("echoes_creator_id", value);
  };

  const onDelete = async (id: string) => {
    try {
      await removeEcho(id, creatorId);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const strong = echoes.filter((e) => e.strength > 0.5).length;
  const visits = echoes.reduce((sum, e) => sum + e.interactions, 0);

  return (
    <div className="shell">
      <div className="map">
        <EchoMap center={center} echoes={echoes} heat={heat} />
      </div>
      <aside className="side">
        <h1>Echoes</h1>
        <div className="controls">
          <label>
            Radius
            <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {r >= 1000 ? `${r / 1000} km` : `${r} m`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Density heat
            <select value={heat ? "on" : "off"} onChange={(e) => setHeat(e.target.value === "on")}>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </label>
          <label>
            Creator id (printed in the Lens log)
            <input value={creatorId} onChange={(e) => saveCreatorId(e.target.value)} />
          </label>
        </div>
        <div className="stats">
          <div className="stat">
            <strong>{echoes.length}</strong>in range
          </div>
          <div className="stat">
            <strong>{strong}</strong>strong
          </div>
          <div className="stat">
            <strong>{visits}</strong>visits
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <h2>Your echoes</h2>
        <EchoList echoes={mine} onDelete={onDelete} />
      </aside>
    </div>
  );
}

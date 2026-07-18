/** Officer 3D village map — one marker per enterprise on a district grid.
 * Color = band, height = risk (inverted score). Hover → tooltip; click → 360°. */
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { BAND_COLOR, type Band } from "../lib/format";

interface Ent {
  id: number; name: string; sector: string; village: string; district: string;
  score: number; band: Band;
}

const DISTRICT_POS: Record<string, [number, number]> = {
  Rampur: [-6, -4], Sundarganj: [6, -4], Betulpur: [-6, 4], Nadiya: [6, 4],
};

function Marker({ e, x, z, onClick }: { e: Ent; x: number; z: number; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const h = Math.max(0.4, (100 - e.score) / 22);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const target = hover ? 1.25 : 1;
    ref.current.scale.lerp(new THREE.Vector3(1, target, 1), 0.15);
  });
  return (
    <group position={[x, 0, z]}>
      <mesh
        ref={ref}
        position={[0, h / 2, 0]}
        onClick={onClick}
        onPointerOver={(ev) => { ev.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}>
        <boxGeometry args={[0.55, h, 0.55]} />
        <meshStandardMaterial color={BAND_COLOR[e.band]} roughness={0.5}
          emissive={hover ? BAND_COLOR[e.band] : "#000"} emissiveIntensity={hover ? 0.4 : 0} />
      </mesh>
      {/* roof */}
      <mesh position={[0, h + 0.16, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.5, 0.34, 4]} />
        <meshStandardMaterial color="#8a5a3b" roughness={0.8} />
      </mesh>
      {hover && (
        <Html position={[0, h + 0.9, 0]} center distanceFactor={10} style={{ pointerEvents: "none" }}>
          <div className="card px-2.5 py-1.5 text-xs whitespace-nowrap" style={{ boxShadow: "var(--shadow-lift)" }}>
            <b>{e.name}</b><br />
            <span className="tabular-nums" style={{ color: BAND_COLOR[e.band] }}>
              ● {Math.round(e.score)}/100
            </span> · {e.village}
          </div>
        </Html>
      )}
    </group>
  );
}

function Scene({ enterprises }: { enterprises: Ent[] }) {
  const nav = useNavigate();
  const placed = useMemo(() => {
    const byDistrict: Record<string, Ent[]> = {};
    for (const e of enterprises) (byDistrict[e.district] ??= []).push(e);
    const out: { e: Ent; x: number; z: number }[] = [];
    for (const [d, list] of Object.entries(byDistrict)) {
      const [cx, cz] = DISTRICT_POS[d] ?? [0, 0];
      const cols = Math.ceil(Math.sqrt(list.length));
      list.forEach((e, i) => {
        out.push({
          e,
          x: cx + ((i % cols) - cols / 2 + 0.5) * 1.1,
          z: cz + (Math.floor(i / cols) - cols / 2 + 0.5) * 1.1,
        });
      });
    }
    return out;
  }, [enterprises]);

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[8, 12, 6]} intensity={1.2} />
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[26, 18]} />
        <meshStandardMaterial color="#dfeee0" roughness={1} />
      </mesh>
      {/* district labels */}
      {Object.entries(DISTRICT_POS).map(([d, [x, z]]) => (
        <Html key={d} position={[x, 0.05, z - 3]} center distanceFactor={14}
          style={{ pointerEvents: "none" }}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-forest-800/50">{d}</span>
        </Html>
      ))}
      {placed.map(({ e, x, z }) => (
        <Marker key={e.id} e={e} x={x} z={z} onClick={() => nav(`/a/enterprises/${e.id}`)} />
      ))}
      <OrbitControls enablePan={false} minDistance={8} maxDistance={24}
        maxPolarAngle={Math.PI / 2.4} minPolarAngle={0.4} />
    </>
  );
}

export default function VillageMap({ enterprises }: { enterprises: Ent[] }) {
  return (
    <div style={{ height: 330 }} className="rounded-xl overflow-hidden">
      <Canvas
        dpr={Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 1.5)}
        camera={{ position: [0, 11, 12], fov: 46 }}
        gl={{ antialias: true, powerPreference: "low-power" }}>
        <color attach="background" args={["#faf7f0"]} />
        <Scene enterprises={enterprises} />
      </Canvas>
    </div>
  );
}

/** Login hero — low-poly undulating field, fireflies, soft fog, mouse parallax.
 * Lazy-loaded; capped DPR; falls back to a gradient (handled by Login.tsx). */
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function Field() {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(60, 40, 64, 44);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.35) * 0.7 + Math.cos(y * 0.45) * 0.55 + Math.sin(x * 0.12 + y * 0.2) * 1.1);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useFrame(({ clock, pointer }) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.05) * 0.01;
    ref.current.rotation.x = -Math.PI / 2.35 + pointer.y * 0.02;
    ref.current.rotation.y = pointer.x * 0.03;
  });
  return (
    <mesh ref={ref} geometry={geo} rotation={[-Math.PI / 2.35, 0, 0]} position={[0, -3.5, -6]}>
      <meshStandardMaterial color="#2e8b4f" flatShading roughness={0.85} />
    </mesh>
  );
}

function Fireflies({ count = 90 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 34;
      arr[i * 3 + 1] = Math.random() * 8 - 2.5;
      arr[i * 3 + 2] = -Math.random() * 16;
    }
    return arr;
  }, [count]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.02;
    (ref.current.material as THREE.PointsMaterial).opacity =
      0.65 + Math.sin(clock.elapsedTime * 1.7) * 0.25;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.14} color="#ffe9a8" transparent opacity={0.8} sizeAttenuation />
    </points>
  );
}

function Sun() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * 0.05;
    ref.current.position.set(Math.sin(t) * 10, 5 + Math.cos(t) * 2.2, -14);
  });
  return (
    <group>
      <mesh ref={ref} position={[8, 6, -14]}>
        <sphereGeometry args={[1.9, 24, 24]} />
        <meshBasicMaterial color="#ffd27a" />
      </mesh>
      <pointLight position={[8, 6, -12]} intensity={40} color="#ffcf8a" distance={30} />
    </group>
  );
}

export default function HeroField() {
  return (
    <Canvas
      dpr={Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 1.5)}
      camera={{ position: [0, 1.5, 7], fov: 55 }}
      gl={{ antialias: true, powerPreference: "low-power" }}>
      <color attach="background" args={["#155e33"]} />
      <fog attach="fog" args={["#155e33", 12, 38]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[6, 8, 2]} intensity={1.6} color="#ffe3b3" />
      <Field />
      <Fireflies />
      <Sun />
    </Canvas>
  );
}

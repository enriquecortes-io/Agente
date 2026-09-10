'use client';
import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function BackgroundMesh() {
  const meshRef = useRef<THREE.Mesh>(null);
  const mousePos = useRef(new THREE.Vector2(0.5, 0.5));

  const uniforms = useMemo(() => ({
    u_time: { value: 0 },
    u_mouse: { value: mousePos.current }
  }), []);

  useEffect(() => {
    const updateMouse = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = 1 - (e.clientY / window.innerHeight);
      mousePos.current.set(x, y);
    };
    window.addEventListener('pointermove', updateMouse);
    return () => window.removeEventListener('pointermove', updateMouse);
  }, []);

  useFrame((state) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.u_time.value = state.clock.getElapsedTime();
      material.uniforms.u_mouse.value.copy(mousePos.current);
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -30]}>
      <planeGeometry args={[100, 100]} />
      <shaderMaterial
        transparent
        vertexShader={`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`
          precision mediump float; 
          varying vec2 vUv; 
          uniform float u_time; 
          uniform vec2 u_mouse;
          float voronoi(vec2 x) { 
            vec2 n = floor(x); vec2 f = fract(x); float m = 8.0; 
            for(int j=-1; j<=1; j++) for(int i=-1; i<=1; i++) {
              vec2 g = vec2(float(i),float(j)); 
              float d = dot(g+fract(sin(dot(n+g,vec2(127.1,311.7)))*43758.5453)-f, g+fract(sin(dot(n+g,vec2(127.1,311.7)))*43758.5453)-f);
              if(d<m) m=d; 
            } return sqrt(m); 
          }
          void main() { 
            float v = voronoi(vUv * 4.0 + u_time * 0.04); 
            float glow = pow(1.0 - smoothstep(0.0, 0.55, length(vUv - u_mouse)), 3.0);
            vec3 dynamicColor = 0.6 + 0.4 * cos(u_time * 0.15 + vec3(0.0, 2.0, 4.0));
            gl_FragColor = vec4(vec3(v * 1.1) * dynamicColor, glow * 0.40); 
          }
        `}
        uniforms={uniforms}
      />
    </mesh>
  );
}

export default function AuraVoidBackground() {
  return (
    <div style={{position:'fixed',inset:0,zIndex:0,background:'black',overflow:'hidden',pointerEvents:'none'}}>
      <Canvas camera={{ position: [0, 0.5, 20], fov: 60 }}>
        <BackgroundMesh />
      </Canvas>
    </div>
  );
}

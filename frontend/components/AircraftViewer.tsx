'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, ContactShadows, Html, useProgress } from '@react-three/drei';

function Loader() {
    const { progress } = useProgress();
    return (
        <Html center>
            <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <div className="text-[8px] font-black text-blue-600 uppercase tracking-widest bg-white/90 px-3 py-1.5 rounded-full backdrop-blur-md shadow-xl border border-blue-100 whitespace-nowrap">
                    Loading: {progress.toFixed(0)}%
                </div>
            </div>
        </Html>
    );
}

function Model({ modelPath, modelScale }: { modelPath: string; modelScale: number }) {
    const { scene } = useGLTF(modelPath);
    return <primitive object={scene} scale={modelScale} position={[0, -0.2, 0]} />;
}

export default function AircraftViewer({ modelPath, modelScale }: { modelPath: string; modelScale: number }) {
    return (
        <div className="w-full h-full bg-transparent cursor-grab active:cursor-grabbing relative">
            <Canvas camera={{ position: [10, 2, 0], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true }}>
                <Environment preset="city" />
                <ambientLight intensity={0.6} />
                <directionalLight position={[10, 10, 5]} intensity={1.5} />

                <Suspense fallback={<Loader />}>
                    <Model modelPath={modelPath} modelScale={modelScale} />
                    <ContactShadows position={[0, -0.5, 0]} opacity={0.4} scale={6} blur={2.5} far={4} />
                </Suspense>

                {/* Disabled Zoom so it doesn't hijack the user's mouse scroll inside the card */}
                <OrbitControls
                    autoRotate
                    autoRotateSpeed={0.8}
                    enablePan={false}
                    enableZoom={false}
                    maxPolarAngle={Math.PI / 2 - 0.05}
                />
            </Canvas>
        </div>
    );
}
'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useRef, useState } from 'react';
import { useReplay } from '@/lib/ReplayContext';
import { Loader2 } from 'lucide-react';

export default function UnityReplayLoader() {
  const { setUnityInstance } = useReplay();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unityInstanceRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  const isInitializingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    console.log("UnityReplayLoader mounted. isMountedRef.current = true");

    if (typeof window === 'undefined') return;

    let handleLoad: (() => void) | null = null;
    let handleError: (() => void) | null = null;
    let script: HTMLScriptElement | null = null;

    const initializeUnity = () => {
      if (!canvasRef.current) {
        console.log("initializeUnity skipped: canvasRef.current is null");
        return;
      }
      if (!isMountedRef.current) {
        console.log("initializeUnity skipped: component not mounted");
        return;
      }
      if (unityInstanceRef.current) {
        console.log("initializeUnity skipped: unityInstance already exists");
        return;
      }
      if (isInitializingRef.current) {
        console.log("initializeUnity skipped: createUnityInstance already in progress");
        return;
      }

      isInitializingRef.current = true;
      console.log("calling createUnityInstance");

      const config = {
        dataUrl: "/unity-webgl/Build/unity-webgl.data.unityweb",
        frameworkUrl: "/unity-webgl/Build/unity-webgl.framework.js.unityweb",
        codeUrl: "/unity-webgl/Build/unity-webgl.wasm.unityweb",
        streamingAssetsUrl: "StreamingAssets",
        companyName: "DefaultCompany",
        productName: "Aerotwin",
        productVersion: "0.1.0",
      };

      (window as any).createUnityInstance(canvasRef.current, config, (prog: number) => {
        const percent = Math.round(prog * 100);
        console.log(`unity progress: ${percent}%`);
        setProgress(percent);
      })
      .then((instance: any) => {
        isInitializingRef.current = false;
        if (!isMountedRef.current) {
          console.log("Unity instance resolved but component was unmounted. Quitting instance...");
          instance.Quit().then(() => {
            console.log("Unity instance quitted after unmount.");
          });
          return;
        }
        unityInstanceRef.current = instance;
        setUnityInstance(instance);
        setIsLoaded(true);
        console.log("Unity instance initialized successfully and registered in context.");
      })
      .catch((err: any) => {
        isInitializingRef.current = false;
        console.error("Failed to initialize Unity:", err);
        setError("Failed to initialize 3D Replay engine. Ensure WebGL is supported.");
      });
    };

    const scriptId = 'unity-webgl-loader';
    script = document.getElementById(scriptId) as HTMLScriptElement;

    if (!script) {
      console.log("Branch: Script tag does not exist. Injecting script...");
      script = document.createElement('script');
      script.id = scriptId;
      script.src = '/unity-webgl/Build/unity-webgl.loader.js';
      script.async = true;

      handleLoad = () => {
        console.log("loader script ready (newly injected script loaded)");
        initializeUnity();
      };
      handleError = () => {
        console.error("Failed to load script: script onerror triggered");
        setError("Failed to load 3D Replay engine dependencies. Has the WebGL build been placed in public/unity-webgl?");
      };

      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);
      document.body.appendChild(script);
    } else {
      // Script already exists
      if ((window as any).createUnityInstance) {
        console.log("Branch: Script tag exists and window.createUnityInstance is already defined.");
        initializeUnity();
      } else {
        console.log("Branch: Script tag exists but window.createUnityInstance is NOT yet defined. Attaching listener...");
        handleLoad = () => {
          console.log("loader script ready (existing script loaded)");
          initializeUnity();
        };
        handleError = () => {
          console.error("Failed to load script: existing script onerror triggered");
          setError("Failed to load 3D Replay engine dependencies.");
        };
        script.addEventListener('load', handleLoad);
        script.addEventListener('error', handleError);
      }
    }

    return () => {
      console.log("UnityReplayLoader cleanup. isMountedRef.current = false");
      isMountedRef.current = false;

      if (script) {
        if (handleLoad) {
          script.removeEventListener('load', handleLoad);
        }
        if (handleError) {
          script.removeEventListener('error', handleError);
        }
      }

      if (unityInstanceRef.current) {
        console.log("Quitting Unity instance on cleanup...");
        unityInstanceRef.current.Quit().then(() => {
          console.log("Unity instance destroyed successfully");
        });
        unityInstanceRef.current = null;
        setUnityInstance(null);
      }
    };
  }, [setUnityInstance]);

  return (
    <div className="relative w-full h-full bg-slate-950 flex items-center justify-center rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Canvas */}
      <canvas
        id="unity-canvas"
        ref={canvasRef}
        className={`w-full h-full object-contain bg-slate-950 transition-opacity duration-1000 ${
          isLoaded ? 'opacity-100' : 'opacity-0 pointer-events-none absolute'
        }`}
        style={{ aspectRatio: '16/9' }}
      />

      {/* Loading State Overlay */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 z-10">
          <div className="max-w-md w-full text-center space-y-6">
            {error ? (
              <div className="space-y-4">
                <div className="text-rose-500 text-lg font-bold">Initialization Error</div>
                <p className="text-slate-400 text-sm leading-relaxed">{error}</p>
                <div className="text-xs text-slate-600 font-mono">
                  Check console for details. Ensure WebGL build is exported to `frontend/public/unity-webgl/`.
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="relative flex justify-center">
                  <div className="w-16 h-16 rounded-full border border-blue-500/20 flex items-center justify-center animate-pulse">
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-base font-bold tracking-wide text-white">Loading 3D Airport Environment</h3>
                  <p className="text-xs text-slate-500">Initializing simulation replay clock and passenger assets</p>
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">
                    <span>{progress < 100 ? 'Streaming' : 'Readying'}</span>
                    <span>{progress}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

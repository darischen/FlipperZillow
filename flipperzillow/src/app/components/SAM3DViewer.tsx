'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

interface SAM3DViewerProps {
  glbUrl: string;
  onClose: () => void;
}

export default function SAM3DViewer({ glbUrl, onClose }: SAM3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    // Load GLB
    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        const model = gltf.scene;

        // Center and scale the model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        model.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 4 / maxDim;
        model.scale.multiplyScalar(scale);

        scene.add(model);
        setLoading(false);

        // Setup rotation animation
        let animationFrameId: number;
        const animate = () => {
          animationFrameId = requestAnimationFrame(animate);

          // Slow rotation
          model.rotation.y += 0.005;

          renderer.render(scene, camera);
        };

        animate();

        // Cleanup on unmount
        return () => cancelAnimationFrame(animationFrameId);
      },
      (progress) => {
        const percentComplete = (progress.loaded / progress.total) * 100;
        console.log(`[SAM3DViewer] Loading: ${percentComplete.toFixed(2)}%`);
      },
      (err) => {
        console.error('[SAM3DViewer] Load error:', err);
        setError('Failed to load 3D model');
        setLoading(false);
      }
    );

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [glbUrl]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: 8,
          color: 'white',
          padding: '8px 16px',
          fontSize: 14,
          cursor: 'pointer',
          zIndex: 101,
        }}
      >
        ✕ Close
      </button>

      {/* Info text */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          background: 'rgba(0, 0, 0, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: 8,
          padding: '12px 16px',
          color: 'rgba(255, 255, 255, 0.8)',
          fontSize: 12,
          zIndex: 101,
        }}
      >
        <p style={{ margin: '0 0 4px 0' }}>Use mouse to rotate · Scroll to zoom</p>
        <p style={{ margin: 0, opacity: 0.6 }}>3D model generated by SAM 3D Objects</p>
      </div>

      {/* Loading/Error state */}
      {(loading || error) && (
        <div
          style={{
            textAlign: 'center',
            color: 'white',
          }}
        >
          {loading && (
            <div>
              <p style={{ fontSize: 16, marginBottom: 8 }}>⏳ Loading 3D model...</p>
              <p style={{ fontSize: 12, opacity: 0.6 }}>This may take a moment</p>
            </div>
          )}
          {error && (
            <div>
              <p style={{ fontSize: 16, color: '#FF6B6B', marginBottom: 8 }}>✕ {error}</p>
              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255, 100, 100, 0.2)',
                  border: '1px solid rgba(255, 100, 100, 0.4)',
                  borderRadius: 4,
                  color: 'rgba(255, 150, 150, 1)',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}

      {/* Three.js canvas container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
